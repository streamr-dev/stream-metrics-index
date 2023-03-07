import { StreamID, toStreamPartID } from '@streamr/protocol'
import { Logger, wait } from '@streamr/utils'
import { StreamMessage } from 'streamr-client'
import { Config } from '../Config'
import { NetworkNodeFacade } from './NetworkNodeFacade'

const logger = new Logger(module)

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
    for (const partition of activePartitions) {
        const streamPartId = toStreamPartID(streamId, partition)
        logger.info('Listen: %s', streamPartId)
        node.subscribe(streamPartId)
        await wait(config.crawler.subscribeDuration)
        node.unsubscribe(streamPartId)
    }
    node.removeMessageListener(messageListener)
    return messageCount / (config.crawler.subscribeDuration / 1000)
}
