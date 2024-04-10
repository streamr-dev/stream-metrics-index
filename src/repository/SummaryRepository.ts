import { Inject, Service } from 'typedi'
import { ConnectionPool } from './ConnectionPool'

export interface StreamSummaryRow {
    streamCount: number
    messagesPerSecond: number
    bytesPerSecond: number
}

export interface NodeSummaryRow {
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

    async getSummary(): Promise<StreamSummaryRow & NodeSummaryRow> {
        const streamSummaryRows = await this.connectionPool.queryOrExecute<StreamSummaryRow>(
            'SELECT count(*) as streamCount, sum(messagesPerSecond) as messagesPerSecond, sum(bytesPerSecond) as bytesPerSecond FROM streams'
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
