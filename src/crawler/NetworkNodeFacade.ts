import { PeerDescriptor } from '@streamr/dht'
import { NetworkNode, NodeInfo, StreamMessage, streamPartIdToDataKey } from '@streamr/trackerless-network'
import { StreamPartID } from '@streamr/utils'
import EventEmitter3 from 'eventemitter3'
import { Config } from '../Config'

export interface Events {
    subscribe: () => void
    unsubscribe: () => void
}

export class NetworkNodeFacade {

    private readonly node: NetworkNode
    private readonly config: Config
    private readonly eventEmitter: EventEmitter3<Events> = new EventEmitter3()

    constructor(
        node: NetworkNode,
        config: Config
    ) {
        this.node = node
        this.config = config
    }

    async subscribe(streamPartId: StreamPartID): Promise<void> {
        const timeout = this.config.crawler.subscribeJoinTimeout
        await this.node.join(streamPartId, { minCount: 1, timeout })
        this.eventEmitter.emit('subscribe')
    }

    async unsubscribe(streamPartId: StreamPartID): Promise<void> {
        await this.node.leave(streamPartId)
        this.eventEmitter.emit('unsubscribe')
    }

    addMessageListener(listener: (msg: StreamMessage) => void): void {
        this.node.addMessageListener(listener)
    }

    removeMessageListener(listener: (msg: StreamMessage) => void): void {
        this.node.removeMessageListener(listener)
    }

    getSubscriptionCount(): number {
        return Array.from(this.node.getStreamParts()).length
    }

    async fetchNodeInfo(peerDescriptor: PeerDescriptor): Promise<NodeInfo> {
        return await this.node.fetchNodeInfo(peerDescriptor)
    }

    async fetchStreamPartEntryPoints(streamPartId: StreamPartID): Promise<PeerDescriptor[]> {
        const key = streamPartIdToDataKey(streamPartId)
        return (await this.node.stack.getControlLayerNode().fetchDataFromDht(key))
            .filter((entry) => !entry.deleted)
            .map((entry) => PeerDescriptor.fromBinary(entry.data!.value))
    }

    on<T extends keyof Events>(eventName: T, listener: Events[T]): void {
        this.eventEmitter.on(eventName, listener as any)
    }
}
