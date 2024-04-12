import 'reflect-metadata'

import Container from 'typedi'
import { CONFIG_TOKEN } from '../src/Config'
import { createDatabase } from '../src/utils'
import { TEST_DATABASE_NAME, dropTestDatabaseIfExists } from './utils'
import { StreamID } from '@streamr/protocol'
import { MessageRepository, MessageRow } from '../src/repository/MessageRepository'
import { utf8ToBinary } from '@streamr/utils'
import { ContentType } from '../src/entities/Message'

const createTestMessage = (msg: { content: Uint8Array, contentType: ContentType }): MessageRow => {
    return {
        // normalize content to Buffer so that we can compare instances with expect().toEqual()
        content: Buffer.from(msg.content),
        contentType: msg.contentType
    }
}

describe('MessageRepository', () => {

    beforeEach(async () => {
        const config = {
            database: {
                host: '10.200.10.1',
                name: TEST_DATABASE_NAME,
                user: 'root',
                password: 'password'
            }
        }
        await dropTestDatabaseIfExists(config.database)
        await createDatabase(config.database)
        Container.set(CONFIG_TOKEN, config)
    })

    afterEach(() => {
        Container.reset()
    })

    it('create, update, remove', async () => {
        const streamId = `stream-${Date.now()}` as StreamID
        const otherStreamId = `other-stream-${Date.now()}` as StreamID
        const repository = Container.get(MessageRepository)

        // create
        const sample1 = createTestMessage({
            content: utf8ToBinary('stream-mock-json-content'),
            contentType: ContentType.JSON
        })
        await repository.replaceSampleMessage(sample1, streamId)
        const otherSample = createTestMessage({
            content: utf8ToBinary('other-stream-mock-json-content'),
            contentType: ContentType.JSON
        })
        await repository.replaceSampleMessage(otherSample, otherStreamId)
        expect(await repository.getSampleMessage(streamId)).toEqual(sample1)

        // update
        const sample2 = createTestMessage({
            content: new Uint8Array([1, 2, 3]),
            contentType: ContentType.BINARY
        })
        await repository.replaceSampleMessage(sample2, streamId)
        expect(await repository.getSampleMessage(streamId)).toEqual(sample2)

        // delete
        await repository.replaceSampleMessage(null, streamId)
        expect(await repository.getSampleMessage(streamId)).toBeNull()
        expect(await repository.getSampleMessage(otherStreamId)).toEqual(otherSample)
    })
})
