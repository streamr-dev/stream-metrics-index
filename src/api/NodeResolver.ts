import { StreamPartIDUtils } from '@streamr/protocol'
import { FieldNode, GraphQLResolveInfo } from 'graphql'
import { DeepOmit } from 'ts-essentials'
import { Arg, FieldResolver, Info, Int, Query, Resolver, Root } from 'type-graphql'
import { Inject, Service } from 'typedi'
import { Location, NeighborInput, Neighbors, Node, Nodes } from '../entities/Node'
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
        @Info() info: GraphQLResolveInfo,
        @Arg("ids", () => [String], { nullable: true }) ids?: string[],
        @Arg("streamPart", { nullable: true }) streamPart?: string,
        @Arg("neighbor", { nullable: true }) neighbor?: NeighborInput,
        @Arg("pageSize", () => Int, { nullable: true }) pageSize?: number,
        @Arg("cursor", { nullable: true }) cursor?: string,
    ): Promise<DeepOmit<Nodes, { items: { location: never }[] }>> {
        const nodesField = info.fieldNodes[0]
        const itemsField = nodesField.selectionSet!.selections[0] as FieldNode
        const requestedFields = itemsField.selectionSet!.selections
        return this.repository.getNodes(
            new Set(requestedFields.map((f: any) => f.name.value)),
            ids,
            (streamPart !== undefined) ? StreamPartIDUtils.parse(streamPart) : undefined,
            neighbor,
            pageSize,
            cursor
        )
    }

    @Query(() => Neighbors)
    async neighbors(
        @Arg("streamPart", { nullable: false }) streamPart: string,
    ): Promise<Neighbors> {
        return this.repository.getNeighbors(StreamPartIDUtils.parse(streamPart))
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
