import { Logger, wait } from '@streamr/utils'
import { readFile } from 'fs/promises'
import { omit, without } from 'lodash'
import { Connection, createConnection } from 'mysql2/promise'
import fetch from 'node-fetch'
import { Config } from './Config'

const logger = new Logger(module)

interface APIErrorResponse {
    errors: [{
        message: string
    }]
}

export const collect = async <T>(source: AsyncIterable<T>, maxCount?: number): Promise<T[]> => {
    const items: T[] = []
    for await (const item of source) {
        items.push(item)
        if ((maxCount !== undefined) && (items.length >= maxCount)) {
            break
        }
    }
    return items
}

export const count = async (source: AsyncIterable<any>): Promise<number> => {
    const items = await collect(source)
    return items.length
}

export const ensureDatabaseConnectivity = async (config: Config['database']): Promise<void> => {
    await retry(async () => {
        const connection = await createDatabaseConnection(omit(config, 'name'))
        await connection.execute(`SELECT 1`)
        connection.destroy()
    }, 'Connect database')
}

export const createDatabaseConnection = async (config: Omit<Config['database'], 'name'> & { name?: string }): Promise<Connection> => {
    return await createConnection({
        host: config.host,
        user: config.user,
        password: config.password,
        database: config.name
    })
}

export const createDatabase = async (config: Config['database']): Promise<void> => {
    const connection1 = await createDatabaseConnection(omit(config, 'name'))
    await connection1.execute(`CREATE DATABASE IF NOT EXISTS ${config.name}`)
    connection1.destroy()
    const connection2 = await createDatabaseConnection(config)
    const sqlFileContent = await readFile('./initialize-database.sql', { encoding: 'utf-8' })
    const statements = without(sqlFileContent.split(';').map((statement) => statement.trim()), '')
    for (const statement of statements) {
        await connection2.execute(statement)
    }
    connection2.destroy()
}

export const retry = async <T>(task: () => Promise<T>, description: string, count = 10, delay = 20000): Promise<T> => {
    for (let i = 0; i < count; i++) {
        try {
            const result = await task()
            return result
        } catch (err: any) {
            if (i < (count - 1)) {
                logger.warn(`${description} failed, retrying in ${delay} ms`, { err })
            }
        }
        await wait(delay)
    }
    throw new Error(`${description} failed after ${count} attempts`)
}

export const queryAPI = async (query: string, port: number): Promise<any> => {
    const response = await fetch(`http://localhost:${port}/api`, {
        body: JSON.stringify({ query }),
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    const body = await response.json()
    const root = body.data
    if (root !== undefined) {
        const rootKeys = Object.keys(root)
        return root[rootKeys[0]]
    } else {
        throw new Error(`Query error: ${(body as APIErrorResponse).errors.map((e: any) => e.message).join()}`)
    }
}

export const createSqlQuery = (select: string, whereClauses: string[], orderByExpression?: string): string => {
    let sql = select
    if (whereClauses.length > 0) {
        sql += ` WHERE ${whereClauses.map((c) => `(${c})`).join(' AND ')}`
    }
    if (orderByExpression !== undefined) {
        sql += ` ORDER BY ${orderByExpression}`
    }
    return sql
}
