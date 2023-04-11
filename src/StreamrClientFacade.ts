import StreamrClient, { Stream, StreamID, StreamPermission } from 'streamr-client'
import { Inject, Service } from 'typedi'
import { CONFIG_TOKEN, Config } from './Config'
import { count } from './utils'

@Service() 
export class StreamrClientFacade {

    private readonly client: StreamrClient

    constructor(
        @Inject(CONFIG_TOKEN) config: Config
    ) {
        this.client = new StreamrClient({
            network: {
                trackers: config.trackers,
                ...config.networkNode
            },
            contracts: config.contracts 
        })
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

    getStream(id: StreamID): Promise<Stream> {
        return this.client.getStream(id)
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

    async destroy(): Promise<void> {
        await this.client.destroy()
    }
}
