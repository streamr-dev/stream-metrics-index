import { getNodeIdFromPeerDescriptor } from '@streamr/dht'
import { NodeInfo } from '@streamr/trackerless-network'
import { DhtAddress, StreamPartID } from 'streamr-client'

export class Topology {

    private nodeInfos: NodeInfo[]

    constructor(nodeInfos: NodeInfo[]) {
        this.nodeInfos = nodeInfos
    }

    getPeers(streamPartId: StreamPartID): Set<DhtAddress> {
        const nodeIds: Set<DhtAddress> = new Set()
        for (const info of this.nodeInfos) {
            const streamPart = info.streamPartitions.find((sp) => sp.id === streamPartId)
            if (streamPart !== undefined) {
                nodeIds.add(getNodeIdFromPeerDescriptor(info.peerDescriptor))
                for (const neighbor of streamPart.deliveryLayerNeighbors) {
                    nodeIds.add(getNodeIdFromPeerDescriptor(neighbor))
                }
            }
        }
        return nodeIds
    }

    getNodeInfos(): NodeInfo[] {
        return this.nodeInfos
    }

    addNodeInfos(nodeInfos: NodeInfo[]): void {
        this.nodeInfos.push(...nodeInfos)
    }
}
