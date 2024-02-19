import { DhtAddress, NodeType, getRawFromDhtAddress } from '@streamr/dht'
import { NetworkNode } from '@streamr/trackerless-network'
import { 
    StreamrClient,
    NetworkNodeType,
    NetworkPeerDescriptor,
    PeerDescriptor,
    Stream,
    StreamCreationEvent,
    StreamID,
    StreamMetadata,
    StreamPermission
} from 'streamr-client'
import { Inject, Service } from 'typedi'
import { CONFIG_TOKEN, Config } from './Config'
import { NetworkNodeFacade } from './crawler/NetworkNodeFacade'
import { count } from './utils'

export const peerDescriptorTranslator = (json: NetworkPeerDescriptor): PeerDescriptor => {
    const type = json.type === NetworkNodeType.BROWSER ? NodeType.BROWSER : NodeType.NODEJS
    return {
        ...json,
        nodeId: getRawFromDhtAddress(json.nodeId as DhtAddress),
        type
    }
}

@Service() 
export class StreamrClientFacade {

    private readonly client: StreamrClient

    constructor(
        @Inject(CONFIG_TOKEN) config: Config
    ) {
        this.client = new StreamrClient(config.client)
    }

    getAllStreams(): AsyncIterable<Stream> {
        return this.client.searchStreams('/', undefined)
    }

    searchStreams(owner: string): AsyncIterable<Stream> {
        return this.client.searchStreams(undefined, {
            user: owner,
            allowPublic: false,
            allOf: [StreamPermission.GRANT]
        })
    }

    async getPublisherOrSubscriberCount(streamId: string, permission: StreamPermission.PUBLISH | StreamPermission.SUBSCRIBE): Promise<number | null> {
        const isPublic = await this.client.hasPermission({
            streamId,
            public: true,
            permission
        })
        if (isPublic) {
            return null
        } else {
            let items
            if (permission === StreamPermission.PUBLISH) {
                items = this.client.getStreamPublishers(streamId) 
            } else if (permission === StreamPermission.SUBSCRIBE) {
                items = this.client.getStreamSubscribers(streamId) 
            } else {
                throw new Error('assertion failed')
            }
            return count(items)
        }
    }

    async getStreamMetadata(streamId: StreamID): Promise<StreamMetadata> {
        const stream = await this.client.getStream(streamId)
        return stream.getMetadata()
    }

    on(name: 'createStream', listener: (payload: StreamCreationEvent) => void): void {
        this.client.on(name, listener)
    }

    off(name: 'createStream', listener: (payload: StreamCreationEvent) => void): void {
        this.client.off(name, listener)
    }

    async getNetworkNodeFacade(): Promise<NetworkNodeFacade> {
        const node = (await this.client.getNode()) as NetworkNode
        return new NetworkNodeFacade(node)
    }

    getEntryPoints(): PeerDescriptor[] {
        return this.client.getConfig().network.controlLayer.entryPoints!.map(peerDescriptorTranslator)
    }

    async destroy(): Promise<void> {
        await this.client.destroy()
    }
}
