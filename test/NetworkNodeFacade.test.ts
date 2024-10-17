import { randomDhtAddress, toDhtAddressRaw } from '@streamr/dht'
import { NetworkNode, NodeInfo } from '@streamr/trackerless-network'
import { randomBytes } from 'crypto'
import { NetworkNodeFacade } from '../src/crawler/NetworkNodeFacade'

const createTestPeerDescriptor = () => {
    return {
        nodeId: toDhtAddressRaw(randomDhtAddress()),
        type: 1,
        region: 2,
        ipAddress: 3,
        publicKey: randomBytes(10),
        signature: randomBytes(10)
    }
}

const NORMAL_INFO = {
    peerDescriptor: createTestPeerDescriptor(),
    controlLayer: {
        neighbors: [createTestPeerDescriptor()],
        connections: [createTestPeerDescriptor()]
    },
    streamPartitions: [{
        id: 'mock-stream-id',
        controlLayerNeighbors: [createTestPeerDescriptor()],
        deprecatedContentDeliveryLayerNeighbors: [],
        contentDeliveryLayerNeighbors: [{
            peerDescriptor: createTestPeerDescriptor(),
            rtt: 123
        }]
    }],
    version: '102.0.0-beta.0'
}
const LEGACY_INFO = {
    peerDescriptor: createTestPeerDescriptor(),
    controlLayer: {
        neighbors: [createTestPeerDescriptor()],
        connections: [createTestPeerDescriptor()]
    },
    streamPartitions: [{
        id: 'mock-stream-id',
        controlLayerNeighbors: [createTestPeerDescriptor()],
        deprecatedContentDeliveryLayerNeighbors: [createTestPeerDescriptor()],
        contentDeliveryLayerNeighbors: []
    }],
    version: '101.1.2'
}

const createMockNode = (rawNodeInfo: NodeInfo): Partial<NetworkNode>  => {
    return {
        fetchNodeInfo: async () => {
            return rawNodeInfo
        }
    }
}

describe('NetworkNodeFacade', () => {

    describe('fetch node info', () => {

        it('normal', async () => {
            const node = createMockNode(NORMAL_INFO)
            const facade = new NetworkNodeFacade(node as any, undefined as any)
            const info = await facade.fetchNodeInfo(undefined as any)
            expect(info.streamPartitions).toHaveLength(1)
            expect(info.streamPartitions[0]).toMatchObject({
                id: 'mock-stream-id',
                controlLayerNeighbors: expect.toBeArray(),
                contentDeliveryLayerNeighbors: [{
                    peerDescriptor: expect.toBeObject(),
                    rtt: 123
                }]
            })
        })

        it('legacy', async () => {
            const node = createMockNode(LEGACY_INFO)
            const facade = new NetworkNodeFacade(node as any, undefined as any)
            const info = await facade.fetchNodeInfo(undefined as any)
            expect(info.streamPartitions).toHaveLength(1)
            expect(info.streamPartitions[0]).toMatchObject({
                id: 'mock-stream-id',
                controlLayerNeighbors: expect.toBeArray(),
                contentDeliveryLayerNeighbors: [{
                    peerDescriptor: expect.toBeObject()
                }]
            })
        })
    })
})
