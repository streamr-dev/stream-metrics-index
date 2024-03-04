import { Pool, createPool, PoolConnection } from 'mysql2/promise'
import { Inject, Service } from 'typedi'
import { CONFIG_TOKEN, Config } from '../Config'

const DEFAULT_PAGE_SIZE = 100

export interface PaginatedListFragment<T> {
    items: T[]
    cursor: string | null
}

@Service()
export class ConnectionPool {

    private readonly delegatee: Pool

    constructor(
        @Inject(CONFIG_TOKEN) config: Config
    ) {
        this.delegatee = createPool({
            host: config.database.host,
            database: config.database.name,
            user: config.database.user,
            password: config.database.password
        })
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    async queryOrExecute<T>(sql: string, params?: any[]): Promise<T[]> {
        const connection = await this.delegatee.getConnection()
        try {
            const [ rows ] = await connection.query(
                sql,
                params
            )
            return rows as T[]
        } finally {
            connection.release()
        }
    }

    async queryPaginated<T>(
        sql: string, params: any[], pageSize?: number, cursor?: string
    ): Promise<PaginatedListFragment<T>> {
        const limit = pageSize ?? DEFAULT_PAGE_SIZE
        // The cursor is currently just an offset to the result set. We can later implement
        // enhanced cursor functionality if needed (e.g. cursor can be the last item of
        // the result set or a token which references to a stateful cache).
        const offset = (cursor !== undefined) ? parseInt(cursor, 10) : 0
        const rows = await this.queryOrExecute<T>(
            `${sql} LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        )
        return {
            items: rows,
            cursor: (rows.length === limit) ? String(offset + rows.length) : null
        }
    }

    async getConnection(): Promise<PoolConnection> {
        return this.delegatee.getConnection()
    }

    async destroy(): Promise<void> {
        this.delegatee.end()
    }
}
