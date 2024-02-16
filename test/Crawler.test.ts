import { DhtAddress, PeerDescriptor, getNodeIdFromPeerDescriptor } from '@streamr/dht'
import { NodeInfo } from '@streamr/trackerless-network'
import { crawlTopology } from '../src/crawler/Crawler'
import { createTestPeerDescriptor } from './utils'
import { StreamPartIDUtils } from '@streamr/protocol'

const STREAM_PART_ID = StreamPartIDUtils.parse('stream#0')

describe('Crawler', () => {

    let nodes: PeerDescriptor[]
    let neighbors: Map<DhtAddress, PeerDescriptor[]>

    const createMockNodeInfo = (peerDescriptor: PeerDescriptor): NodeInfo => {
        return {
            peerDescriptor,
            controlLayer: {
                neighbors: neighbors.get(getNodeIdFromPeerDescriptor(peerDescriptor)) ?? [],
                connections: []
            },
            streamPartitions: [{ 
                id: STREAM_PART_ID,
                controlLayerNeighbors: [],
                deliveryLayerNeighbors: []
            }],
            version: ''
        }
    }

    beforeAll(() => {
        nodes = [
            createTestPeerDescriptor(),
            createTestPeerDescriptor(),
            createTestPeerDescriptor(),
            createTestPeerDescriptor(),
            createTestPeerDescriptor(),
            createTestPeerDescriptor(),
            createTestPeerDescriptor()
        ]
        neighbors = new Map()
        neighbors.set(getNodeIdFromPeerDescriptor(nodes[0]), [nodes[1], nodes[2]])
        neighbors.set(getNodeIdFromPeerDescriptor(nodes[1]), [nodes[4]])
        neighbors.set(getNodeIdFromPeerDescriptor(nodes[2]), [nodes[3]])
        neighbors.set(getNodeIdFromPeerDescriptor(nodes[3]), [])
        neighbors.set(getNodeIdFromPeerDescriptor(nodes[4]), [nodes[1], nodes[2], nodes[5]])
        neighbors.set(getNodeIdFromPeerDescriptor(nodes[5]), [nodes[6]])
        neighbors.set(getNodeIdFromPeerDescriptor(nodes[6]), [])
    })

    it('crawlTopology', async () => {
        const localNode = {
            fetchNodeInfo: jest.fn().mockImplementation(async (peerDescriptor: PeerDescriptor) => {
                return createMockNodeInfo(
                    peerDescriptor
                )
            })
        }
        const networkTopology = await crawlTopology(localNode as any, [nodes[0], nodes[5]], (response: NodeInfo) => response.controlLayer!.neighbors)
        expect(localNode.fetchNodeInfo).toHaveBeenCalledTimes(nodes.length)
        expect([...networkTopology.get(STREAM_PART_ID)!]).toIncludeSameMembers(nodes.map((n) => getNodeIdFromPeerDescriptor(n)))
    })
})
