import 'reflect-metadata'

import { PeerDescriptor, randomDhtAddress, toDhtAddress, toDhtAddressRaw } from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/utils'
import { range } from 'lodash'
import Container from 'typedi'
import { CONFIG_TOKEN } from '../src/Config'
import { Topology } from '../src/crawler/Topology'
import { NodeRepository } from '../src/repository/NodeRepository'
import { createDatabase } from '../src/utils'
import { TEST_DATABASE_NAME, dropTestDatabaseIfExists } from './utils'

const STREAM_PART_ID = StreamPartIDUtils.parse('stream#1')

describe('NodeRepository', () => {

    beforeEach(async () => {
        const config = {
            database: {
                host: '10.200.10.1',
                name: TEST_DATABASE_NAME,
                user: 'root',
                password: 'password'
            }
        }
        await dropTestDatabaseIfExists(config.database)
        await createDatabase(config.database)
        Container.set(CONFIG_TOKEN, config)
    })

    afterEach(() => {
        Container.reset()
    })

    it('replace topology', async () => {
        const repository = Container.get(NodeRepository)

        const peerDescriptors: PeerDescriptor[] = range(2).map(() => ({
            nodeId: toDhtAddressRaw(randomDhtAddress())
        } as any))
        const nodes = [{
            peerDescriptor: peerDescriptors[0],
            streamPartitions: [{
                id: STREAM_PART_ID,
                contentDeliveryLayerNeighbors: [{ peerDescriptor: peerDescriptors[1], rtt: 100 }],
                controlLayerNeighbors: undefined as any
            }]
        }, {
            peerDescriptor: peerDescriptors[1],
            streamPartitions: [{
                id: STREAM_PART_ID,
                contentDeliveryLayerNeighbors: [{ peerDescriptor: peerDescriptors[0], rtt: 200 }],
                controlLayerNeighbors: undefined as any
            }]
        }]
        const topology = new Topology(nodes)
        await repository.replaceNetworkTopology(topology)

        const nodeIds = peerDescriptors.map((p) => toDhtAddress(p.nodeId))
        const actualNodes = await repository.getNodes()
        expect(actualNodes.items.map((item) => item.id)).toIncludeSameMembers(nodeIds)
        const actualNeighbors = await repository.getNeighbors()
        expect(actualNeighbors.items).toHaveLength(1)
        expect(actualNeighbors.items[0].streamPartId).toBe(STREAM_PART_ID)
        expect(actualNeighbors.items[0].rtt).toBe(150)
        expect([actualNeighbors.items[0].nodeId1, actualNeighbors.items[0].nodeId2]).toIncludeSameMembers(nodeIds)
    })
})
