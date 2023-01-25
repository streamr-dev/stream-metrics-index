import { TEST_CONFIG } from '@streamr/network-node'
import 'reflect-metadata'

import StreamrClient, { CONFIG_TEST, StreamPermission, TrackerRegistryRecord } from 'streamr-client'
import Container from 'typedi'
import { APIServer } from '../src/api/APIServer'
import { CONFIG_TOKEN } from '../src/Config'
import { Crawler } from '../src/crawler/Crawler'
import { Stream } from '../src/entities'
import { collect, createDatabase } from '../src/utils'
import { dropTestDatabaseIfExists, queryAPI, TEST_DATABASE_NAME } from './utils'

const PUBLISHER_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001'
const SUBSCRIBER_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000002'

const createClient = (privateKey: string) => {
    return new StreamrClient({
        auth: {
            privateKey
        },
        ...CONFIG_TEST
    })
}

const getStream = async (id: string): Promise<Stream | undefined> => {
    const query = `{
        streams(searchTerm: "${id}" pageSize: 1) {
            items {
                id
                peerCount
                messagesPerSecond
                publisherCount
                subscriberCount
            }
        }
    }`
    const response = await queryAPI(query)
    const streams = response['items']
    if (streams.length > 0) {
        return streams[0]
    } else {
        return undefined
    }
}

describe('end-to-end', () => {

    let publisher: StreamrClient
    let subscriber: StreamrClient
    let streamId: string
    let crawler: Crawler

    beforeAll(async () => {
        const config = {
            api: {
                graphiql: false
            },
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
            trackers: CONFIG_TEST.network!.trackers! as TrackerRegistryRecord[],
            contracts: CONFIG_TEST.contracts
        }
        await dropTestDatabaseIfExists(config.database)
        await createDatabase(config.database)
        Container.set(CONFIG_TOKEN, config)
        publisher = createClient(PUBLISHER_PRIVATE_KEY)
        subscriber = createClient(SUBSCRIBER_PRIVATE_KEY)
        const stream = await publisher.getOrCreateStream({ id: `/test/stream-metrics-index` })
        await stream.grantPermissions({
            user: await subscriber.getAddress(),
            permissions: [StreamPermission.SUBSCRIBE]
        })
        streamId = stream.id
        const server = Container.get(APIServer)
        await server.start()
    }, 30 * 1000)

    afterAll(async () => {
        await publisher.destroy()
        await subscriber.destroy()
        Container.reset()
    })

    it('happy path', async () => {
        const subscription = await subscriber.subscribe(streamId)
        const publisherTimer = setInterval(async () => {
            await publisher.publish(streamId, { foo: Date.now() })
        }, 500)

        // wait until publisher and subscriber are connected
        await collect(subscription, 1)
        crawler = Container.get(Crawler)
        await crawler.updateStreams()
        clearTimeout(publisherTimer)

        const stream = (await getStream(streamId))!
        expect(stream.peerCount).toBe(2)
        expect(stream.messagesPerSecond).toBeGreaterThan(0)
        expect(stream.publisherCount).toBe(1)
        expect(stream.subscriberCount).toBe(2)

    }, 30 * 1000)
})

