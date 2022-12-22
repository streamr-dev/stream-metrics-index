import { readFile } from 'fs/promises'
import { createConnection } from 'mysql2/promise'
import fetch from 'node-fetch'
import Container from 'typedi'
import { APIServer } from '../src/api/APIServer'

export const TEST_DATABASE_NAME = 'stream_metrics_index_test'

const createDatabaseConnection = async (databaseName: string | undefined) => {
    return await createConnection({
        host: '10.200.10.1',
        user: 'root',
        password: 'password',
        database: databaseName
    })
}

export const createTestDatabase = async (): Promise<void> => {
    const connection1 = await createDatabaseConnection(undefined)
    await connection1.execute(`DROP DATABASE IF EXISTS ${TEST_DATABASE_NAME}`)
    await connection1.execute(`CREATE DATABASE ${TEST_DATABASE_NAME}`)
    connection1.destroy()
    const connection2 = await createDatabaseConnection(TEST_DATABASE_NAME)
    const statements = await readFile('./initialize-database.sql', { encoding: 'utf-8' })
    for (const statement of statements.split(';')) {
        if (statement.trim() !== '') {
            await connection2.query(statement)
        }
    }
    connection2.destroy()
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
