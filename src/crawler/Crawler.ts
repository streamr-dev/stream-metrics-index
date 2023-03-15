import { StreamID, StreamPartIDUtils } from '@streamr/protocol'
import { Logger } from '@streamr/utils'
import { difference, sortBy, uniq } from 'lodash'
import fetch from 'node-fetch'
import { Stream, StreamPermission } from 'streamr-client'
import { Inject, Service } from 'typedi'
import { Config, CONFIG_TOKEN } from '../Config'
import { StreamrClientFacade } from '../StreamrClientFacade'
import { StreamRepository } from '../StreamRepository'
import { collect, retry } from '../utils'
import { getMessageRate } from './messageRate'
import { NetworkNodeFacade } from './NetworkNodeFacade'

const logger = new Logger(module)

const getCrawlOrderComparator = (databaseStreams: { id: string, crawlTimestamp: number }[]) => {
    // first all streams, which have not been crawled yet
    // then other streams, most recently crawled last
    return (stream: Stream) => {
        const databaseStream = databaseStreams.find((s) => s.id === stream.id)
        if (databaseStream !== undefined) {
            return databaseStream.crawlTimestamp
        } else {
            return 0
        }
    }
}

@Service()
export class Crawler {

    private readonly networkNode: NetworkNodeFacade
    private readonly database: StreamRepository
    private readonly client: StreamrClientFacade
    private readonly config: Config

    constructor(
        @Inject() networkNode: NetworkNodeFacade,
        @Inject() database: StreamRepository,
        @Inject() client: StreamrClientFacade,
        @Inject(CONFIG_TOKEN) config: Config
    ) {
        this.networkNode = networkNode
        this.database = database
        this.client = client
        this.config = config
    }

    async updateStreams(): Promise<void> {
        // wrap this.client.getAllStreams() with retry because in streamr-docker-dev environment
        // the graph-node dependency may not be available immediately after the service has
        // been started
        const contractStreams = await retry(() => collect(this.client.getAllStreams()), 'Query streams')
        const databaseStreams = await this.database.getAllStreams()
        logger.info(`Start: contractStreams=${contractStreams.length}, databaseStreams=${databaseStreams.length}`)
        const sortedContractStreams = sortBy(contractStreams, getCrawlOrderComparator(databaseStreams))
        for (const stream of sortedContractStreams) {
            logger.info(`Analyze: ${stream.id}`)
            const peersByPartition = await this.getPeersByPartition(stream.id)
            const peerIds = uniq(peersByPartition.map((peer) => peer.peerIds).flat())
            const peerCount = peerIds.length
            const messagesPerSecond = (peerCount > 0) 
                ? await getMessageRate(
                    stream.id, 
                    peersByPartition.map((peer) => peer.partition),
                    this.networkNode,
                    this.config
                )
                : 0
            const publisherCount = await this.client.getPublisherOrSubscriberCount(stream.id, StreamPermission.PUBLISH)
            const subscriberCount = await this.client.getPublisherOrSubscriberCount(stream.id, StreamPermission.SUBSCRIBE)
            logger.info('Replace: %s', stream.id)
            await this.database.replaceStream({
                id: stream.id,
                description: stream.getMetadata().description ?? null,
                peerCount,
                messagesPerSecond,
                publisherCount,
                subscriberCount
            })
        }
        await this.cleanupDeletedStreams(contractStreams, databaseStreams)
        logger.info(`Index updated`)
    }

    private async getPeersByPartition(streamId: StreamID): Promise<{ partition: number, peerIds: string[] }[]> {
        const trackerUrls = this.config.trackers.map((t) => t.http)
        const topologySummaries = await Promise.all(trackerUrls.map(async (trackerUrl) => {
            const response = await fetch(`${trackerUrl}/topology/${encodeURIComponent(streamId)}`)
            const json = await response.json()
            const streamParts = Object.keys(json).map((key) => StreamPartIDUtils.parse(key))
            return streamParts.map((streamPart) => {
                return {
                    partition: StreamPartIDUtils.getStreamPartition(streamPart),
                    peerIds: Object.keys(json[streamPart])
                }
            })
        }))
        return topologySummaries.flat()
    }

    private async cleanupDeletedStreams(contractStreams: Stream[], databaseStreams: { id: string }[]): Promise<void> {
        const contractStreamIds = contractStreams.map((s) => s.id)
        const databaseStreamIds = databaseStreams.map((s) => s.id)
        const removedStreamsIds = difference(databaseStreamIds, contractStreamIds)
        for (const streamId of removedStreamsIds) {
            logger.info('Delete: %s', streamId)
            await this.database.deleteStream(streamId)
        }
    }
}
