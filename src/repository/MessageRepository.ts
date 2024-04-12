import { Inject, Service } from 'typedi'
import { ConnectionPool } from './ConnectionPool'
import { StreamID } from '@streamr/protocol'
import { ContentType } from '../entities/Message'
import { StreamMessage, ContentType as StreamMessageContentType } from '@streamr/protocol'

export interface MessageRow {
    content: Uint8Array
    contentType: ContentType
}

export const convertStreamMessageToMessageRow = (msg: StreamMessage): MessageRow => {
    let contentType
    if (msg.contentType === StreamMessageContentType.JSON) {
        contentType = ContentType.JSON
    } else if (msg.contentType === StreamMessageContentType.BINARY) {
        contentType = ContentType.BINARY
    } else {
        throw new Error(`Assertion failed: unknown content type ${msg.contentType}`)
    }
    return { 
        content: msg.content,
        contentType
    }
}

@Service()
export class MessageRepository {

    private readonly connectionPool: ConnectionPool

    constructor(
        @Inject() connectionPool: ConnectionPool
    ) {
        this.connectionPool = connectionPool
    }

    async getSampleMessage(streamId: StreamID): Promise<MessageRow | null> {
        const rows = await this.connectionPool.queryOrExecute<MessageRow>(
            'SELECT content, contentType FROM sample_messages WHERE streamId=? LIMIT 1',
            [streamId]
        )
        if (rows.length === 1) {
            return rows[0]
        } else {
            return null
        }
    }

    async replaceSampleMessage(message: MessageRow | null, streamId: StreamID): Promise<void> {
        if (message !== null) {
            await this.connectionPool.queryOrExecute(
                'REPLACE INTO sample_messages (streamId, content, contentType) VALUES (?, ?, ?)',
                [
                    streamId,
                    Buffer.from(message.content),
                    message.contentType
                ]
            )
        } else {
            await this.connectionPool.queryOrExecute(
                'DELETE FROM sample_messages WHERE streamId=?',
                [streamId]
            )
        }
    }
}
