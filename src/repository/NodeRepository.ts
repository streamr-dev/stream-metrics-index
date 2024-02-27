import { Logger } from '@streamr/utils'
import { RowDataPacket } from 'mysql2'
import { Inject, Service } from 'typedi'
import { Topology } from '../crawler/Topology'
import { createSqlQuery } from '../utils'
import { ConnectionPool, PaginatedListFragment } from './ConnectionPool'

export interface NodeRow extends RowDataPacket {
    id: string
    ipAddress: string | null
}

const logger = new Logger(module)

@Service()
export class NodeRepository {

    private readonly connectionPool: ConnectionPool

    constructor(
        @Inject() connectionPool: ConnectionPool
    ) {
        this.connectionPool = connectionPool
    }

    async getNodes(
        ids?: string[],
        pageSize?: number,
        cursor?: string
    ): Promise<PaginatedListFragment<NodeRow[]>> {
        logger.info('Query: getNodes', { ids, pageSize, cursor })
        const whereClauses = []
        const params = []
        if (ids !== undefined) {
            whereClauses.push('id in (?)')
            params.push(ids)
        }
        const sql = createSqlQuery(
            `SELECT id, ipAddress FROM nodes`,
            whereClauses
        )
        return this.connectionPool.queryPaginated<NodeRow[]>(sql, params)
    }

    async replaceNetworkTopology(topology: Topology): Promise<void> {
        const nodes = topology.getNodes().map((node) => {
            return [node.id, node.ipAddress]
        })
        const connection = await this.connectionPool.getConnection()
        try {
            await connection.beginTransaction()
            await connection.query('DELETE FROM nodes')
            await connection.query('INSERT INTO nodes (id, ipAddress) VALUES ?', [nodes])
            await connection.commit()
        } catch (e) {
            connection.rollback()
            throw e
        } finally {
            connection.release()
        }
    }
}
