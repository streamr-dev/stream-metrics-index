import { DhtAddress } from '@streamr/dht'
import { Logger } from '@streamr/utils'
import { RowDataPacket } from 'mysql2'
import { StreamPartID } from 'streamr-client'
import { Inject, Service } from 'typedi'
import { Topology } from '../crawler/Topology'
import { NeighborInput, Neighbors, Nodes, StreamPartNeigbors } from '../entities/Node'
import { createSqlQuery } from '../utils'
import { ConnectionPool } from './ConnectionPool'

interface NodeRow extends RowDataPacket {
    id: string
    ipAddress: string | null
}

interface NeighborRow extends RowDataPacket { 
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
        requestedFields: Set<string>,
        ids?: string[],
        streamPartId?: StreamPartID,
        neighbor?: NeighborInput,
        pageSize?: number,
        cursor?: string
    ): Promise<Nodes> {
        logger.info('Query: getNodes', { ids, streamPartId, neighbor, pageSize, cursor })
        const whereClauses = []
        const params = []
        if (ids !== undefined) {
            whereClauses.push('id in (?)')
            params.push(ids)
        }
        if (streamPartId !== undefined) {
            whereClauses.push(`
                id in (SELECT nodeId1 FROM neighbors WHERE streamPartId = ?) OR
                id in (SELECT nodeId2 FROM neighbors WHERE streamPartId = ?)
            `)
            params.push(streamPartId, streamPartId)
        }
        if (neighbor !== undefined) {
            whereClauses.push(`
                id in (SELECT nodeId1 FROM neighbors WHERE nodeId2 = ? AND streamPartId = ?) OR
                id in (SELECT nodeId2 FROM neighbors WHERE nodeId1 = ? AND streamPartId = ?)
            `)
            params.push(neighbor.node, neighbor.streamPart, neighbor.node, neighbor.streamPart)
        }
        const sql = createSqlQuery(
            `SELECT id, ipAddress FROM nodes`,
            whereClauses
        )
        const rows = await this.connectionPool.queryPaginated<NodeRow[]>(sql, params)
        const items: Nodes['items'] = []
        const includeNeighbors = requestedFields.has('neighbors')
        for (const row of rows.items) {
            items.push({
                ...row,
                neighbors: includeNeighbors ? await this.getStreamPartNeighbors(row.id as DhtAddress) : [],
            })
        }
        return {
            items,
            cursor: rows.cursor
        }
    }

    private async getStreamPartNeighbors(id: DhtAddress): Promise<StreamPartNeigbors[]> {
        const rows = await this.connectionPool.queryOrExecute<NeighborRow[]>(
            `SELECT streamPartId, nodeId1, nodeId2 FROM neighbors WHERE nodeId1 = ? OR nodeId2 = ?`,
            [id, id]
        )
        const result: StreamPartNeigbors[] = []
        for (const row of rows) {
            const otherNode = (row.nodeId1 === id) ? row.nodeId2 : row.nodeId1
            const item = result.find((i) => i.streamPartId === row.streamPartId)
            if (item !== undefined) {
                item.nodeIds.push(otherNode)
            } else {
                result.push({
                    streamPartId: row.streamPartId,
                    nodeIds: [otherNode]
                })
            }
        }
        return result
    }

    async getNeighbors(
        streamPartId: StreamPartID,
    ): Promise<Neighbors> {
        logger.info('Query: getNeighbors', { streamPartId })
        return this.connectionPool.queryPaginated<NeighborRow[]>(
            `SELECT nodeId1, nodeId2 FROM neighbors WHERE streamPartId = ?`,
            [streamPartId]
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
