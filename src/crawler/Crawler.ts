import { StreamID, StreamPartIDUtils } from '@streamr/protocol'
import { Logger } from '@streamr/utils'
import { difference, sortBy, uniq } from 'lodash'
import fetch, { Response } from 'node-fetch'
import pLimit from 'p-limit'
import { Stream, StreamPermission } from 'streamr-client'
import { Inject, Service } from 'typedi'
import { CONFIG_TOKEN, Config } from '../Config'
import { StreamRepository } from '../StreamRepository'
import { StreamrClientFacade } from '../StreamrClientFacade'
import { collect, retry, withThrottling } from '../utils'
import { NetworkNodeFacade } from './NetworkNodeFacade'
import { NewStreamsPoller } from './NewStreamsPoller'
import { MAX_SUBSCRIPTION_COUNT, SubscribeGate } from './SubscribeGate'
import { getMessageRate } from './messageRate'

const MAX_TRACKER_QUERIES_PER_SECOND = 10 // TODO from config file, could fine-tune so that queries are limited separately for each Tracker
const NEW_STREAM_POLL_INTERVAL = 30 * 60 * 1000 // TODO from config file

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
    private readonly subscribeGate: SubscribeGate
    private readonly database: StreamRepository
    private readonly client: StreamrClientFacade
    private readonly config: Config
    private readonly fetchTrackerTopology: (trackerUrl: string, streamId: StreamID) => Promise<Response>

    constructor(
        @Inject() networkNode: NetworkNodeFacade,
        @Inject() subscribeGate: SubscribeGate,
        @Inject() database: StreamRepository,
        @Inject() client: StreamrClientFacade,
        @Inject(CONFIG_TOKEN) config: Config
    ) {
        this.networkNode = networkNode
        this.subscribeGate = subscribeGate
        this.database = database
        this.client = client
        this.config = config
        this.fetchTrackerTopology = withThrottling((trackerUrl: string, streamId: StreamID) => {
            return fetch(`${trackerUrl}/topology/${encodeURIComponent(streamId)}`)
        }, MAX_TRACKER_QUERIES_PER_SECOND)
    }

    async updateStreams(): Promise<void> {

        const newStreamsPoller = new NewStreamsPoller((newStreams) => {
            return Promise.all(newStreams.map((stream) => this.analyzeStream(stream)))
        }, this.config.contracts.theGraphUrl, this.client, NEW_STREAM_POLL_INTERVAL)
        newStreamsPoller.start()
        
        // wrap this.client.getAllStreams() with retry because in streamr-docker-dev environment
        // the graph-node dependency may not be available immediately after the service has
        // been started
        const contractStreams = await retry(() => collect(this.client.getAllStreams()), 'Query streams')
        const databaseStreams = await this.database.getAllStreams()
        logger.info(`Start: contractStreams=${contractStreams.length}, databaseStreams=${databaseStreams.length}`)
        const sortedContractStreams = sortBy(contractStreams, getCrawlOrderComparator(databaseStreams))

        // note that the task execution is primary limited by SubscribeGate, the concurrency setting
        // defined here is less relevant (but MAX_SUBSCRIPTION_COUNT is a good approximation
        // for the worker thread count as streams typically used only one partition)
        const workedThreadLimit = pLimit(MAX_SUBSCRIPTION_COUNT)
        await Promise.all(sortedContractStreams.map((stream: Stream) => {
            return workedThreadLimit(() => this.analyzeStream(stream))
        }))

        await newStreamsPoller.destroy()
        await this.cleanupDeletedStreams(contractStreams, databaseStreams)
        logger.info(`Index updated`)
    }

    private async analyzeStream(stream: Stream): Promise<void> {
        logger.info(`Analyze: ${stream.id}`)
        try {
            const peersByPartition = await this.getPeersByPartition(stream.id)
            const peerIds = uniq(peersByPartition.map((peer) => peer.peerIds).flat())
            const peerCount = peerIds.length
            const messagesPerSecond = (peerCount > 0) 
                ? await getMessageRate(
                    stream.id, 
                    peersByPartition.map((peer) => peer.partition),
                    this.networkNode,
                    this.subscribeGate,
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
        } catch (e: any) {
            logger.error(`Failed to analyze: ${stream.id}`, e)
        }
    }

    private async getPeersByPartition(streamId: StreamID): Promise<{ partition: number, peerIds: string[] }[]> {
        const trackerUrls = this.config.trackers.map((t) => t.http)
        const topologySummaries = await Promise.all(trackerUrls.map(async (trackerUrl) => {
            const response = await this.fetchTrackerTopology(trackerUrl, streamId)
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
