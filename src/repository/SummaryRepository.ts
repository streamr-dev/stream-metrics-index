import { Inject, Service } from 'typedi'
import { Summary } from '../entities/Summary'
import { ConnectionPool } from './ConnectionPool'

interface StreamSummaryRow {
    streamCount: number
    messagesPerSecond: number
}

interface NodeSummaryRow {
    nodeCount: number
} 

@Service()
export class SummaryRepository {

    private readonly connectionPool: ConnectionPool

    constructor(
        @Inject() connectionPool: ConnectionPool
    ) {
        this.connectionPool = connectionPool
    }

    async getSummary(): Promise<Summary> {
        const streamSummaryRows = await this.connectionPool.queryOrExecute<StreamSummaryRow>(
            'SELECT count(*) as streamCount, sum(messagesPerSecond) as messagesPerSecond FROM streams'
        )
        const nodeSummaryRows = await this.connectionPool.queryOrExecute<NodeSummaryRow>(
            'SELECT count(*) as nodeCount FROM nodes'
        )
        return {
            ...streamSummaryRows[0],
            ...nodeSummaryRows[0]
        }
    }
}
