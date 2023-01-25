import { Logger } from '@streamr/utils'
import { difference } from 'lodash'
import fetch from 'node-fetch'
import { Stream, StreamPermission } from 'streamr-client'
import { Inject, Service } from 'typedi'
import { Config, CONFIG_TOKEN } from '../Config'
import { StreamrClientFacade } from '../StreamrClientFacade'
import { StreamRepository } from '../StreamRepository'
import { collect, retry } from '../utils'
import { MessageRateAnalyzer } from './MessageRateAnalyzer'

const logger = new Logger(module)

@Service()
export class Crawler {

    private readonly messageRateAnalyzer: MessageRateAnalyzer
    private readonly database: StreamRepository
    private readonly client: StreamrClientFacade
    private readonly config: Config

    constructor(
        @Inject() messageRateAnalyzer: MessageRateAnalyzer,
        @Inject() database: StreamRepository,
        @Inject() client: StreamrClientFacade,
        @Inject(CONFIG_TOKEN) config: Config
    ) {
        this.messageRateAnalyzer = messageRateAnalyzer
        this.database = database
        this.client = client
        this.config = config
    }

    async updateStreams(): Promise<void> {
        // wrap this.client.getAllStreams() with retry because in streamr-docker-dev environment
        // the graph-node dependency may not be available immediately after the service has
        // been started
        const contractStreams = await retry(() => collect(this.client.getAllStreams()), 'Query streams')
        logger.info(`Contract streams: ${contractStreams.length}`)
        for (const stream of contractStreams) {
            logger.info(`Analyze: ${stream.id}`)
            const peerCount = await this.getPeerCount(stream.id)
            const messagesPerSecond = (peerCount > 0) ? await this.messageRateAnalyzer.getRate(stream) : 0
            const publisherCount = await this.client.getPublisherOrSubscriberCount(stream.id, StreamPermission.PUBLISH)
            const subscriberCount = await this.client.getPublisherOrSubscriberCount(stream.id, StreamPermission.SUBSCRIBE)
            logger.info('Replace: %s', stream.id)
            await this.database.replaceStream({
                id: stream.id,
                peerCount,
                messagesPerSecond,
                publisherCount,
                subscriberCount
            })
        }
        await this.cleanupDeletedStreams(contractStreams)
        logger.info(`Index updated`)
    }

    private async getPeerCount(streamId: string): Promise<number> {
        const trackerUrls = this.config.trackers.map((t) => t.http)
        for (const trackerUrl of trackerUrls) {
            const response = await fetch(`${trackerUrl}/topology/${encodeURIComponent(streamId)}`)
            const json = await response.json()
            const streamParts = Object.keys(json)
            if (streamParts.length > 0) {
                let peerCount = 0
                streamParts.forEach((streamPartId: string) => {
                    peerCount += Object.keys(json[streamPartId]).length
                })
                return peerCount
            }
        }
        return 0
    }

    private async cleanupDeletedStreams(contractStreams: Stream[]): Promise<void> {
        const contractStreamIds = contractStreams.map((s) => s.id)
        const databaseStreamIds = await this.database.getIds()
        const removedStreamsIds = difference(databaseStreamIds, contractStreamIds)
        for (const streamId of removedStreamsIds) {
            logger.info('Delete: %s', streamId)
            await this.database.deleteStream(streamId)
        }
    }
}
