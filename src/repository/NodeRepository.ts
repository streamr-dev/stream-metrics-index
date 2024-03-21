import { DhtAddress } from '@streamr/dht'
import { StreamID, StreamPartID } from '@streamr/sdk'
import { Logger } from '@streamr/utils'
import { Inject, Service } from 'typedi'
import { Topology } from '../crawler/Topology'
import { createSqlQuery } from '../utils'
import { ConnectionPool, PaginatedListFragment } from './ConnectionPool'

export interface NodeRow {
    id: string
    ipAddress: string | null
}

interface NeighborRow { 
    streamPartId: string
    nodeId1: string
    nodeId2: string
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
        ids?: DhtAddress[],
        streamId?: StreamID,
        pageSize?: number,
        cursor?: string
    ): Promise<PaginatedListFragment<NodeRow>> {
        logger.info('Query: getNodes', { ids, pageSize, cursor })
        const whereClauses = []
        const params = []
        if (ids !== undefined) {
            whereClauses.push('id in (?)')
            params.push(ids)
        }
        if (streamId !== undefined) {
            const streamPartExpression = `${streamId}#%`
            whereClauses.push(`id IN (
                SELECT DISTINCT id
                FROM (
                    SELECT nodeId1 AS id FROM neighbors WHERE streamPartId LIKE ?
                    UNION
                    SELECT nodeId2 AS id FROM neighbors WHERE streamPartId LIKE ?
                ) AS x
            )`)
            params.push(streamPartExpression, streamPartExpression)
        }
        const sql = createSqlQuery(
            `SELECT id, ipAddress FROM nodes`,
            whereClauses
        )
        return this.connectionPool.queryPaginated<NodeRow>(
            sql,
            params,
            pageSize,
            cursor
        )
    }

    async getNeighbors(
        nodeId?: DhtAddress,
        streamPartId?: StreamPartID,
        pageSize?: number,
        cursor?: string
    ): Promise<PaginatedListFragment<NeighborRow>> {
        logger.info('Query: getNeighbors', { nodeId, streamPartId })
        const whereClauses = []
        const params = []
        if (nodeId !== undefined) {
            whereClauses.push('nodeId1 = ? OR nodeId2 = ?')
            params.push(nodeId, nodeId)
        }
        if (streamPartId !== undefined) {
            whereClauses.push('streamPartId = ?')
            params.push(streamPartId)
        }
        const sql = createSqlQuery(
            'SELECT streamPartId, nodeId1, nodeId2 FROM neighbors',
            whereClauses
        )
        return this.connectionPool.queryPaginated<NeighborRow>(
            sql,
            params,
            pageSize,
            cursor
        )
    }

    async replaceNetworkTopology(topology: Topology): Promise<void> {
        const nodes = topology.getNodes().map((node) => {
            return [node.id, node.ipAddress]
        })
        const neighbors: [StreamPartID, DhtAddress, DhtAddress][] = []
        for (const node of topology.getNodes()) {
            for (const streamPartId of node.streamPartNeighbors.keys()) {
                const streamPartNeighbors = node.streamPartNeighbors.get(streamPartId)!
                for (const neighbor of streamPartNeighbors) {
                    // If node A and B are neighbors, we assume that there are two associations in the topology:
                    // A->B and B-A. We don't need to store both associations to the DB. The following comparison
                    // filters out the duplication. Note that if there is only one side of the association 
                    // in the topology, that association is maybe not stored at all.
                    if (node.id < neighbor) {
                        neighbors.push([streamPartId, node.id, neighbor])
                    }
                }
            }
        }
        const connection = await this.connectionPool.getConnection()
        try {
            await connection.beginTransaction()
            await connection.query('DELETE FROM neighbors')
            await connection.query('DELETE FROM nodes')
            await connection.query('INSERT INTO nodes (id, ipAddress) VALUES ?', [nodes])
            await connection.query('INSERT INTO neighbors (streamPartId, nodeId1, nodeId2) VALUES ?', [neighbors])
            await connection.commit()
        } catch (e) {
            connection.rollback()
            throw e
        } finally {
            connection.release()
        }
    }
}
