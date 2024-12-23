import { StreamMessage } from '@streamr/trackerless-network'
import { Gate, toStreamID, toStreamPartID } from '@streamr/utils'
import { range } from 'lodash'
import { MAX_PARTITION_COUNT, getMessageRate } from '../src/crawler/messageRate'

const STREAM_ID = toStreamID('stream-id')
const CONTENT_LENGTH = 100

const createMockMessage = (): Partial<StreamMessage> => {
    return {
        messageId: {
            streamId: STREAM_ID,
        } as any,
        body: {
            oneofKind: 'contentMessage',
            contentMessage: {
                content: new Uint8Array(range(CONTENT_LENGTH))
            } as any
        }
    }
}

const createMockNode = (): any => {
    const publishMessages = (onMessage: (msg: StreamMessage) => void) => {
        onMessage(createMockMessage() as any)
        onMessage(createMockMessage() as any)
        onMessage(createMockMessage() as any)
    }
    const node = {
        subscribe: jest.fn(),
        unsubscribe: jest.fn(),
        addMessageListener: jest.fn().mockImplementation((onMessage: (msg: StreamMessage) => void) => {
            setImmediate(() => {
                publishMessages(onMessage)
            })
        }),
        removeMessageListener: jest.fn()
    }
    return node
}

describe('messageRate', () => {
    it('happy path', async () => {
        const node = createMockNode()
        const actual = await getMessageRate(STREAM_ID, [1, 4, 5], true, node, new Gate(true), {
            crawler: {
                subscribeDuration: 200
            }
        } as any)
        expect(actual.messagesPerSecond).toEqual(15)
        expect(actual.bytesPerSecond).toEqual(1500)
        expect(actual.sampleMessage).toBeDefined()
        expect(node.subscribe).toBeCalledTimes(3)
        expect(node.subscribe.mock.calls.flat().sort()).toEqual([
            toStreamPartID(STREAM_ID, 1),
            toStreamPartID(STREAM_ID, 4),
            toStreamPartID(STREAM_ID, 5)
        ])
    })

    it('sample partitions', async () => {
        const partitionMultiplier = 4
        const partitions = range(MAX_PARTITION_COUNT * partitionMultiplier)
        const node = createMockNode()
        const actual = await getMessageRate(STREAM_ID, partitions, true, node, new Gate(true), {
            crawler: {
                subscribeDuration: 200
            }
        } as any)
        expect(actual.messagesPerSecond).toEqual(15 * partitionMultiplier)
        expect(actual.bytesPerSecond).toEqual(1500 * partitionMultiplier)
        expect(actual.sampleMessage).toBeDefined()
        expect(node.subscribe).toBeCalledTimes(MAX_PARTITION_COUNT)
    })
})
