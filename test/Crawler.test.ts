import 'reflect-metadata'

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
import { createDatabase, createDatabaseConnection } from '../src/utils'
import { dropTestDatabaseIfExists, TEST_DATABASE_NAME } from './utils'

const TOPOLOGIES = [{
    'stream-id#0': { 'node-1': [] },
    'stream-id#3': { 'node-2': [], 'node-3': [] }
}, {
    'stream-id#1': { 'node-3': [], 'node-4': [], 'node-5': [] }
}, {
}]

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

    beforeEach(async () => {
        trackers = await Promise.all(TOPOLOGIES.map((topology) => startFakeTracker(topology)))
        config = {
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
            trackers: trackers.map((t) => ({
                http: `http://localhost:${t.port}`
            }))
        }
        await dropTestDatabaseIfExists(config.database)
        await createDatabase(config.database)
        Container.set(CONFIG_TOKEN, config)
        Container.set(StreamrClientFacade, {
            getAllStreams: () => [{ 
                id: 'stream-id',
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
            }
        })
        Container.set(MessageRateAnalyzer, {
            getRate: () => 123.45
        })
        crawler = Container.get(Crawler)
    })

    afterEach(async () => {
        await Promise.all(trackers.map((tracker) => tracker.destroy()))
        Container.reset()
    })
    
    it('happy path', async () => {
        await crawler.updateStreams()
        const connection = await createDatabaseConnection(config.database)
        const streams = await connection.query('select * from streams')
        expect(streams[0]).toMatchObject([{
            id: 'stream-id',
            description: 'mock-description',
            peerCount: 5,
            messagesPerSecond: '123.45',
            publisherCount: 10,
            subscriberCount: 20
        }])
        connection.destroy()
    })
})
