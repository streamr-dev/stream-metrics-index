import { DhtAddress, PeerDescriptor, toNodeId } from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/utils'
import { crawlTopology } from '../src/crawler/Crawler'
import { createTestPeerDescriptor } from './utils'
import { NormalizedNodeInfo } from '../src/crawler/NetworkNodeFacade'

const STREAM_PART_ID = StreamPartIDUtils.parse('stream#0')

describe('Crawler', () => {

    let nodes: PeerDescriptor[]
    let neighbors: Map<DhtAddress, PeerDescriptor[]>

    const createMockNodeInfo = (peerDescriptor: PeerDescriptor): NormalizedNodeInfo => {
        return {
            peerDescriptor,
            controlLayer: {
                neighbors: [],
                connections: []
            },
            streamPartitions: [{
                id: STREAM_PART_ID,
                controlLayerNeighbors: [],
                contentDeliveryLayerNeighbors: neighbors.get(toNodeId(peerDescriptor))!.map((n) => ({
                    peerDescriptor: n
                })) ?? []
            }],
            applicationVersion: '102.0.0'
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
        neighbors.set(toNodeId(nodes[0]), [nodes[1], nodes[2]])
        neighbors.set(toNodeId(nodes[1]), [nodes[4]])
        neighbors.set(toNodeId(nodes[2]), [nodes[3]])
        neighbors.set(toNodeId(nodes[3]), [])
        neighbors.set(toNodeId(nodes[4]), [nodes[1], nodes[2], nodes[5]])
        neighbors.set(toNodeId(nodes[5]), [nodes[6]])
        neighbors.set(toNodeId(nodes[6]), [])
    })

    it('crawlTopology', async () => {
        const localNode = {
            fetchNodeInfo: jest.fn().mockImplementation(async (peerDescriptor: PeerDescriptor) => {
                return createMockNodeInfo(
                    peerDescriptor
                )
            })
        }
        const topology = await crawlTopology(
            localNode as any,
            [nodes[0], nodes[5]],
            (response: NormalizedNodeInfo) => response.streamPartitions[0].contentDeliveryLayerNeighbors.map((n) => n.peerDescriptor!),
            ''
        )
        expect(localNode.fetchNodeInfo).toHaveBeenCalledTimes(nodes.length)
        expect([...topology.getPeers(STREAM_PART_ID)]).toIncludeSameMembers(nodes.map(toNodeId))
    })
})
