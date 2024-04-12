import 'reflect-metadata'

import { range, without } from 'lodash'
import Container from 'typedi'
import { APIServer } from '../src/api/APIServer'
import { CONFIG_TOKEN } from '../src/Config'
import { StreamrClientFacade } from '../src/StreamrClientFacade'
import { StreamRepository } from '../src/repository/StreamRepository'
import { createDatabase, queryAPI } from '../src/utils'
import { dropTestDatabaseIfExists, TEST_DATABASE_NAME } from './utils'
import { NodeRepository } from '../src/repository/NodeRepository'
import { DhtAddress, createRandomDhtAddress } from '@streamr/dht'
import { Multimap, utf8ToBinary } from '@streamr/utils'
import { StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import { MessageRepository } from '../src/repository/MessageRepository'
import { ContentType } from '../src/entities/Message'
import { StreamID } from '@streamr/protocol'

const storeTestTopology = async (
    streamParts: {
        id: StreamPartID
        nodeIds: DhtAddress[]
    }[]
) => {
    const nodeRepository = Container.get(NodeRepository)
    const nodeIds: Set<DhtAddress> = new Set(streamParts.map((sp) => sp.nodeIds).flat())
    const getNodes = () => {
        return [...nodeIds].map((nodeId: DhtAddress) => {
            const streamPartNeighbors = new Multimap()
            for (const streamPart of streamParts) {
                if (streamPart.nodeIds.includes(nodeId)) {
                    streamPartNeighbors.addAll(streamPart.id, without(streamPart.nodeIds, nodeId))
                }
            }
            return {
                id: nodeId,
                streamPartNeighbors,
                ipAddress: '123.1.2.3'
            }
        })
    }
    await nodeRepository.replaceNetworkTopology({ getNodes } as any)
}

describe('APIServer', () => {

    let apiPort: number

    beforeEach(async () => {
        const config = {
            api: {
                port: 0,
                graphiql: false
            },
            database: {
                host: '10.200.10.1',
                name: TEST_DATABASE_NAME,
                user: 'root',
                password: 'password'
            }
        }
        await dropTestDatabaseIfExists(config.database)
        await createDatabase(config.database)
        Container.set(CONFIG_TOKEN, config)
        const server = Container.get(APIServer)
        await server.start()
        apiPort = Container.get(APIServer).getPort()
    })

    afterEach(() => {
        Container.reset()
    })

    describe('streams', () => {
        it('happy path', async () => {
            const repository = Container.get(StreamRepository)
            const stream = {
                id: 'id-1',
                description: '',
                peerCount: 123,
                messagesPerSecond: 4.5,
                bytesPerSecond: 450,
                publisherCount: 6,
                subscriberCount: 7
            }
            await repository.replaceStream(stream)
            const streams = await queryAPI(`{
                streams {
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
            }`, apiPort)
            expect(streams.items).toEqual([stream])
        })

        it('pagination', async () => {
            const repository = Container.get(StreamRepository)
            for (const i of range(5)) {
                const stream = {
                    id: `id-${i}`,
                    description: '',
                    peerCount: 123,
                    messagesPerSecond: 4.56,
                    bytesPerSecond: 456,
                    publisherCount: null,
                    subscriberCount: null
                }
                await repository.replaceStream(stream)
            }
            const queryPage = (cursor?: string) => {
                return queryAPI(`{
                    streams(pageSize: 3 ${(cursor !== undefined) ? 'cursor: "' + cursor  + '"' : ''}) {
                        items {
                            id
                        }
                        cursor
                    }
                }`, apiPort)
            }
            const page1 = await queryPage()
            expect(page1.items.map((item: any) => item.id)).toEqual(['id-0', 'id-1', 'id-2'])
            const page2 = await queryPage(page1.cursor)
            expect(page2.items.map((item: any) => item.id)).toEqual(['id-3', 'id-4'])
            expect(page2.cursor).toBeNull()
        })

        it('orderBy', async () => {
            const repository = Container.get(StreamRepository)
            await repository.replaceStream({
                id: 'id-1',
                description: '',
                peerCount: 123,
                messagesPerSecond: 200,
                bytesPerSecond: 20000,
                publisherCount: null,
                subscriberCount: 20
            })
            await repository.replaceStream({
                id: 'id-2',
                description: '',
                peerCount: 456,
                messagesPerSecond: 100,
                bytesPerSecond: 10000,
                publisherCount: 10,
                subscriberCount: 10
            })           
            await repository.replaceStream({
                id: 'id-3',
                description: '',
                peerCount: 789,
                messagesPerSecond: 300,
                bytesPerSecond: 30000,
                publisherCount: 20,
                subscriberCount: null
            })
            const queryOrderedStreams = async (orderBy: string, orderDirection: string) => {
                const streams = await queryAPI(`{
                    streams(orderBy: ${orderBy} orderDirection: ${orderDirection}) {
                        items {
                            id
                        }
                    }
                }`, apiPort)
                return streams.items.map((item: any) => item.id)
            }
            expect(await queryOrderedStreams('ID', 'ASC')).toEqual(['id-1', 'id-2', 'id-3'])
            expect(await queryOrderedStreams('PEER_COUNT', 'DESC')).toEqual(['id-3', 'id-2', 'id-1'])
            expect(await queryOrderedStreams('MESSAGES_PER_SECOND', 'DESC')).toEqual(['id-3', 'id-1', 'id-2'])
            expect(await queryOrderedStreams('BYTES_PER_SECOND', 'DESC')).toEqual(['id-3', 'id-1', 'id-2'])
            expect(await queryOrderedStreams('PUBLISHER_COUNT', 'DESC')).toEqual(['id-1', 'id-3', 'id-2'])
            expect(await queryOrderedStreams('SUBSCRIBER_COUNT', 'DESC')).toEqual(['id-3', 'id-1', 'id-2'])
        })
    })

    it('filter by id', async () => {
        const repository = Container.get(StreamRepository)
        await repository.replaceStream({
            id: 'foobar',
            description: '',
            peerCount: 0,
            messagesPerSecond: 0,
            bytesPerSecond: 0,
            publisherCount: null,
            subscriberCount: null
        })
        await repository.replaceStream({
            id: 'loremipsum',
            description: '',
            peerCount: 0,
            messagesPerSecond: 0,
            bytesPerSecond: 0,
            publisherCount: null,
            subscriberCount: null
        })
        const streams = await queryAPI(`{
            streams(searchTerm: "remi") {
                items {
                    id
                }
            }
        }`, apiPort)
        expect(streams.items.map((item: any) => item.id)).toEqual(['loremipsum'])
    })

    it('filter by owner', async () => {
        const owner = '0x1234567890123456789012345678901234567890'
        const searchStreams = jest.fn().mockReturnValue([{
            id: 'id-1'
        }])
        Container.set(StreamrClientFacade, {
            searchStreams
        })
        const repository = Container.get(StreamRepository)
        const stream = {
            id: 'id-1',
            description: '',
            peerCount: 111,
            messagesPerSecond: 10,
            bytesPerSecond: 1000,
            publisherCount: 1,
            subscriberCount: 1
        }
        await repository.replaceStream(stream)
        await repository.replaceStream({
            id: 'id-2',
            description: '',
            peerCount: 222,
            messagesPerSecond: 20,
            bytesPerSecond: 2000,
            publisherCount: 2,
            subscriberCount: 2
        })
        const streams = await queryAPI(`{
            streams(owner: "${owner}") {
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
        }`, apiPort)
        expect(searchStreams).toBeCalledWith(owner)
        expect(streams.items).toEqual([stream])
    })

    it('filter by id', async () => {
        const repository = Container.get(StreamRepository)
        for (const i of range(5)) {
            const stream = {
                id: `id-${i}`,
                description: `description-${i}`,
                peerCount: 0,
                messagesPerSecond: 0,
                bytesPerSecond: 0,
                publisherCount: null,
                subscriberCount: null
            }
            await repository.replaceStream(stream)
        }
        const streams = await queryAPI(`{
            streams(ids: ["id-2", "id-3"]) {
                items {
                    id,
                    description
                }
            }
        }`, apiPort)
        expect(streams.items).toEqual([{
            id: 'id-2',
            description: 'description-2'
        }, {
            id: 'id-3',
            description: 'description-3'
        }])
    })

    describe('sampleMessage', () => {

        it('JSON', async () => {
            const streamId = `stream-${Date.now()}` as StreamID
            const content = { foo: 'bar' }
            const repository = Container.get(MessageRepository)
            await repository.replaceSampleMessage({
                content: utf8ToBinary(JSON.stringify(content)),
                contentType: ContentType.JSON
            }, streamId)
            const sample = await queryAPI(`{
                sampleMessage(stream: "${streamId}") {
                    content
                    contentType
                }
            }`, apiPort)
            expect(sample).toEqual({
                content: JSON.stringify(content),
                contentType: 'JSON'
            })
        })

        it('binary', async () => {
            const streamId = `stream-${Date.now()}` as StreamID
            const repository = Container.get(MessageRepository)
            await repository.replaceSampleMessage({
                content: new Uint8Array([1, 2, 3, 4]),
                contentType: ContentType.BINARY
            }, streamId)
            const sample = await queryAPI(`{
                sampleMessage(stream: "${streamId}") {
                    content
                    contentType
                }
            }`, apiPort)
            expect(sample).toEqual({
                content: 'AQIDBA==',
                contentType: 'BINARY'
            })
        })

        it('not found', async () => {
            const streamId = `stream-${Date.now()}` as StreamID
            const sample = await queryAPI(`{
                sampleMessage(stream: "${streamId}") {
                    content
                    contentType
                }
            }`, apiPort)
            expect(sample).toBeNull()
        })
    })

    describe('nodes', () => {

        const node1 = createRandomDhtAddress()
        const node2 = createRandomDhtAddress()
        const node3 = createRandomDhtAddress()

        beforeEach(async () => {
            await storeTestTopology([
                { id: StreamPartIDUtils.parse('stream1#0'), nodeIds: [node1, node2] },
                { id: StreamPartIDUtils.parse('stream1#1'), nodeIds: [node2, node3] },
                { id: StreamPartIDUtils.parse('stream2#0'), nodeIds: [createRandomDhtAddress(), createRandomDhtAddress()] }
            ])
        })

        it('ids', async () => {
            const response = await queryAPI(`{
                nodes(ids: ["${node1}"]) {
                    items {
                        id
                        ipAddress
                        location {
                            latitude
                            longitude
                            city
                            country
                        }
                    }
                }
            }`, apiPort)
            const node = response['items'][0]
            expect(node).toEqual({
                id: node1,
                ipAddress: '123.1.2.3',
                location: {
                    city: 'Nagoya',
                    country: 'JP',
                    latitude: 35.1926,
                    longitude: 136.906
                }
            })
        })

        it('stream', async () => {
            const response = await queryAPI(`{
                nodes(stream: "stream1") {
                    items {
                        id
                    }
                }
            }`, apiPort)
            const actualNodeIds = response.items.map((node: any) => node.id)
            expect(actualNodeIds).toIncludeSameMembers([node1, node2, node3])
        })
    }) 

    describe('neighbors', () => {

        const node1 = createRandomDhtAddress()
        const node2 = createRandomDhtAddress()
        const node3 = createRandomDhtAddress()
        const node4 = createRandomDhtAddress()
        const node5 = createRandomDhtAddress()

        beforeEach(async () => {
            await storeTestTopology([
                { id: StreamPartIDUtils.parse('stream1#0'), nodeIds: [node1, node2] },
                { id: StreamPartIDUtils.parse('stream1#1'), nodeIds: [node2, node3] },
                { id: StreamPartIDUtils.parse('stream2#0'), nodeIds: [node4, node5] }
            ])
        })

        it('all', async () => {
            const response = await queryAPI(`{
                neighbors {
                    items {
                        streamPartId
                        nodeId1
                        nodeId2
                    }
                }
            }`, apiPort)
            const neighbors = response['items']
            const actualNodes = neighbors.map((n: any) => [n.nodeId1, n.nodeId2]).flat()
            expect(actualNodes).toIncludeSameMembers([node1, node2, node2, node3, node4, node5])
        })

        it('filter by node', async () => {
            const response1 = await queryAPI(`{
                neighbors(node: "${node1}") {
                    items {
                        streamPartId
                        nodeId1
                        nodeId2
                    }
                }
            }`, apiPort)
            const neighbors = response1['items']
            const actualNodes = neighbors.map((n: any) => [n.nodeId1, n.nodeId2]).flat()
            expect(actualNodes).toIncludeSameMembers([node1, node2])
        })

        it('filter by stream part', async () => {
            const response = await queryAPI(`{
                neighbors(streamPart: "stream1#0") {
                    items {
                        nodeId1
                        nodeId2
                    }
                }
            }`, apiPort)
            const neighbors = response['items']
            const actualNodes = neighbors.map((n: any) => [n.nodeId1, n.nodeId2]).flat()
            expect(actualNodes).toIncludeSameMembers([node1, node2])
        })

        it('filter by stream', async () => {
            const response = await queryAPI(`{
                neighbors(stream: "stream1") {
                    items {
                        nodeId1
                        nodeId2
                    }
                }
            }`, apiPort)
            const neighbors = response['items']
            const actualNodes = neighbors.map((n: any) => [n.nodeId1, n.nodeId2]).flat()
            expect(actualNodes).toIncludeSameMembers([node1, node2, node2, node3])
        })
    })

    it('summary', async () => {
        const streamRepository = Container.get(StreamRepository)
        await streamRepository.replaceStream({
            id: 'id-1',
            description: '',
            peerCount: 10,
            messagesPerSecond: 100,
            bytesPerSecond: 10000,
            publisherCount: null,
            subscriberCount: null
        })
        await streamRepository.replaceStream({
            id: 'id-2',
            description: '',
            peerCount: 20,
            messagesPerSecond: 200,
            bytesPerSecond: 20000,
            publisherCount: null,
            subscriberCount: null
        })
        await storeTestTopology([{ id: StreamPartIDUtils.parse('stream#0'), nodeIds: [createRandomDhtAddress(), createRandomDhtAddress()] }])
        const summary = await queryAPI(`{
            summary {
                streamCount
                messagesPerSecond
                bytesPerSecond
                nodeCount
            }
        }`, apiPort)
        expect(summary).toEqual({
            streamCount: 2,
            messagesPerSecond: 300,
            bytesPerSecond: 30000,
            nodeCount: 2
        })
    })
})
