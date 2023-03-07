import { StreamMessage, toStreamID, toStreamPartID } from '@streamr/protocol'
import { range } from 'lodash'
import { getMessageRate, MAX_PARTITION_COUNT } from '../src/crawler/messageRate'

const STREAM_ID = toStreamID('stream-id')

const createMockMessage = (): Partial<StreamMessage> => {
    return {
        getStreamId: () => STREAM_ID
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
        const actual = await getMessageRate(STREAM_ID, [1, 4, 5], node, {
            crawler: {
                subscribeDuration: 200
            }
        } as any)
        expect(actual).toEqual(15)
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
        const actual = await getMessageRate(STREAM_ID, partitions, node, {
            crawler: {
                subscribeDuration: 200
            }
        } as any)
        expect(actual).toEqual(15 * partitionMultiplier)
        expect(node.subscribe).toBeCalledTimes(MAX_PARTITION_COUNT)
    })
})
