import 'reflect-metadata'

import { NodeType, createRandomDhtAddress, getDhtAddressFromRaw, getRawFromDhtAddress } from '@streamr/dht'
import { NetworkNode, createNetworkNode } from '@streamr/trackerless-network'
import { setAbortableInterval, waitForCondition } from '@streamr/utils'
import StreamrClient, { CONFIG_TEST, NetworkNodeType, PeerDescriptor, StreamID, StreamPermission, StreamrClientConfig } from 'streamr-client'
import Container from 'typedi'
import { CONFIG_TOKEN } from '../src/Config'
import { APIServer } from '../src/api/APIServer'
import { Crawler } from '../src/crawler/Crawler'
import { Stream } from '../src/entities'
import { createDatabase, queryAPI } from '../src/utils'
import { TEST_DATABASE_NAME, dropTestDatabaseIfExists } from './utils'

const PUBLISHER_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001'
const SUBSCRIBER_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000002'
const ENTRY_POINT_PORT = 40501

const startEntryPoint = async (): Promise<NetworkNode> => {
    const peerDescriptor = {
        nodeId: getRawFromDhtAddress(createRandomDhtAddress()),
        type: NodeType.NODEJS,
        websocket: {
            host: '10.200.10.1',
            port: ENTRY_POINT_PORT,
            tls: false
        }
    }
    const node = createNetworkNode({
        layer0: {
            nodeId: getDhtAddressFromRaw(peerDescriptor.nodeId),
            websocketHost: peerDescriptor.websocket.host,
            websocketPortRange: {
                min: peerDescriptor.websocket.port,
                max: peerDescriptor.websocket.port
            },
            websocketServerEnableTls: false,
            entryPoints: [peerDescriptor]
        }
    })
    await node.start()
    return node
}

const createClientConfig = (entryPointPeerDescriptor: PeerDescriptor): StreamrClientConfig => {
    return {
        ...CONFIG_TEST,
        network: {
            ...CONFIG_TEST.network,
            controlLayer: {
                ...CONFIG_TEST.network!.controlLayer,
                entryPoints: [{ 
                    nodeId: getDhtAddressFromRaw(entryPointPeerDescriptor.nodeId),
                    type: NetworkNodeType.NODEJS,
                    websocket: entryPointPeerDescriptor.websocket
                }]
            }
        }
    }
}

const createClient = (privateKey: string, entryPointPeerDescriptor: PeerDescriptor) => {
    return new StreamrClient({
        auth: {
            privateKey
        },
        ...createClientConfig(entryPointPeerDescriptor)
    })
}

const getStreamMetrics = async (id: string, apiPort: number): Promise<Stream | undefined> => {
    const query = `{
        streams(searchTerm: "${id}" pageSize: 1) {
            items {
                id
                description
                peerCount
                messagesPerSecond
                publisherCount
                subscriberCount
            }
        }
    }`
    const response = await queryAPI(query, apiPort)
    const streams = response['items']
    if (streams.length > 0) {
        return streams[0]
    } else {
        return undefined
    }
}

export const nextValue = async <T>(source: AsyncIterator<T>): Promise<T | undefined> => {
    const item = source.next()
    return (await item).value
}

describe('end-to-end', () => {

    let entryPoint: NetworkNode
    let publisher: StreamrClient
    let subscriber: StreamrClient
    let crawler: Crawler
    let apiPort: number

    const createTestStream = async () => {
        const stream = await publisher.createStream({ 
            id: `/test/stream-metrics-index/${Date.now()}`,
            description: 'mock-description'
        })
        await stream.grantPermissions({
            user: await subscriber.getAddress(),
            permissions: [StreamPermission.SUBSCRIBE]
        })
        return stream
    }

    const startPublisherAndSubscriberForStream = async (streamId: StreamID, publishingAbortControler: AbortSignal) => {
        const subscription = await subscriber.subscribe(streamId)
        setAbortableInterval(async () => {
            await publisher.publish(streamId, { foo: Date.now() })
        }, 500, publishingAbortControler)
        // wait until publisher and subscriber are connected
        const iterator = subscription[Symbol.asyncIterator]()
        await nextValue(iterator)
    }

    beforeAll(async () => {
        entryPoint = await startEntryPoint()
        const config = {
            api: {
                port: 0,
                graphiql: false
            },
            crawler: {
                subscribeDuration: 2000,
                newStreamAnalysisDelay: 5000
            },
            database: {
                host: '10.200.10.1',
                name: TEST_DATABASE_NAME,
                user: 'root',
                password: 'password'
            },
            client: createClientConfig(entryPoint.getPeerDescriptor())
        }
        await dropTestDatabaseIfExists(config.database)
        await createDatabase(config.database)
        Container.set(CONFIG_TOKEN, config)
        publisher = createClient(PUBLISHER_PRIVATE_KEY, entryPoint.getPeerDescriptor())
        subscriber = createClient(SUBSCRIBER_PRIVATE_KEY, entryPoint.getPeerDescriptor())
        const server = Container.get(APIServer)
        await server.start()
        apiPort = Container.get(APIServer).getPort()
    }, 30 * 1000)

    afterAll(async () => {
        await entryPoint.stop()
        await publisher.destroy()
        await subscriber.destroy()
        Container.reset()
    })

    it('happy path', async () => {
        const publishingAbortControler = new AbortController()

        const existingStream = await createTestStream()
        await startPublisherAndSubscriberForStream(existingStream.id, publishingAbortControler.signal)

        crawler = Container.get(Crawler)
        await crawler.start(1)

        const streamMetrics1 = (await getStreamMetrics(existingStream.id, apiPort))!
        expect(streamMetrics1.id).toBe(existingStream.id)
        expect(streamMetrics1.description).toBe('mock-description')
        expect(streamMetrics1.peerCount).toBe(2)
        expect(streamMetrics1.messagesPerSecond).toBeGreaterThan(0)
        expect(streamMetrics1.publisherCount).toBe(1)
        expect(streamMetrics1.subscriberCount).toBe(2)

        const newStream = await createTestStream()
        await startPublisherAndSubscriberForStream(newStream.id, publishingAbortControler.signal)

        await waitForCondition(async () => {
            const metrics = await getStreamMetrics(newStream.id, apiPort)
            return (metrics !== undefined) && (metrics.peerCount >= 2)
        }, 20 * 1000, 1000)
        const streamMetrics2 = (await getStreamMetrics(newStream.id, apiPort))!
        expect(streamMetrics2.id).toBe(newStream.id)
        expect(streamMetrics2.description).toBe('mock-description')
        expect(streamMetrics2.peerCount).toBe(2)
        expect(streamMetrics2.messagesPerSecond).toBeGreaterThan(0)
        expect(streamMetrics2.publisherCount).toBe(1)
        expect(streamMetrics2.subscriberCount).toBe(2)

        publishingAbortControler.abort()
        crawler.stop()
    }, 60 * 1000)
})

