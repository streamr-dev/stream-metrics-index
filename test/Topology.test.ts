import { PeerDescriptor, createRandomDhtAddress, getNodeIdFromPeerDescriptor, getRawFromDhtAddress } from '@streamr/dht'
import { Topology } from '../src/crawler/Topology'
import { StreamPartIDUtils } from '@streamr/protocol'
import { range } from 'lodash'

const STREAM_PART_ID_1 = StreamPartIDUtils.parse('stream#1')
const STREAM_PART_ID_2 = StreamPartIDUtils.parse('stream#2')

describe('Topology', () => {

    it('ignore unknown neighbors', () => {
        const nodes: PeerDescriptor[] = range(3).map(() => ({
            nodeId: getRawFromDhtAddress(createRandomDhtAddress()),
        } as any))
        const topology = new Topology([{
            peerDescriptor: nodes[0],
            streamPartitions: [{
                id: STREAM_PART_ID_1,
                deliveryLayerNeighbors: [nodes[1], nodes[2]]
            }]
        }, {
            peerDescriptor: nodes[2],
            streamPartitions: [{
                id: STREAM_PART_ID_2,
                deliveryLayerNeighbors: [nodes[0], nodes[1], nodes[2]]
            }]
        }] as any)
        expect([...topology.getNeighbors(getNodeIdFromPeerDescriptor(nodes[0]), STREAM_PART_ID_1)]).toIncludeSameMembers([
            getNodeIdFromPeerDescriptor(nodes[2])
        ])
        expect([...topology.getNeighbors(getNodeIdFromPeerDescriptor(nodes[2]), STREAM_PART_ID_2)]).toIncludeSameMembers([
            getNodeIdFromPeerDescriptor(nodes[0]), getNodeIdFromPeerDescriptor(nodes[2])
        ])
    })
})
