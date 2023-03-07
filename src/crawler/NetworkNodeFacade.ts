import { createNetworkNode, NetworkNode } from '@streamr/network-node'
import { Logger, MetricsContext } from '@streamr/utils'
import { StreamMessage, StreamPartID } from 'streamr-client'
import { Inject, Service } from 'typedi'
import { Config, CONFIG_TOKEN } from '../Config'

const logger = new Logger(module)

@Service() 
export class NetworkNodeFacade {

    private readonly node: NetworkNode

    constructor(
        @Inject(CONFIG_TOKEN) config: Config
    ) {
        logger.info('Network node: %s', config.networkNode.id)
        this.node = createNetworkNode({
            trackers: config.trackers,
            metricsContext: new MetricsContext(),
            ...config.networkNode
        })
    }

    subscribe(streamPartId: StreamPartID): void {
        this.node.subscribe(streamPartId)
    }

    unsubscribe(streamPartId: StreamPartID): void {
        this.node.unsubscribe(streamPartId)
    }

    addMessageListener(listener: (msg: StreamMessage) => void): void {
        this.node.addMessageListener(listener)
    }

    removeMessageListener(listener: (msg: StreamMessage) => void): void {
        this.node.removeMessageListener(listener)
    }

    destroy(): void {
        this.node.stop()
    }
}
