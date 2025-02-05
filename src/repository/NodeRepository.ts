import { DhtAddress } from '@streamr/dht'
import { StreamID, StreamPartID } from '@streamr/sdk'
import { Logger } from '@streamr/utils'
import { Inject, Service } from 'typedi'
import { Topology, Neighbor } from '../crawler/Topology'
import { createSqlQuery } from '../utils'
import { ConnectionPool, PaginatedListFragment } from './ConnectionPool'
import { mean, without } from 'lodash'

export interface NodeRow {
    id: string
    ipAddress: string | null
}

interface NeighborRow { 
    streamPartId: string
    nodeId1: string
    nodeId2: string
    rtt: number | null
}

const logger = new Logger(module)

const getRtt = (neighbor1: Neighbor, neighbor2: DhtAddress, streamPartId: StreamPartID, topology: Topology): number | undefined => {
    const rtt1 = neighbor1.rtt
    const rtt2 = topology.getNeighbor(neighbor1.nodeId, neighbor2, streamPartId)?.rtt
    const rtts = without([rtt1, rtt2], undefined)
    return (rtts.length > 0) ? mean(rtts) : undefined
}

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
        streamId?: StreamID,
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
        if (streamId !== undefined) {
            whereClauses.push('streamPartId LIKE ?')
            params.push(`${streamId}#%`)
        }
        const sql = createSqlQuery(
            'SELECT streamPartId, nodeId1, nodeId2, rtt FROM neighbors',
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
        const neighbors: [StreamPartID, DhtAddress, DhtAddress, number?][] = []
        for (const node of topology.getNodes()) {
            for (const streamPartId of node.streamPartNeighbors.keys()) {
                const streamPartNeighbors = node.streamPartNeighbors.get(streamPartId)
                for (const neighbor of streamPartNeighbors) {
                    // If node A and B are neighbors, we assume that there are two associations in the topology:
                    // A->B and B->A. We don't need to store both associations to the DB. The following comparison
                    // filters out the duplication. Note that if there is only one side of the association 
                    // in the topology, that association is maybe not stored at all.
                    if (node.id < neighbor.nodeId) {
                        const rtt = getRtt(neighbor, node.id, streamPartId, topology)
                        neighbors.push([streamPartId, node.id, neighbor.nodeId, rtt])
                    }
                }
            }
        }
        logger.info('Replace network topology:', { nodeCount: nodes.length, neighborCount: neighbors.length })
        const connection = await this.connectionPool.getConnection()
        try {
            await connection.beginTransaction()
            await connection.query('DELETE FROM neighbors')
            await connection.query('DELETE FROM nodes')
            if (nodes.length > 0) {
                await connection.query('INSERT INTO nodes (id, ipAddress) VALUES ?', [nodes])
            }
            if (neighbors.length > 0) {
                await connection.query('INSERT INTO neighbors (streamPartId, nodeId1, nodeId2, rtt) VALUES ?', [neighbors])
            }
            await connection.commit()
        } catch (e) {
            connection.rollback()
            throw e
        } finally {
            connection.release()
        }
    }
}
