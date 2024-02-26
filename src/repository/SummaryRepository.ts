import { RowDataPacket } from 'mysql2/promise'
import { Inject, Service } from 'typedi'
import { Summary } from '../entities/Summary'
import { ConnectionPool } from './ConnectionPool'

@Service()
export class SummaryRepository {

    private readonly connectionPool: ConnectionPool

    constructor(
        @Inject() connectionPool: ConnectionPool
    ) {
        this.connectionPool = connectionPool
    }

    async getSummary(): Promise<Summary> {
        interface SummaryRow extends RowDataPacket {
            streamCount: number
            messagesPerSecond: number
        } 
        const rows = await this.connectionPool.queryOrExecute<SummaryRow[]>(
            'SELECT count(*) as streamCount, sum(messagesPerSecond) as messagesPerSecond FROM streams'
        )
        return rows[0]
    }
}
