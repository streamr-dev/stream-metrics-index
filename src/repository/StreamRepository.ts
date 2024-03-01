import { StreamID } from '@streamr/sdk'
import { Logger } from '@streamr/utils'
import { Inject, Service } from 'typedi'
import { StreamrClientFacade } from '../StreamrClientFacade'
import { OrderDirection } from '../entities/OrderDirection'
import { StreamOrderBy } from '../entities/Stream'
import { collect, createSqlQuery } from '../utils'
import { ConnectionPool, PaginatedListFragment } from './ConnectionPool'

export interface StreamRow {
    id: string
    description: string | null
    peerCount: number
    messagesPerSecond: number
    publisherCount: number | null
    subscriberCount: number | null
    crawlTimestamp: string
}

const EMPTY_SEARCH_RESULT = {
    items: [],
    cursor: null
}

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
        ids?: StreamID[],
        searchTerm?: string,
        owner?: string,
        orderBy?: StreamOrderBy,
        orderDirection?: OrderDirection,
        pageSize?: number,
        cursor?: string
    ): Promise<PaginatedListFragment<StreamRow>> {
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
        const sql = createSqlQuery(
            'SELECT id, description, peerCount, messagesPerSecond, publisherCount, subscriberCount FROM streams',
            whereClauses,
            StreamRepository.formOrderByExpression(orderBy ?? StreamOrderBy.ID, orderDirection ?? OrderDirection.ASC)
        )
        return this.connectionPool.queryPaginated<StreamRow>(sql, params, pageSize, cursor)
    }

    private static formOrderByExpression(orderBy: StreamOrderBy, orderDirection: OrderDirection) {
        const getFieldName = () => {
            switch (orderBy) {
                case StreamOrderBy.ID:
                    return 'id'
                case StreamOrderBy.DESCRIPTION:
                    return 'description'
                case StreamOrderBy.PEER_COUNT:
                    return 'peerCount'
                case StreamOrderBy.MESSAGES_PER_SECOND:
                    return 'messagesPerSecond'
                case StreamOrderBy.PUBLISHER_COUNT:
                    return 'publisherCount'
                case StreamOrderBy.SUBSCRIBER_COUNT:
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
        const rows = await this.connectionPool.queryOrExecute<StreamRow>(
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

    async replaceStream(stream: Omit<StreamRow, 'crawlTimestamp'>): Promise<void> {
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
