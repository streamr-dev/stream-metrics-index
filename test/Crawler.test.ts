import { TEST_CONFIG } from '@streamr/network-node'
import { once } from 'events'
import express, { Request, Response } from 'express'
import { AddressInfo } from 'net'
import { StreamPermission } from 'streamr-client'
import Container from 'typedi'
import { CONFIG_TOKEN } from '../src/Config'
import { Crawler } from '../src/crawler/Crawler'
import { MessageRateAnalyzer } from '../src/crawler/MessageRateAnalyzer'
import { StreamrClientFacade } from '../src/StreamrClientFacade'
import { createDatabaseConnection, createTestDatabase, TEST_DATABASE_NAME } from './utils'

const startFakeTracker = async (): Promise<{ port: number, destroy: () => Promise<void> }> => {
    const app = express()
    app.get('/topology/:streamId', (_req: Request, res: Response) => {
        res.json({
            'stream-id#0': [{ 'neighborId': 'node-1' }],
            'stream-id#1': [{ 'neighborId': 'node-2' }, { 'neighborId': 'node-3' }]
        })
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
    let tracker: { port: number, destroy: () => Promise<void> }

    beforeEach(async () => {
        await createTestDatabase()
        tracker = await startFakeTracker()
        Container.set(CONFIG_TOKEN, {
            crawler: {
                subscribeDuration: 10
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
            trackers: [{
                http: `http://localhost:${tracker.port}`
            }]
        })
        Container.set(StreamrClientFacade, {
            getAllStreams: () => [{ id: 'stream-id' }],
            getPublisherOrSubscriberCount: (_streamId: string, permission: StreamPermission.PUBLISH | StreamPermission.SUBSCRIBE) => {
                if (permission === StreamPermission.PUBLISH) {
                    return 10
                } else if (permission === StreamPermission.SUBSCRIBE) {
                    return 20
                }
            }
        })
        Container.set(MessageRateAnalyzer, {
            getRate: () => 123.45
        })
        crawler = Container.get(Crawler)
    })

    afterEach(async () => {
        await tracker.destroy()
        Container.reset()
    })
    
    it('happy path', async () => {
        await crawler.updateStreams()
        const connection = await createDatabaseConnection(TEST_DATABASE_NAME)
        const streams = await connection.query('select * from streams')
        expect(streams[0]).toMatchObject([{
            id: 'stream-id',
            peerCount: 3,
            messagesPerSecond: '123.45',
            publisherCount: 10,
            subscriberCount: 20
        }])
        connection.destroy()
    })
})
