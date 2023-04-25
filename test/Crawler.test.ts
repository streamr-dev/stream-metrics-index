import 'reflect-metadata'

import { TEST_CONFIG } from '@streamr/network-node'
import { wait, waitForCondition } from '@streamr/utils'
import { once } from 'events'
import express, { Request, Response } from 'express'
import { Server } from 'http'
import { AddressInfo } from 'net'
import { StreamMessage, StreamPermission } from 'streamr-client'
import Container from 'typedi'
import { CONFIG_TOKEN } from '../src/Config'
import { StreamrClientFacade } from '../src/StreamrClientFacade'
import { Crawler } from '../src/crawler/Crawler'
import { NetworkNodeFacade } from '../src/crawler/NetworkNodeFacade'
import { SubscribeGate } from '../src/crawler/SubscribeGate'
import { createDatabase, createDatabaseConnection } from '../src/utils'
import { TEST_DATABASE_NAME, dropTestDatabaseIfExists, startTheGraphServer } from './utils'
import { RowDataPacket } from 'mysql2'

const createTopologies = (streamId: string) => {
    return [{
        [`${streamId}#0`]: { 'node-1': [] },
        [`${streamId}#3`]: { 'node-2': [], 'node-3': [] }
    }, {
        [`${streamId}#1`]: { 'node-3': [], 'node-4': [], 'node-5': [] }
    }, {
    }]
} 

const createMockMessage = (streamId: string): Partial<StreamMessage> => {
    return {
        getStreamId: () => streamId as any
    }
}

const startFakeTracker = async (topology: Record<string, any>): Promise<{ port: number, destroy: () => Promise<void> }> => {
    const app = express()
    app.get('/topology/:streamId', (_req: Request, res: Response) => {
        res.json(topology)
    })
    const server = app.listen()
    await once(server, 'listening')
    return {
        port: (server.address() as AddressInfo).port,
        destroy: async () => {
            server.close()
            await once(server, 'close')
        }
    }
}

describe('Crawler', () => {

    let crawler: Crawler
    let trackers: { port: number, destroy: () => Promise<void> }[]
    let config: any
    let theGraphServer: Server
    let streamId: string

    beforeEach(async () => {
        streamId = `stream-id-${Date.now()}`
        trackers = await Promise.all(createTopologies(streamId).map((topology) => startFakeTracker(topology)))
        theGraphServer = await startTheGraphServer([])
        config = {
            crawler: {
                subscribeDuration: 2000
            },
            database: {
                host: '10.200.10.1',
                name: TEST_DATABASE_NAME,
                user: 'root',
                password: 'password'
            },
            networkNode: {
                id: '0x1234567890123456789012345678901234567890',
                ...TEST_CONFIG
            },
            trackers: trackers.map((t) => ({
                http: `http://localhost:${t.port}`
            })),
            contracts: {
                theGraphUrl: `http://localhost:${(theGraphServer.address() as AddressInfo).port}/path`
            }
        }
        await dropTestDatabaseIfExists(config.database)
        await createDatabase(config.database)
        Container.set(CONFIG_TOKEN, config)
        Container.set(StreamrClientFacade, {
            getAllStreams: () => [{ 
                id: streamId,
                getMetadata: () => ({ 
                    description:  'mock-description'
                })
            }],
            getPublisherOrSubscriberCount: (_streamId: string, permission: StreamPermission.PUBLISH | StreamPermission.SUBSCRIBE) => {
                if (permission === StreamPermission.PUBLISH) {
                    return 10
                } else if (permission === StreamPermission.SUBSCRIBE) {
                    return 20
                }
            },
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            on: () => {},
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            off: () => {}
        })
        Container.set(NetworkNodeFacade, {
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            subscribe: () => {},
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            unsubscribe: () => {},
            addMessageListener: (onMessage: (msg: StreamMessage) => void) => {
                setImmediate(() => {
                    onMessage(createMockMessage(streamId) as any)
                    onMessage(createMockMessage(streamId) as any)
                    onMessage(createMockMessage(streamId) as any)
                })
            },
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            removeMessageListener: () => {}
        })
        Container.set(SubscribeGate, {
            waitUntilOpen: () => Promise.resolve(undefined)
        })
        crawler = Container.get(Crawler)
    })

    afterEach(async () => {
        await Promise.all(trackers.map((tracker) => tracker.destroy()))
        theGraphServer.close()
        Container.reset()
    })
    
    it('happy path', async () => {
        crawler.start(1)
        const connection = await createDatabaseConnection(config.database)

        const query = `select * from streams where id="${streamId}"`
        await waitForCondition(async () => {
            const streams = (await connection.query(query))[0] as RowDataPacket
            return streams.length > 0
        }, 10 * 1000)

        await wait(15000)

        const streams = (await connection.query(query))[0]
        expect(streams).toMatchObject([{
            id: streamId,
            description: 'mock-description',
            peerCount: 5,
            messagesPerSecond: '1.50',
            publisherCount: 10,
            subscriberCount: 20
        }])
        connection.destroy()
    }, 30 * 1000)
})
