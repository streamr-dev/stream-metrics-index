import { Logger, scheduleAtInterval } from '@streamr/utils'
import { max } from 'lodash'
import fetch from 'node-fetch'
import { Stream } from 'streamr-client'
import { StreamrClientFacade } from '../StreamrClientFacade'

const logger = new Logger(module)

/*
 * Poll The Graph to see whether there are stream which have created very recently.
 */

export class NewStreamsPoller {

    private latestPollTimestamp: number | undefined = undefined  // in seconds
    private readonly abortController = new AbortController()
    private readonly onNewStreamsAvailable: (streams: Stream[]) => Promise<void>
    private readonly theGraphUrl: string
    private readonly client: StreamrClientFacade
    private readonly pollInterval: number

    constructor(onNewStreamsAvailable: (streams: Stream[]) => Promise<void>, theGraphUrl: string, client: StreamrClientFacade, pollInterval: number) {
        this.onNewStreamsAvailable = onNewStreamsAvailable
        this.theGraphUrl = theGraphUrl
        this.client = client
        this.pollInterval = pollInterval
    }

    start(): void {
        // note that timestamps are not necessary in sync between the local computer and 
        // The Graph: in the first query we use local computer time, and in subsequent
        // queries we use the timestamp from the latest result
        this.latestPollTimestamp = Math.floor(Date.now() / 1000)
        setImmediate(async () => {
            await scheduleAtInterval(async () => {
                try {
                    // TODO could support pagination: currently just the first page (max 100 streams)
                    const query = this.createQuery()
                    const response = await fetch(this.theGraphUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ query })
                    })
                    const json = await response.json()
                    if (json.errors === undefined) {
                        const items = json.data.streams
                        if (items.length > 0) {
                            logger.info(`New streams: ${items.length}`)
                            const streams = await Promise.all(items.map((item: any) => this.client.getStream(item.id)))
                            this.latestPollTimestamp = max(items.map((item: any) => item.createdAt))
                            await this.onNewStreamsAvailable(streams)
                        }
                    } else {
                        logger.warn(`Error while querying The Graph: ${JSON.stringify(json.errors)}`)
                    }
                } catch (e: any) {
                    logger.warn(`Unable to poll new streams: ${e.message}`)
                }
            }, this.pollInterval, true, this.abortController.signal)    
        })
    }

    createQuery(): string {
        return `
            {
                streams(where: {
                    createdAt_gt: ${this.latestPollTimestamp!}
                }) {
                    id
                    createdAt
                }
            }
        `
    }

    destroy(): void {
        this.abortController.abort()
    }
}
