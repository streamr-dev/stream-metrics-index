import { StreamMessage } from '@streamr/trackerless-network'
import { Gate, Logger, StreamID, toStreamPartID, wait } from '@streamr/utils'
import { sampleSize } from 'lodash'
import { Config } from '../Config'
import { NetworkNodeFacade } from './NetworkNodeFacade'

const logger = new Logger(module)

// If there are many partitions, we approximate the message rate of a stream by analyzing only some of the partitions.
// We assume that traffic levels in each partitions are be quite similar.
export const MAX_PARTITION_COUNT = 10
const MAX_MESSAGE_SIZE = 1048576

export interface MessageRate {
    messagesPerSecond: number
    bytesPerSecond: number
    sampleMessage?: StreamMessage
}

export const getMessageRate = async (
    streamId: StreamID,
    activePartitions: number[],
    isPublicStream: boolean,
    node: NetworkNodeFacade,
    subscibeGate: Gate,
    config: Config
): Promise<MessageRate> => {
    let messageCount = 0
    let bytesSum = 0
    let sampleMessage: StreamMessage | undefined = undefined
    const messageListener = (msg: StreamMessage) => {
        if ((msg.messageId!.streamId === streamId) && (msg.body.oneofKind === 'contentMessage')) {
            messageCount++
            const content = msg.body.contentMessage.content
            bytesSum += content.length
            if ((sampleMessage === undefined) && isPublicStream && (content.length <= MAX_MESSAGE_SIZE)) {
                sampleMessage = msg
            }
        }
    }
    node.addMessageListener(messageListener)
    const samplePartitions = sampleSize(activePartitions, MAX_PARTITION_COUNT)
    for (const partition of samplePartitions) {
        await subscibeGate.waitUntilOpen()
        const streamPartId = toStreamPartID(streamId, partition)
        logger.info(`Listen ${streamPartId}`)
        try {
            await node.subscribe(streamPartId)
        } catch (err) {
            logger.warn(`Unable to subscribe to ${streamPartId}`, { err, samplePartitions, activePartitions })
        }
        await wait(config.crawler.subscribeDuration)
        await node.unsubscribe(streamPartId)
    }
    node.removeMessageListener(messageListener)
    const calculateRate = (total: number) => {
        const elapsedSeconds = (config.crawler.subscribeDuration / 1000)
        const partitionMultiplier = activePartitions.length / samplePartitions.length
        return total / elapsedSeconds * partitionMultiplier
    }
    const rate = {
        messagesPerSecond: calculateRate(messageCount),
        bytesPerSecond: calculateRate(bytesSum),
        sampleMessage
    }
    // eslint-disable-next-line max-len
    logger.info(`Message rate ${streamId}: messagesPerSecond=${rate.messagesPerSecond}, bytesPerSecond=${rate.bytesPerSecond}`, { messageCount, samplePartitions, activePartitions })
    return rate
}
