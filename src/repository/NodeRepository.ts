import { Logger } from '@streamr/utils'
import { RowDataPacket } from 'mysql2'
import { Inject, Service } from 'typedi'
import { Topology } from '../crawler/Topology'
import { Nodes } from '../entities/Node'
import { createSqlQuery } from '../utils'
import { ConnectionPool } from './ConnectionPool'
import { NodesQueryFields } from '../api/NodeResolver'
import { getLocationFromIpAddress } from '../location'

interface NodeRow extends RowDataPacket {
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
        requestedFields: Set<NodesQueryFields>,
        ids?: string[],
        pageSize?: number,
        cursor?: string
    ): Promise<Nodes> {
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
        const rows = await this.connectionPool.queryPaginated<NodeRow[]>(sql, params)
        const items: Nodes['items'] = []
        const includeLocation = requestedFields.has('location')
        for (const row of rows.items) {
            items.push({
                ...row,
                location: (includeLocation && (row.ipAddress !== null)) ? (getLocationFromIpAddress(row.ipAddress) ?? null) : null
            })
        }
        return {
            items,
            cursor: rows.cursor
        }
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
