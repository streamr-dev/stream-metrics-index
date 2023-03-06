import { createNetworkNode, NetworkNode } from '@streamr/network-node'
import { StreamID, toStreamPartID } from '@streamr/protocol'
import { Logger, MetricsContext, wait } from '@streamr/utils'
import { StreamMessage } from 'streamr-client'
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

    async getRate(streamId: StreamID, partitions: number[]): Promise<number> {
        let messageCount = 0
        const messageListener = (msg: StreamMessage) => {
            if (msg.getStreamId() === streamId) {
                messageCount++
            }
        }
        this.node.addMessageListener(messageListener)
        for (const partition of partitions) {
            const streamPartId = toStreamPartID(streamId, partition)
            logger.info('Listen: %s', streamPartId)
            this.node.subscribe(streamPartId)
            await wait(this.config.crawler.subscribeDuration)
            this.node.unsubscribe(streamPartId)
        }
        this.node.removeMessageListener(messageListener)
        return messageCount / (this.config.crawler.subscribeDuration / 1000)
    }

    destroy(): void {
        this.node.stop()
    }
}
