import { StreamPartIDUtils } from '@streamr/protocol'
import { DhtAddress } from 'streamr-client'
import { DeepOmit } from 'ts-essentials'
import { Arg, FieldResolver, Int, Query, Resolver, Root } from 'type-graphql'
import { Inject, Service } from 'typedi'
import { Location, Neighbors, Node, Nodes } from '../entities/Node'
import { getLocationFromIpAddress } from '../location'
import { NodeRepository } from '../repository/NodeRepository'

@Resolver(() => Node)
@Service()
export class NodeResolver {

    private repository: NodeRepository

    constructor(
        @Inject() repository: NodeRepository
    ) {
        this.repository = repository
    }

    @Query(() => Nodes)
    async nodes(
        @Arg("ids", () => [String], { nullable: true }) ids?: string[],
        @Arg("pageSize", () => Int, { nullable: true }) pageSize?: number,
        @Arg("cursor", { nullable: true }) cursor?: string
    ): Promise<DeepOmit<Nodes, { items: { location: never }[] }>> {
        return this.repository.getNodes(
            (ids !== undefined) ? ids.map((id) => id as DhtAddress) : undefined,
            pageSize,
            cursor
        )
    }

    @Query(() => Neighbors)
    async neighbors(
        @Arg("node", { nullable: true }) nodeId?: DhtAddress,
        @Arg("streamPart", { nullable: true }) streamPart?: string,
        @Arg("pageSize", () => Int, { nullable: true }) pageSize?: number,
        @Arg("cursor", { nullable: true }) cursor?: string
    ): Promise<Neighbors> {
        return this.repository.getNeighbors(
            (nodeId !== undefined) ? nodeId as DhtAddress : undefined,
            (streamPart !== undefined) ? StreamPartIDUtils.parse(streamPart) : undefined,
            pageSize,
            cursor
        )
    }

    // eslint-disable-next-line class-methods-use-this
    @FieldResolver()
    location(@Root() node: Node): Location | null {
        if (node.ipAddress !== null) {
            return getLocationFromIpAddress(node.ipAddress) ?? null
        } else {
            return null
        }
    }
}
