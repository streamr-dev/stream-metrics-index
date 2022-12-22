import { createNetworkNode, NetworkNode } from '@streamr/network-node'
import { Logger, MetricsContext, wait } from '@streamr/utils'
import { Stream, StreamMessage } from 'streamr-client'
import { Inject, Service } from 'typedi'
import { Config, CONFIG_TOKEN } from '../Config'

const logger = new Logger(module)

@Service()
export class MessageRateAnalyzer {

    private readonly node: NetworkNode
    private readonly config: Config

    constructor(
        @Inject(CONFIG_TOKEN) config: Config
    ) {
        this.config = config
        this.node = this.startNode()
    }

    private startNode() {
        logger.info('Crawler node: %s', this.config.networkNode.id)
        return createNetworkNode({
            trackers: this.config.trackers,
            metricsContext: new MetricsContext(),
            ...this.config.networkNode
        })
    }

    async getRate(stream: Stream): Promise<number> {
        for (const streamPartId of stream.getStreamParts()) {
            this.node.subscribe(streamPartId)
        }
        let messageCount = 0
        const messageListener = (msg: StreamMessage) => {
            if (msg.getStreamId() === stream.id) {
                messageCount++
            }
        }
        this.node.addMessageListener(messageListener)
        await wait(this.config.crawler.subscribeDuration)
        for (const streamPartId of stream.getStreamParts()) {
            this.node.unsubscribe(streamPartId)
        }
        this.node.removeMessageListener(messageListener)
        return messageCount / (this.config.crawler.subscribeDuration / 1000)
    }

    destroy(): void {
        this.node.stop()
    }
}
