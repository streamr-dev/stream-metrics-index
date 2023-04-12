import EventEmitter3 from 'eventemitter3'
import { createNetworkNode, NetworkNode } from '@streamr/network-node'
import { Logger, MetricsContext } from '@streamr/utils'
import { StreamMessage, StreamPartID } from 'streamr-client'
import { Inject, Service } from 'typedi'
import { Config, CONFIG_TOKEN } from '../Config'

export interface Events {
    subscribe: () => void
    unsubscribe: () => void
}

const logger = new Logger(module)

@Service() 
export class NetworkNodeFacade {

    private readonly node: NetworkNode
    private readonly eventEmitter: EventEmitter3<Events> = new EventEmitter3()

    constructor(
        @Inject(CONFIG_TOKEN) config: Config
    ) {
        const nodeId = `${config.networkNode.id}#${Date.now()}`
        logger.info('Network node: %s', nodeId)
        this.node = createNetworkNode({
            ...config.networkNode,
            trackers: config.trackers,
            metricsContext: new MetricsContext(),
            id: nodeId,
            // TODO webrtcPortRange and webrtcMaxMessageSize from config file
            webrtcPortRange: {
                min: 6000,
                max: 65535
            },
            webrtcMaxMessageSize: 1048576
        })
    }

    subscribe(streamPartId: StreamPartID): void {
        this.node.subscribe(streamPartId)
        this.eventEmitter.emit('subscribe')
    }

    unsubscribe(streamPartId: StreamPartID): void {
        this.node.unsubscribe(streamPartId)
        this.eventEmitter.emit('unsubscribe')
    }

    addMessageListener(listener: (msg: StreamMessage) => void): void {
        this.node.addMessageListener(listener)
    }

    removeMessageListener(listener: (msg: StreamMessage) => void): void {
        this.node.removeMessageListener(listener)
    }

    getSubscriptions(): StreamPartID[] {
        return Array.from(this.node.getStreamParts())
    }

    on<T extends keyof Events>(eventName: T, listener: Events[T]): void {
        this.eventEmitter.on(eventName, listener as any)
    }

    destroy(): void {
        this.node.stop()
    }
}
