import { Logger } from '@streamr/utils'
import { RowDataPacket } from 'mysql2/promise'
import { Inject, Service } from 'typedi'
import { StreamrClientFacade } from '../StreamrClientFacade'
import { OrderDirection } from '../entities/OrderDirection'
import { OrderBy, Stream, Streams } from '../entities/Stream'
import { collect } from '../utils'
import { ConnectionPool } from './ConnectionPool'

interface StreamRow extends RowDataPacket {
    id: string
    description: string | null
    peerCount: number
    messagesPerSecond: number
    publisherCount: number | null
    subscriberCount: number | null
}

const EMPTY_SEARCH_RESULT = {
    items: [],
    cursor: null
}

const DEFAULT_PAGE_SIZE = 100

const logger = new Logger(module)

@Service()
export class StreamRepository {

    private readonly connectionPool: ConnectionPool
    private readonly client: StreamrClientFacade

    constructor(
        @Inject() client: StreamrClientFacade,
        @Inject() connectionPool: ConnectionPool
    ) {
        this.client = client
        this.connectionPool = connectionPool
    }

    async getStreams(
        ids?: string[],
        searchTerm?: string,
        owner?: string,
        orderBy?: OrderBy,
        orderDirection?: OrderDirection,
        pageSize?: number,
        cursor?: string
    ): Promise<Streams> {
        logger.info('Query: getStreams', { ids, searchTerm, owner, orderBy, orderDirection, pageSize, cursor })
        const whereClauses = []
        const params = []
        if (ids !== undefined) {
            whereClauses.push('id in (?)')
            params.push(ids)
        }
        if (searchTerm !== undefined) {
            whereClauses.push('id LIKE ?')
            params.push(`%${searchTerm}%`)
        }
        if (owner !== undefined) {
            whereClauses.push('id in (?)')
            const streams = await collect(this.client.searchStreams(owner))
            if (streams.length === 0) {
                return EMPTY_SEARCH_RESULT
            }
            const streamIds = streams.map((s) => s.id)
            params.push(streamIds)
        }
        const orderByExpression = StreamRepository.formOrderByExpression(orderBy ?? OrderBy.ID, orderDirection ?? OrderDirection.ASC)
        const sql = `
            SELECT id, description, peerCount, messagesPerSecond, publisherCount, subscriberCount 
            FROM streams
            ${(whereClauses.length > 0) ? 'WHERE ' + whereClauses.join(' AND ') : ''}
            ORDER BY ${orderByExpression}
            LIMIT ? OFFSET ?`
        const limit = pageSize ?? DEFAULT_PAGE_SIZE
        // The cursor is currently just an offset to the result set. We can later implement
        // enhanced cursor functionality if needed (e.g. cursor can be the last item of
        // the result set or a token which references to a stateful cache).
        const offset = (cursor !== undefined) ? parseInt(cursor, 10) : 0
        params.push(limit, offset)
        const rows = await this.connectionPool.queryOrExecute<StreamRow[]>(sql, params)
        return {
            items: rows,
            cursor: (rows.length === pageSize) ? String(offset + rows.length) : null
        }
    }

    private static formOrderByExpression(orderBy: OrderBy, orderDirection: OrderDirection) {
        const getFieldName = () => {
            switch (orderBy) {
                case OrderBy.ID:
                    return 'id'
                case OrderBy.DESCRIPTION:
                    return 'description'
                case OrderBy.PEER_COUNT:
                    return 'peerCount'
                case OrderBy.MESSAGES_PER_SECOND:
                    return 'messagesPerSecond'
                case OrderBy.PUBLISHER_COUNT:
                    return 'publisherCount'
                case OrderBy.SUBSCRIBER_COUNT:
                    return 'subscriberCount'
                default:
                    throw new Error('assertion failed')
            }
        }
        const getDirectionSql = () => {
            switch (orderDirection) {
                case OrderDirection.ASC:
                    return 'ASC'
                case OrderDirection.DESC:
                    return 'DESC'
                default:
                    throw new Error('assertion failed')
            }
        }
        const fieldName = getFieldName()
        const directionSql = getDirectionSql()
        const stableSortSuffix = ', id'
        return `${fieldName} IS NULL ${directionSql}, ${fieldName} ${directionSql} ${stableSortSuffix}`
    }

    async getAllStreams(): Promise<{ id: string, crawlTimestamp: number }[]> {
        const rows = await this.connectionPool.queryOrExecute<StreamRow[]>(
            'SELECT id, crawlTimestamp FROM streams'
        )
        return rows.map((r: StreamRow) => {
            return {
                id: r.id,
                crawlTimestamp: Date.parse(r.crawlTimestamp)
            }
        })
    }

    async deleteStream(id: string): Promise<void> {
        await this.connectionPool.queryOrExecute(
            'DELETE FROM streams WHERE id = ?',
            [id]
        )
    }

    async replaceStream(stream: Stream): Promise<void> {
        await this.connectionPool.queryOrExecute(
            `REPLACE INTO streams (
                id, description, peerCount, messagesPerSecond, publisherCount, subscriberCount, crawlTimestamp
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?
            )`,
            [stream.id, stream.description, stream.peerCount, stream.messagesPerSecond, stream.publisherCount, stream.subscriberCount, new Date()]
        )
    }
}
