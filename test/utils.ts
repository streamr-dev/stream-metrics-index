import { once } from 'events'
import express, { Request, Response } from 'express'
import { Server } from 'http'
import { omit } from 'lodash'
import { Config } from '../src/Config'
import { createDatabaseConnection } from '../src/utils'
import { DhtAddress, NodeType, PeerDescriptor, createRandomDhtAddress, getRawFromDhtAddress } from '@streamr/dht'

export const TEST_DATABASE_NAME = 'stream_metrics_index_test'

export const createTestPeerDescriptor = (nodeId?: DhtAddress): PeerDescriptor => {
    return {
        nodeId: getRawFromDhtAddress(nodeId ?? createRandomDhtAddress()),
        type: NodeType.NODEJS
    }
}

export const dropTestDatabaseIfExists = async (config: Config['database']): Promise<void> => {
    const connection = await createDatabaseConnection(omit(config, 'name'))
    await connection.execute(`DROP DATABASE IF EXISTS ${config.name}`)
    connection.destroy()
}

export const startTheGraphServer = async (responses: ({ id: string, createdAt: number }[])[]): Promise<Server> => {
    const app = express()
    const responseIterator = responses[Symbol.iterator]()
    app.post('/path', (_: Request, res: Response) => {
        const next = responseIterator.next()
        const response = !next.done ? next.value : []
        res.json({
            data: {
                streams: response
            }
        })
    })
    const server = app.listen()
    await once(server, 'listening')
    return server
}
