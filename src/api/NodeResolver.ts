import { DeepOmit } from 'ts-essentials'
import { Arg, FieldResolver, Int, Query, Resolver, Root } from 'type-graphql'
import { Inject, Service } from 'typedi'
import { Location, Node, Nodes } from '../entities/Node'
import { NodeRepository } from '../repository/NodeRepository'
import { getLocationFromIpAddress } from '../location'

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
        @Arg("cursor", { nullable: true }) cursor?: string,
    ): Promise<DeepOmit<Nodes, { items: { location: true }[] }>> {
        return this.repository.getNodes(ids, pageSize, cursor)
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
