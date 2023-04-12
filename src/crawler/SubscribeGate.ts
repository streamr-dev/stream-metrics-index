import { Logger, MetricsContext, MetricsReport, RateMetric } from '@streamr/utils'
import { Service } from 'typedi'
import { Gate } from '../Gate'
import { Events, NetworkNodeFacade } from './NetworkNodeFacade'

// TODO move MAX_MESSAGES_PER_SECOND, MAX_SUBSCRIPTION_COUNT and MESSAGE_RATE_POLL_INTERVAL to the config file
const MAX_MESSAGES_PER_SECOND = 100
export const MAX_SUBSCRIPTION_COUNT = 20
const MESSAGE_RATE_POLL_INTERVAL = 30
const METRICS_NAMESPACE = 'dummy'

const logger = new Logger(module)

/*
 * A gate which is open as long as the node is partially idle, and we are therefore allowed
 * to subscribe to more streams. The state is determined from the message rate and the count
 * of currently subscribed stream parts.
 * 
 * The idle state is changed when a scheduler updates the current message rate and when
 * we get a susbcribe/unsubscribe event from the network node
 * 
 * The first subscription is always accepted immediatelly as the gate is initally open. Then
 * we close the gate after the first subscription is made as we don't yet have any message
 * rate data available at that time. The gate is typically opened for the next subscription 
 * after MESSAGE_RATE_POLL_INTERVAL when we have message rate data available.
 */

@Service()
export class SubscribeGate extends Gate {

    private readonly node: NetworkNodeFacade
    private readonly abortController: AbortController = new AbortController()
    private messagesPerSecond: number = 0
    private latestSubscribeTimestamp: number = 0

    constructor(
        node: NetworkNodeFacade
    ) {
        super(true)
        this.node = node
        this.initMessageRateObserver()
        this.initSubscriptionCountObserver()
        this.node.on('subscribe', () => {
            this.latestSubscribeTimestamp = Date.now()
        })
    }

    private initMessageRateObserver() {
        const metricsContext = new MetricsContext()
        const messagesRateMetric = new RateMetric()
        metricsContext.addMetrics(METRICS_NAMESPACE, {
            messagesPerSecond: messagesRateMetric
        })
        this.node.addMessageListener(() => {
            messagesRateMetric.record(1)
        })
        metricsContext.createReportProducer((report: MetricsReport) => {
            this.messagesPerSecond = report[METRICS_NAMESPACE].messagesPerSecond
            this.updateGate()
            if (!this.isOpen()) {
                // TODO move to debug-level or remove?
                // eslint-disable-next-line max-len
                logger.info(`Subscribe gate is closed: messagesPerSecond=${this.messagesPerSecond}, latestSubscribeTimestamp=${this.latestSubscribeTimestamp}, subscriptions=${this.node.getSubscriptions().join()}`)
            }
        }, MESSAGE_RATE_POLL_INTERVAL * 1000, this.abortController.signal)
    }

    private initSubscriptionCountObserver() {
        const nodeEvents: (keyof Events)[] = ['subscribe', 'unsubscribe']
        nodeEvents.forEach((eventName) => {
            this.node.on(eventName, () => this.updateGate())
        })
    }

    private updateGate(): void {
        if (this.isPartiallyIdle()) {
            this.open()
        } else {
            this.close()
        }
    }

    private isPartiallyIdle(): boolean {
        const elapsedTimeSinceLatestSubscribe = Date.now() - this.latestSubscribeTimestamp
        if (elapsedTimeSinceLatestSubscribe < MESSAGE_RATE_POLL_INTERVAL * 1000) {
            // can't know whether we are idle or not, because we added a new subscription recently
            // and we don't know yet how much traffic there is in that stream part
            return false
        }
        const subscriptionCount = this.node.getSubscriptions().length
        if (subscriptionCount === 0) {
            // if there are no longer any subscriptions, we know that there are currently no
            // traffic (we can ignore messagesPerSecond value as it most likely contains
            // out-of-date data)
            return true
        }
        return (this.messagesPerSecond < MAX_MESSAGES_PER_SECOND) && (subscriptionCount < MAX_SUBSCRIPTION_COUNT)
    }

    destroy(): void {
        this.abortController.abort()
    }
}
