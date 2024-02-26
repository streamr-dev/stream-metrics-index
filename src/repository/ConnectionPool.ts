import { Pool, RowDataPacket, createPool } from 'mysql2/promise'
import { Inject, Service } from 'typedi'
import { CONFIG_TOKEN, Config } from '../Config'

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
    async queryOrExecute<T extends RowDataPacket[]>(sql: string, params?: any): Promise<T> {
        const connection = await this.delegatee.getConnection()
        try {
            const [ rows ] = await connection.query<T>(
                sql,
                params
            )
            return rows
        } finally {
            connection.release()
        }
    }

    async destroy(): Promise<void> {
        this.delegatee.end()
    }
}
