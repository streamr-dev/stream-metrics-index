import { getNodeIdFromPeerDescriptor } from '@streamr/dht'
import { DhtAddress, StreamPartID } from '@streamr/sdk'
import { NodeInfo } from '@streamr/trackerless-network'
import { Multimap, numberToIpv4, StreamPartIDUtils } from '@streamr/utils'

export interface Node {
    id: DhtAddress
    streamPartNeighbors: Multimap<StreamPartID, DhtAddress>
    ipAddress?: string
}

export class Topology {

    private nodes: Map<DhtAddress, Node> = new Map()

    constructor(infos: NodeInfo[]) {
        const nodeIds = new Set(...[infos.map((info) => getNodeIdFromPeerDescriptor(info.peerDescriptor))])
        for (const info of infos) {
            const streamPartNeighbors: Multimap<StreamPartID, DhtAddress> = new Multimap()
            for (const streamPartitionInfo of info.streamPartitions) {
                const neighbors = streamPartitionInfo.contentDeliveryLayerNeighbors
                    .map((n) => getNodeIdFromPeerDescriptor(n))
                    .filter((id) => nodeIds.has(id))
                streamPartNeighbors.addAll(StreamPartIDUtils.parse(streamPartitionInfo.id), neighbors)
            }
            const nodeId = getNodeIdFromPeerDescriptor(info.peerDescriptor)
            this.nodes.set(nodeId, {
                id: nodeId,
                streamPartNeighbors,
                ipAddress: (info.peerDescriptor.ipAddress !== undefined) ? numberToIpv4(info.peerDescriptor.ipAddress) : undefined
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
