import { StreamID, toStreamPartID } from '@streamr/protocol'
import { Gate, Logger, wait } from '@streamr/utils'
import { sampleSize } from 'lodash'
import { StreamMessage } from 'streamr-client'
import { Config } from '../Config'
import { NetworkNodeFacade } from './NetworkNodeFacade'

const logger = new Logger(module)

// If there are many partitions, we approximate the message rate of a stream by analyzing only some of the partitions.
// We assume that traffic levels in each partitions are be quite similar.
export const MAX_PARTITION_COUNT = 10

export const getMessageRate = async (
    streamId: StreamID,
    activePartitions: number[],
    node: NetworkNodeFacade,
    subscibeGate: Gate,
    config: Config
): Promise<number> => {
    let messageCount = 0
    const messageListener = (msg: StreamMessage) => {
        if (msg.getStreamId() === streamId) {
            messageCount++
        }
    }
    node.addMessageListener(messageListener)
    const samplePartitions = sampleSize(activePartitions, MAX_PARTITION_COUNT)
    for (const partition of samplePartitions) {
        await subscibeGate.waitUntilOpen()
        const streamPartId = toStreamPartID(streamId, partition)
        logger.info(`Listen: ${streamPartId}`)
        try {
            await node.subscribe(streamPartId)
        } catch (err) {
            logger.warn(`Unable to subscribe to ${streamPartId}`, { err, samplePartitions, activePartitions })
        }
        await wait(config.crawler.subscribeDuration)
        await node.unsubscribe(streamPartId)
    }
    node.removeMessageListener(messageListener)
    const partitionMultiplier = activePartitions.length / samplePartitions.length
    const rate = messageCount / (config.crawler.subscribeDuration / 1000) * partitionMultiplier
    logger.info(`Message rate ${streamId}: ${rate}`, { messageCount, samplePartitions, activePartitions })
    return rate
}
