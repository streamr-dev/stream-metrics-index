import { PeerDescriptor, randomDhtAddress, toNodeId, toDhtAddressRaw } from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/utils'
import { range } from 'lodash'
import { Topology } from '../src/crawler/Topology'

const STREAM_PART_ID_1 = StreamPartIDUtils.parse('stream#1')
const STREAM_PART_ID_2 = StreamPartIDUtils.parse('stream#2')

describe('Topology', () => {

    it('ignore unknown neighbors', () => {
        const nodes: PeerDescriptor[] = range(3).map(() => ({
            nodeId: toDhtAddressRaw(randomDhtAddress()),
        } as any))
        const topology = new Topology([{
            peerDescriptor: nodes[0],
            streamPartitions: [{
                id: STREAM_PART_ID_1,
                contentDeliveryLayerNeighbors: [
                    { peerDescriptor: nodes[1] },
                    { peerDescriptor: nodes[2] }
                ],
                controlLayerNeighbors: undefined as any
            }]
        }, {
            peerDescriptor: nodes[2],
            streamPartitions: [{
                id: STREAM_PART_ID_2,
                contentDeliveryLayerNeighbors: [
                    { peerDescriptor: nodes[0] },
                    { peerDescriptor: nodes[1] },
                    { peerDescriptor: nodes[2] }
                ],
                controlLayerNeighbors: undefined as any
            }]
        }])
        expect(topology.getNeighbors(toNodeId(nodes[0]), STREAM_PART_ID_1).map((n) => n.nodeId)).toIncludeSameMembers([
            toNodeId(nodes[2])
        ])
        expect(topology.getNeighbors(toNodeId(nodes[2]), STREAM_PART_ID_2).map((n) => n.nodeId)).toIncludeSameMembers([
            toNodeId(nodes[0]), toNodeId(nodes[2])
        ])
    })
})
