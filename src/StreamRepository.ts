import { Connection, createConnection, RowDataPacket } from 'mysql2/promise'
import { Inject, Service } from 'typedi'
import { Config, CONFIG_TOKEN } from './Config'
import { OrderBy, Stream, Streams, Summary } from './entities'
import { StreamrClientFacade } from './StreamrClientFacade'
import { collect } from './utils'

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

@Service()
export class StreamRepository {

    private readonly connection: Promise<Connection>
    private readonly client: StreamrClientFacade    

    constructor(
        @Inject() client: StreamrClientFacade,
        @Inject(CONFIG_TOKEN) config: Config
    ) {
        this.client = client
        this.connection = createConnection({
            host: config.database.host,
            database: config.database.name,
            user: config.database.user,
            password: config.database.password
        })
    }

    async getStreams(searchTerm?: string, owner?: string, orderBy?: OrderBy, pageSize?: number, cursor?: string): Promise<Streams> {
        const whereClauses = []
        const params = []
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
        const orderByExpression = StreamRepository.formOrderByExpression(orderBy ?? OrderBy.ID)
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
        const connection = await this.connection
        const [ rows ] = await connection.query<StreamRow[]>(
            sql,
            params
        )
        return {
            items: rows,
            cursor: (rows.length === pageSize) ? String(offset + rows.length) : null
        }
    }

    private static formOrderByExpression(orderBy: OrderBy) {
        switch (orderBy) {
            case OrderBy.ID:
                return 'id'
            case OrderBy.DESCRIPTION:
                return 'description IS NULL, description'
            case OrderBy.PEER_COUNT:
                return 'peerCount DESC'
            case OrderBy.MESSAGES_PER_SECOND:
                return 'messagesPerSecond DESC'
            case OrderBy.PUBLISHER_COUNT:
                return 'publisherCount IS NULL DESC, publisherCount DESC'
            case OrderBy.SUBSCRIBER_COUNT:
                return 'subscriberCount IS NULL DESC, subscriberCount DESC'
            default:
                throw new Error('assertion failed')
        }
    }

    async getSummary(): Promise<Summary> {
        interface SummaryRow extends RowDataPacket {
            streamCount: number
            messagesPerSecond: number
        } 
        const connection = await this.connection
        const [ rows ] = await connection.query<SummaryRow[]>(
            'SELECT count(*) as streamCount, sum(messagesPerSecond) as messagesPerSecond FROM streams'
        )
        return rows[0]
    }

    async getIds(): Promise<string[]> {
        const connection = await this.connection
        const [ rows ] = await connection.query<StreamRow[]>(
            'SELECT id FROM streams'
        )
        return rows.map((r) => r.id)
    }

    async deleteStream(id: string): Promise<void> {
        const connection = await this.connection
        await connection.query(
            'DELETE FROM streams WHERE id = ?',
            [id]
        )
    }

    async replaceStream(stream: Stream): Promise<void> {
        const connection = await this.connection
        await connection.query(
            'REPLACE INTO streams (id, description, peerCount, messagesPerSecond, publisherCount, subscriberCount) VALUES (?, ?, ?, ?, ?, ?)',
            [stream.id, stream.description, stream.peerCount, stream.messagesPerSecond, stream.publisherCount, stream.subscriberCount]
        )
    }

    async destroy(): Promise<void> {
        (await this.connection).destroy()
    }
}
