import { getNodeIdFromPeerDescriptor } from '@streamr/dht'
import { NodeInfo } from '@streamr/trackerless-network'
import { Multimap } from '@streamr/utils'
import { DhtAddress, StreamPartID } from 'streamr-client'

interface Node {
    id: DhtAddress
    streamPartNeighbors: Multimap<StreamPartID, DhtAddress>
}

export class Topology {

    private nodes: Map<DhtAddress, Node> = new Map()

    constructor(infos: NodeInfo[]) {
        const nodeIds = new Set(...[infos.map((info) => getNodeIdFromPeerDescriptor(info.peerDescriptor))])
        for (const info of infos) {
            const streamPartNeighbors: Multimap<StreamPartID, DhtAddress> = new Multimap()
            for (const streamPartitionInfo of info.streamPartitions) {
                const neighbors = streamPartitionInfo.deliveryLayerNeighbors
                    .map((n) => getNodeIdFromPeerDescriptor(n))
                    .filter((id) => nodeIds.has(id))
                streamPartNeighbors.addAll(streamPartitionInfo.id as StreamPartID, neighbors)
            }
            const nodeId = getNodeIdFromPeerDescriptor(info.peerDescriptor)
            this.nodes.set(nodeId, {
                id: nodeId,
                streamPartNeighbors
            })
        }
    }

    getNodes(): Node[] {
        return [...this.nodes.values()]
    }

    getNeighbors(nodeId: DhtAddress, streamPartId: StreamPartID): DhtAddress[] {
        return this.nodes.get(nodeId)?.streamPartNeighbors.get(streamPartId) ?? []
    }

    getPeers(streamPartId: StreamPartID): Set<DhtAddress> {
        const nodeIds: Set<DhtAddress> = new Set()
        for (const node of this.nodes.values()) {
            const neighbors = node.streamPartNeighbors.get(streamPartId)
            if (neighbors.length > 0) {
                nodeIds.add(node.id)
                for (const neighbor of neighbors) {
                    nodeIds.add(neighbor)
                }
            }
        }
        return nodeIds
    }
}
