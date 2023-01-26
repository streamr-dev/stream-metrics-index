import 'reflect-metadata'

import { range } from 'lodash'
import Container from 'typedi'
import { APIServer } from '../src/api/APIServer'
import { CONFIG_TOKEN } from '../src/Config'
import { StreamrClientFacade } from '../src/StreamrClientFacade'
import { StreamRepository } from '../src/StreamRepository'
import { createDatabase, queryAPI } from '../src/utils'
import { dropTestDatabaseIfExists, TEST_DATABASE_NAME } from './utils'

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
                peerCount: 123,
                messagesPerSecond: 4.5,
                publisherCount: 6,
                subscriberCount: 7
            }
            await repository.replaceStream(stream)
            const streams = await queryAPI(`{
                streams {
                    items {
                        id
                        peerCount
                        messagesPerSecond
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
                    peerCount: 123,
                    messagesPerSecond: 4.56,
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
                peerCount: 123,
                messagesPerSecond: 200,
                publisherCount: null,
                subscriberCount: 20
            })
            await repository.replaceStream({
                id: 'id-2',
                peerCount: 456,
                messagesPerSecond: 100,
                publisherCount: 10,
                subscriberCount: 10
            })           
            await repository.replaceStream({
                id: 'id-3',
                peerCount: 789,
                messagesPerSecond: 300,
                publisherCount: 20,
                subscriberCount: null
            })
            const queryOrderedStreams = async (orderBy: string) => {
                const streams = await queryAPI(`{
                    streams(orderBy: ${orderBy}) {
                        items {
                            id
                        }
                    }
                }`, apiPort)
                return streams.items.map((item: any) => item.id)
            }
            expect(await queryOrderedStreams('ID')).toEqual(['id-1', 'id-2', 'id-3'])
            expect(await queryOrderedStreams('PEER_COUNT')).toEqual(['id-3', 'id-2', 'id-1'])
            expect(await queryOrderedStreams('MESSAGES_PER_SECOND')).toEqual(['id-3', 'id-1', 'id-2'])
            expect(await queryOrderedStreams('PUBLISHER_COUNT')).toEqual(['id-1', 'id-3', 'id-2'])
            expect(await queryOrderedStreams('SUBSCRIBER_COUNT')).toEqual(['id-3', 'id-1', 'id-2'])
        })
    })

    it('filter by id', async () => {
        const repository = Container.get(StreamRepository)
        await repository.replaceStream({
            id: 'foobar',
            peerCount: 0,
            messagesPerSecond: 0,
            publisherCount: null,
            subscriberCount: null
        })
        await repository.replaceStream({
            id: 'loremipsum',
            peerCount: 0,
            messagesPerSecond: 0,
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
            peerCount: 111,
            messagesPerSecond: 10,
            publisherCount: 1,
            subscriberCount: 1
        }
        await repository.replaceStream(stream)
        await repository.replaceStream({
            id: 'id-2',
            peerCount: 222,
            messagesPerSecond: 20,
            publisherCount: 2,
            subscriberCount: 2
        })
        const streams = await queryAPI(`{
            streams(owner: "${owner}") {
                items {
                    id
                    peerCount
                    messagesPerSecond
                    publisherCount
                    subscriberCount
                }
            }
        }`, apiPort)
        expect(searchStreams).toBeCalledWith(owner)
        expect(streams.items).toEqual([stream])
    })

    it('summary', async () => {
        const repository = Container.get(StreamRepository)
        await repository.replaceStream({
            id: 'id-1',
            peerCount: 10,
            messagesPerSecond: 100,
            publisherCount: null,
            subscriberCount: null
        })
        await repository.replaceStream({
            id: 'id-2',
            peerCount: 20,
            messagesPerSecond: 200,
            publisherCount: null,
            subscriberCount: null
        })
        const summary = await queryAPI(`{
            summary {
                streamCount
                messagesPerSecond
            }
        }`, apiPort)
        expect(summary).toEqual({
            streamCount: 2,
            messagesPerSecond: 300
        })
    })
})
