import { PeerDescriptor, getNodeIdFromPeerDescriptor } from '@streamr/dht'
import { StreamID, StreamPartID, StreamPartIDUtils, toStreamPartID } from '@streamr/protocol'
import { NodeInfo } from '@streamr/trackerless-network'
import { Logger, binaryToHex, wait } from '@streamr/utils'
import { difference, range, sortBy } from 'lodash'
import pLimit from 'p-limit'
import { DhtAddress, Stream, StreamCreationEvent, StreamMetadata, StreamPermission } from 'streamr-client'
import { Inject, Service } from 'typedi'
import { CONFIG_TOKEN, Config } from '../Config'
import { StreamRepository } from '../StreamRepository'
import { StreamrClientFacade } from '../StreamrClientFacade'
import { collect, retry } from '../utils'
import { NetworkNodeFacade } from './NetworkNodeFacade'
import { MAX_SUBSCRIPTION_COUNT, SubscribeGate } from './SubscribeGate'
import { getMessageRate } from './messageRate'

const logger = new Logger(module)

const getCrawlOrderComparator = (databaseStreams: { id: string, crawlTimestamp: number }[]) => {
    // first all streams, which have not been crawled yet
    // then other streams, most recently crawled last
    return (stream: Stream) => {
        const databaseStream = databaseStreams.find((s) => s.id === stream.id)
        if (databaseStream !== undefined) {
            return databaseStream.crawlTimestamp
        } else {
            return 0
        }
    }
}

const RECOVERY_DELAY = 5 * 60 * 1000  // TODO from config

const createPeerDescriptorLogOutput = (peerDescriptor: PeerDescriptor) => {
    return {
        id: getNodeIdFromPeerDescriptor(peerDescriptor),
        type: peerDescriptor.type,
        udp: peerDescriptor.udp,
        tcp: peerDescriptor.tcp,
        websocket: peerDescriptor.websocket,
        region: peerDescriptor.region,
        ipAddress: peerDescriptor.ipAddress,
        publicKey: (peerDescriptor.publicKey !== undefined) ? binaryToHex(peerDescriptor.publicKey) : undefined,
        signature: (peerDescriptor.signature !== undefined) ? binaryToHex(peerDescriptor.signature) : undefined
    }
}

const createNodeInfoLogOutput = (nodeInfo: NodeInfo) => {
    return {
        peerDescriptor: createPeerDescriptorLogOutput(nodeInfo.peerDescriptor),
        controlLayer: {
            neighbors: nodeInfo.controlLayer!.neighbors.map((n: PeerDescriptor) => getNodeIdFromPeerDescriptor(n)),
            connections: nodeInfo.controlLayer!.connections.map((n: PeerDescriptor) => getNodeIdFromPeerDescriptor(n))
        },
        streamPartitions: nodeInfo.streamPartitions.map((sp: any) => ({
            id: sp.id,
            controlLayerNeighbors: sp.controlLayerNeighbors.map((n: PeerDescriptor) => getNodeIdFromPeerDescriptor(n)),
            deliveryLayerNeighbors: sp.deliveryLayerNeighbors.map((n: PeerDescriptor) => getNodeIdFromPeerDescriptor(n))
        })),
        version: nodeInfo.version
    }
}

export const crawlTopology = async (
    localNode: NetworkNodeFacade,
    entryPoints: PeerDescriptor[],
    getNeighbors: (nodeInfo: NodeInfo) => PeerDescriptor[],
    logSummary = true
): Promise<Map<StreamPartID, Set<DhtAddress>>> => {
    const nodeInfos: Map<DhtAddress, NodeInfo> = new Map()
    const errorNodes: Set<DhtAddress> = new Set()
    const processNode = async (peerDescriptor: PeerDescriptor): Promise<void> => {
        const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)
        const processed = nodeInfos.has(nodeId) || errorNodes.has(nodeId)
        if (processed) {
            return
        }
        try {
            logger.info(`Querying ${nodeId}`)
            const info = await localNode.fetchNodeInfo(peerDescriptor)
            nodeInfos.set(nodeId, info)
            logger.info(`Queried ${nodeId}`, { info: createNodeInfoLogOutput(info) })
            for (const node of getNeighbors(info)) {
                await processNode(node)
            }
        } catch (err) {
            errorNodes.add(nodeId)
            logger.warn(`Query failed ${nodeId}`, { peerDescriptor: createPeerDescriptorLogOutput(peerDescriptor), error: err })
        }
    }
    for (const node of entryPoints) {
        await processNode(node)
    }
    const peers: Map<StreamPartID, Set<DhtAddress>> = new Map()
    for (const nodeInfo of nodeInfos.values()) {
        for (const streamPart of nodeInfo.streamPartitions) {
            const streamPartId = streamPart.id as StreamPartID
            const nodeIds = peers.get(streamPartId) ?? new Set()
            nodeIds.add(getNodeIdFromPeerDescriptor(nodeInfo.peerDescriptor!))
            for (const neighbor of streamPart.deliveryLayerNeighbors) {
                nodeIds.add(getNodeIdFromPeerDescriptor(neighbor))
            }
            peers.set(streamPartId, nodeIds)
        }
    }
    if (logSummary) {
        logger.info(`Topology summary: nodeCount=${nodeInfos.size}, errors=${errorNodes.size}, streamPartCount=${peers.size}`)
    }
    return peers
}

@Service()
export class Crawler {

    private readonly database: StreamRepository
    private readonly client: StreamrClientFacade
    private readonly config: Config
    private subscribeGate?: SubscribeGate
    private onStreamCreated?: (payload: StreamCreationEvent) => Promise<void>

    constructor(
        @Inject() database: StreamRepository,
        @Inject() client: StreamrClientFacade,
        @Inject(CONFIG_TOKEN) config: Config
    ) {
        this.database = database
        this.client = client
        this.config = config
    }

    async start(
        iterationCount: number | undefined = undefined
    ): Promise<void> {
        logger.info('Start')
        const networkNodeFacade = await this.client.getNetworkNodeFacade()
        this.subscribeGate = new SubscribeGate(networkNodeFacade)
        this.onStreamCreated = (payload) => this.createNewStreamListener(payload, networkNodeFacade)
        this.client.on('createStream', this.onStreamCreated)
        let iterationIndex = 0
        // eslint-disable-next-line no-constant-condition
        while (true) {
            try {
                const networkTopology = await crawlTopology(
                    networkNodeFacade,
                    this.client.getEntryPoints(),
                    (nodeInfo: NodeInfo) => nodeInfo.controlLayer!.neighbors
                )
                await this.analyzeContractStreams(networkTopology, this.subscribeGate)
            } catch (e) {
                logger.error('Error', { error: e })
                await wait(RECOVERY_DELAY)
            }
            logger.info('Crawl iteration completed')
            if ((iterationCount === undefined) || (iterationIndex < iterationCount - 1)) {
                await wait(this.config.crawler.iterationDelay)
                iterationIndex++
            } else {
                break
            }
        }
    }

    private async analyzeContractStreams(
        networkTopology: Map<StreamPartID, Set<DhtAddress>>,
        subscribeGate: SubscribeGate
    ): Promise<void> {
        // wrap this.client.getAllStreams() with retry because in streamr-docker-dev environment
        // the graph-node dependency may not be available immediately after the service has
        // been started
        const contractStreams = await retry(() => collect(this.client.getAllStreams()), 'Query streams')
        const databaseStreams = await this.database.getAllStreams()
        logger.info(`Streams: contract=${contractStreams.length}, database=${databaseStreams.length}`)
        const sortedContractStreams = sortBy(contractStreams, getCrawlOrderComparator(databaseStreams))

        // note that the task execution is primary limited by SubscribeGate, the concurrency setting
        // defined here is less relevant (but MAX_SUBSCRIPTION_COUNT is a good approximation
        // for the worker thread count as streams typically used only one partition)
        const workedThreadLimit = pLimit(MAX_SUBSCRIPTION_COUNT)
        await Promise.all(sortedContractStreams.map((stream: Stream) => {
            return workedThreadLimit(async () => {
                await this.analyzeStream(stream.id, stream.getMetadata(), networkTopology, subscribeGate)
            })
        }))

        await this.cleanupDeletedStreams(contractStreams, databaseStreams)
    }

    private async analyzeStream(
        id: StreamID,
        metadata: StreamMetadata,
        networkTopology: Map<StreamPartID, Set<DhtAddress>>,
        subscribeGate: SubscribeGate
    ): Promise<void> {
        logger.info(`Analyze ${id}`)
        const streamParts = [...networkTopology.keys()].filter((streamPartId) => {
            return StreamPartIDUtils.getStreamID(streamPartId) === id
        })
        const peersByPartition = new Map<number, Set<DhtAddress>>
        for (const streamPartId of streamParts) {
            peersByPartition.set(StreamPartIDUtils.getStreamPartition(streamPartId), networkTopology.get(streamPartId)!)
        }
        try {
            const peerIds = new Set(...peersByPartition.values())
            const messagesPerSecond = (peerIds.size > 0)
                ? await getMessageRate(
                    id, 
                    [...peersByPartition.keys()],
                    await this.client.  getNetworkNodeFacade(),
                    subscribeGate,
                    this.config
                )
                : 0
            const publisherCount = await this.client.getPublisherOrSubscriberCount(id, StreamPermission.PUBLISH)
            const subscriberCount = await this.client.getPublisherOrSubscriberCount(id, StreamPermission.SUBSCRIBE)
            logger.info(`Replace: ${id}`)
            await this.database.replaceStream({
                id,
                description: metadata.description ?? null,
                peerCount: peerIds.size,
                messagesPerSecond,
                publisherCount,
                subscriberCount
            })
        } catch (e: any) {
            logger.error(`Failed to analyze ${id}`, e)
        }
    }

    private async cleanupDeletedStreams(
        contractStreams: Stream[],
        databaseStreams: { id: string }[]
    ): Promise<void> {
        const contractStreamIds = contractStreams.map((s) => s.id)
        const databaseStreamIds = databaseStreams.map((s) => s.id)
        const removedStreamsIds = difference(databaseStreamIds, contractStreamIds)
        for (const streamId of removedStreamsIds) {
            logger.info(`Delete ${streamId}`)
            await this.database.deleteStream(streamId)
        }
    }

    private async createNewStreamListener(
        payload: StreamCreationEvent,
        localNode: NetworkNodeFacade
    ): Promise<void> {
        logger.info(`New stream ${payload.streamId}`)
        // first write some data quickly to the database without analyzing the stream
        // - assume no peers and no traffic
        // - assume that no explicit permissions have been granted yet (the creator
        //   is the only publisher and subscriber
        await this.database.replaceStream({
            id: payload.streamId,
            description: payload.metadata.description ?? null,
            peerCount: 0,
            messagesPerSecond: 0,
            publisherCount: 1,
            subscriberCount: 1
        })
        // we wait some time so that The Graph has been indexed the new stream
        // and it can provider valid publisher and subscriber counts to us
        await wait(this.config.crawler.newStreamAnalysisDelay)
        const networkTopology: Map<StreamPartID, Set<DhtAddress>> = new Map() 
        for (const partition of range(payload.metadata.partitions)) {
            const streamPartId = toStreamPartID(payload.streamId, partition)
            const entryPoints = await localNode.fetchStreamPartEntryPoints(streamPartId)
            const peers = (await crawlTopology(localNode, entryPoints, (nodeInfo: NodeInfo) => {
                const streamPartition = nodeInfo.streamPartitions.find((streamPartition) => streamPartition.id === streamPartId)
                return (streamPartition !== undefined)
                    ? streamPartition.deliveryLayerNeighbors
                    : []
            }, false)).get(streamPartId)
            if (peers !== undefined) {
                networkTopology.set(streamPartId, peers)
            }
        }
        await this.analyzeStream(payload.streamId, payload.metadata, networkTopology, this.subscribeGate!)
    }

    stop(): void {
        logger.info('Stop')
        this.client.off('createStream', this.onStreamCreated!)
        this.subscribeGate!.destroy()
    }
}
