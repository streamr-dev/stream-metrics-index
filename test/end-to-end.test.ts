import 'reflect-metadata'

import { DhtAddress, NodeType, createRandomDhtAddress, getDhtAddressFromRaw, getRawFromDhtAddress } from '@streamr/dht'
import { StreamPartID, toStreamPartID } from '@streamr/protocol'
import StreamrClient, { CONFIG_TEST, NetworkNodeType, PeerDescriptor, StreamID, StreamPermission, StreamrClientConfig } from '@streamr/sdk'
import { NetworkNode, createNetworkNode } from '@streamr/trackerless-network'
import { setAbortableInterval, waitForCondition } from '@streamr/utils'
import { sample, uniq, without } from 'lodash'
import Container from 'typedi'
import { CONFIG_TOKEN } from '../src/Config'
import { APIServer } from '../src/api/APIServer'
import { Crawler } from '../src/crawler/Crawler'
import { Node } from '../src/entities/Node'
import { Stream } from '../src/entities/Stream'
import { createDatabase, queryAPI } from '../src/utils'
import { TEST_DATABASE_NAME, dropTestDatabaseIfExists } from './utils'
import { Message } from '../src/entities/Message'

const PUBLISHER_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001'
const SUBSCRIBER_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000002'
const ENTRY_POINT_PORT = 40501
const PARTITION_COUNT = 3
const ACTIVE_PARTITIONS = [1, 2]
const DOCKER_DEV_LOOPBACK_IP_ADDRESS = '10.200.10.1'

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

const queryStreamMetrics = async (id: string, apiPort: number): Promise<Stream | undefined> => {
    const query = `{
        streams(searchTerm: "${id}" pageSize: 1) {
            items {
                id
                description
                peerCount
                messagesPerSecond
                bytesPerSecond
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

const querySampleMessage = async (streamId: string, apiPort: number): Promise<Message | undefined> => {
    const query = `{
        sampleMessage(stream: "${streamId}") {
            content
            contentType
        }
    }`
    const response = await queryAPI(query, apiPort)
    return response ?? undefined
}

const queryNodes = async (apiPort: number): Promise<Node[]> => {
    const query = `{
        nodes {
            items {
                id
                ipAddress
            }
        }
    }`
    const response = await queryAPI(query, apiPort)
    return response['items']
}

const queryNeighbors = async (nodeId: DhtAddress, streamPartId: StreamPartID, apiPort: number): Promise<DhtAddress[]> => {
    const query = `{
        neighbors(node: "${nodeId}", streamPart: "${streamPartId}") {
            items {
                nodeId1
                nodeId2
            }
        }
    }`
    const response = await queryAPI(query, apiPort)
    const items = response['items']
    return without([items[0].nodeId1, items[0].nodeId2], nodeId)
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

    const createTestStream = async (isPublic: boolean) => {
        const stream = await publisher.createStream({ 
            id: `/test/stream-metrics-index/${Date.now()}`,
            partitions: PARTITION_COUNT,
            description: 'mock-description'
        })
        const permissions = [StreamPermission.SUBSCRIBE]
        if (isPublic) {
            await stream.grantPermissions({ public: true, permissions })
        }  else {
            await stream.grantPermissions({ user: await subscriber.getAddress(), permissions })
        }
        return stream
    }

    const startPublisherAndSubscriberForStream = async (streamId: StreamID, publishingAbortControler: AbortSignal) => {
        return Promise.all(ACTIVE_PARTITIONS.map(async (partition: number) => {
            const streamPartDefinition = {
                streamId: streamId,
                partition
            }
            const subscription = await subscriber.subscribe(streamPartDefinition)
            setAbortableInterval(async () => {
                await publisher.publish(streamPartDefinition, { foo: 'bar' })
            }, 500, publishingAbortControler)
            // wait until publisher and subscriber are connected
            const iterator = subscription[Symbol.asyncIterator]()
            await nextValue(iterator)
        }))
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
                subscribeJoinTimeout: 1000,
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

        const privateStream = await createTestStream(false)
        await startPublisherAndSubscriberForStream(privateStream.id, publishingAbortControler.signal)
        const publicStream = await createTestStream(true)
        await startPublisherAndSubscriberForStream(publicStream.id, publishingAbortControler.signal)

        crawler = Container.get(Crawler)
        await crawler.start(1)

        const streamMetrics1 = (await queryStreamMetrics(privateStream.id, apiPort))!
        expect(streamMetrics1.id).toBe(privateStream.id)
        expect(streamMetrics1.description).toBe('mock-description')
        expect(streamMetrics1.peerCount).toBe(2)
        expect(streamMetrics1.messagesPerSecond).toBeGreaterThan(0)
        expect(streamMetrics1.bytesPerSecond).toBeGreaterThan(0)
        expect(streamMetrics1.publisherCount).toBe(1)
        expect(streamMetrics1.subscriberCount).toBe(2)

        const sampleMessage1 = (await querySampleMessage(privateStream.id, apiPort))
        expect(sampleMessage1).toBeUndefined()

        const streamMetrics2 = (await queryStreamMetrics(publicStream.id, apiPort))!
        expect(streamMetrics2.id).toBe(publicStream.id)
        expect(streamMetrics2.description).toBe('mock-description')
        expect(streamMetrics2.peerCount).toBe(2)
        expect(streamMetrics2.messagesPerSecond).toBeGreaterThan(0)
        expect(streamMetrics2.bytesPerSecond).toBeGreaterThan(0)
        expect(streamMetrics2.publisherCount).toBe(1)
        expect(streamMetrics2.subscriberCount).toBe(null)

        const sampleMessage2 = (await querySampleMessage(publicStream.id, apiPort))!
        expect(sampleMessage2.content).toEqual('{"foo":"bar"}')
        expect(sampleMessage2.contentType).toEqual('JSON')

        const nodes = (await queryNodes(apiPort))!
        expect(nodes.map((n) => n.id)).toIncludeSameMembers([
            await publisher.getNodeId(),
            await subscriber.getNodeId(),
            entryPoint.getNodeId(),
            await crawler.getNodeId()
        ])
        expect(uniq(nodes.map((n) => n.ipAddress))).toEqual([DOCKER_DEV_LOOPBACK_IP_ADDRESS])

        const randomActiveStreamPartId = toStreamPartID(privateStream.id, sample(ACTIVE_PARTITIONS)!)
        const neighbors = (await queryNeighbors(await publisher.getNodeId(), randomActiveStreamPartId, apiPort))!
        expect(neighbors).toEqual([await subscriber.getNodeId()])

        const newStream = await createTestStream(false)
        await startPublisherAndSubscriberForStream(newStream.id, publishingAbortControler.signal)

        await waitForCondition(async () => {
            const metrics = await queryStreamMetrics(newStream.id, apiPort)
            return (metrics !== undefined) && (metrics.peerCount >= 2)
        }, 20 * 1000, 1000)
        const streamMetrics3 = (await queryStreamMetrics(newStream.id, apiPort))!
        expect(streamMetrics3.id).toBe(newStream.id)
        expect(streamMetrics3.description).toBe('mock-description')
        expect(streamMetrics3.peerCount).toBe(2)
        expect(streamMetrics3.messagesPerSecond).toBeGreaterThan(0)
        expect(streamMetrics3.bytesPerSecond).toBeGreaterThan(0)
        expect(streamMetrics3.publisherCount).toBe(1)
        expect(streamMetrics3.subscriberCount).toBe(2)

        publishingAbortControler.abort()
        crawler.stop()
    }, 60 * 1000)
})

