import { omit } from 'lodash'
import fetch from 'node-fetch'
import Container from 'typedi'
import { APIServer } from '../src/api/APIServer'
import { Config } from '../src/Config'
import { createDatabaseConnection } from '../src/utils'

export const TEST_DATABASE_NAME = 'stream_metrics_index_test'

export const dropTestDatabaseIfExists = async (config: Config['database']): Promise<void> => {
    const connection = await createDatabaseConnection(omit(config, 'name'))
    await connection.execute(`DROP DATABASE IF EXISTS ${config.name}`)
    connection.destroy()
}

export const queryAPI = async (query: string): Promise<any> => {
    const server = Container.get(APIServer)
    const response = await fetch(`http://localhost:${server.getPort()}/api`, {
        body: JSON.stringify({ query }),
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    const body = await response.json()
    const root = body['data']
    if (root !== undefined) {
        const rootKeys = Object.keys(root)
        return root[rootKeys[0]]
    } else {
        throw new Error(`Query error: ${body.errors.map((e: any) => e.message)}`)
    }
}
