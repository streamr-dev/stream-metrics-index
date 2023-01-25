import { Logger, wait } from '@streamr/utils'
import { readFile } from 'fs/promises'
import { omit } from 'lodash'
import { Connection, createConnection } from 'mysql2/promise'
import { Config } from './Config'

const logger = new Logger(module)

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
    const statement = await readFile('./initialize-database.sql', { encoding: 'utf-8' })
    connection2.query(statement)
    connection2.destroy()
}

export const retry = async <T>(task: () => Promise<T>, description: string, count = 10, delay = 20000): Promise<T> => {
    for (let i = 0; i < count; i++) {
        try {
            const result = await task()
            return result
        } catch (e: any) {
            if (i < (count - 1)) {
                logger.warn(`${description} failed, retrying in ${delay} ms`)
            }
        }
        await wait(delay)
    }
    throw new Error(`${description} failed after ${count} attempts`)
}
