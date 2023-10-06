import { StreamID, StreamPartIDUtils } from '@streamr/protocol'
import { Logger } from '@streamr/utils'
import { difference, sortBy, uniq } from 'lodash'
import fetch, { Response } from 'node-fetch'
import pLimit from 'p-limit'
import { Stream, StreamCreationEvent, StreamMetadata, StreamPermission } from 'streamr-client'
import { Inject, Service } from 'typedi'
import { CONFIG_TOKEN, Config } from '../Config'
import { StreamRepository } from '../StreamRepository'
import { StreamrClientFacade } from '../StreamrClientFacade'
import { collect, retry, withThrottling } from '../utils'
import { NetworkNodeFacade } from './NetworkNodeFacade'
import { MAX_SUBSCRIPTION_COUNT, SubscribeGate } from './SubscribeGate'
import { getMessageRate } from './messageRate'
import { wait } from '@streamr/utils'

const MAX_TRACKER_QUERIES_PER_SECOND = 10 // TODO from config file, could fine-tune so that queries are limited separately for each Tracker
const NEW_STREAM_ANALYSIS_DELAY = 60 * 1000 // TODO from config file

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

const RECOVERY_DELAY = 5 * 60 * 1000  // TODO from config

@Service()
export class Crawler {

    private readonly networkNode: NetworkNodeFacade
    private readonly subscribeGate: SubscribeGate
    private readonly database: StreamRepository
    private readonly client: StreamrClientFacade
    private readonly config: Config
    private readonly fetchTrackerTopology: (trackerUrl: string, streamId: StreamID) => Promise<Response>
    private readonly onStreamCreated: (payload: StreamCreationEvent) => Promise<void>

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
        this.onStreamCreated = async (payload: StreamCreationEvent) => {
            logger.info(`New stream: ${payload.streamId}`)
            // first write some data quickly to the database without analyzing the stream
            // - assume no peers and no traffic
            // - assume that no explicit permissions have been granted yet (the creator
            //   is the only publisher and subscriber
            await this.database.replaceStream({
                id: payload.streamId,
                description: payload.metadata.description ?? null,
                peerCount: 0,
                messagesPerSecond: 0,
                publisherCount: 1,
                subscriberCount: 1
            })
            // we wait some time so that The Graph has been indexed the new stream
            // and it can provider valid publisher and subscriber counts to us
            await wait(NEW_STREAM_ANALYSIS_DELAY)
            await this.analyzeStream(payload.streamId, payload.metadata)
        }
    }

    start(iterationCount: number | undefined = undefined): void {
        setImmediate(async () => {
            this.client.on('createStream', this.onStreamCreated)
            // eslint-disable-next-line no-constant-condition
            let iterationIndex = 0
            while ((iterationCount === undefined) || (iterationIndex < iterationCount)) {
                try {
                    await this.crawlContractStreams()
                } catch (e) {
                    logger.error('Error', { error: e })
                    await wait(RECOVERY_DELAY)
                }
                await wait(this.config.crawler.iterationDelay)
                iterationIndex++
            }
            this.client.off('createStream', this.onStreamCreated)
        })
    }

    private async crawlContractStreams(): Promise<void> {
        // wrap this.client.getAllStreams() with retry because in streamr-docker-dev environment
        // the graph-node dependency may not be available immediately after the service has
        // been started
        const contractStreams = await retry(() => collect(this.client.getAllStreams()), 'Query streams')
        const databaseStreams = await this.database.getAllStreams()
        logger.info('Crawling', { contractStreams: contractStreams.length, databaseStreams: databaseStreams.length })
        const sortedContractStreams = sortBy(contractStreams, getCrawlOrderComparator(databaseStreams))

        // note that the task execution is primary limited by SubscribeGate, the concurrency setting
        // defined here is less relevant (but MAX_SUBSCRIPTION_COUNT is a good approximation
        // for the worker thread count as streams typically used only one partition)
        const workedThreadLimit = pLimit(MAX_SUBSCRIPTION_COUNT)
        await Promise.all(sortedContractStreams.map((stream: Stream) => {
            return workedThreadLimit(() => this.analyzeStream(stream.id, stream.getMetadata()))
        }))

        await this.cleanupDeletedStreams(contractStreams, databaseStreams)
        logger.info(`Crawled`)
    }

    private async analyzeStream(id: StreamID, metadata: StreamMetadata): Promise<void> {
        logger.info(`Analyze: ${id}`)
        try {
            const peersByPartition = await this.getPeersByPartition(id)
            const peerIds = uniq(peersByPartition.map((peer) => peer.peerIds).flat())
            const peerCount = peerIds.length
            const messagesPerSecond = (peerCount > 0)
                ? await getMessageRate(
                    id, 
                    peersByPartition.map((peer) => peer.partition),
                    this.networkNode,
                    this.subscribeGate,
                    this.config
                )
                : 0
            const publisherCount = await this.client.getPublisherOrSubscriberCount(id, StreamPermission.PUBLISH)
            const subscriberCount = await this.client.getPublisherOrSubscriberCount(id, StreamPermission.SUBSCRIBE)
            logger.info(`Replace: ${id}`)
            await this.database.replaceStream({
                id,
                description: metadata.description ?? null,
                peerCount,
                messagesPerSecond,
                publisherCount,
                subscriberCount
            })
        } catch (e: any) {
            logger.error(`Failed to analyze: ${id}`, e)
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
            logger.info(`Delete: ${streamId}`)
            await this.database.deleteStream(streamId)
        }
    }
}
