import { StreamID, toStreamPartID } from '@streamr/protocol'
import { Logger, wait } from '@streamr/utils'
import { sampleSize } from 'lodash'
import { StreamMessage } from 'streamr-client'
import { Config } from '../Config'
import { NetworkNodeFacade } from './NetworkNodeFacade'

const logger = new Logger(module)

export const MAX_PARTITION_COUNT = 10

export const getMessageRate = async (
    streamId: StreamID,
    activePartitions: number[],
    node: NetworkNodeFacade,
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
        const streamPartId = toStreamPartID(streamId, partition)
        logger.info('Listen: %s', streamPartId)
        node.subscribe(streamPartId)
        await wait(config.crawler.subscribeDuration)
        node.unsubscribe(streamPartId)
    }
    node.removeMessageListener(messageListener)
    const partitionMultiplier = activePartitions.length / samplePartitions.length
    return messageCount / (config.crawler.subscribeDuration / 1000) * partitionMultiplier
}
