import { StreamPartIDUtils } from '@streamr/protocol'
import { FieldNode, GraphQLResolveInfo } from 'graphql'
import { Arg, Info, Int, Query, Resolver } from 'type-graphql'
import { Inject, Service } from 'typedi'
import { NeighborInput, Neighbors, Nodes } from '../entities/Node'
import { NodeRepository } from '../repository/NodeRepository'

@Resolver()
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
    ): Promise<Nodes> {
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
}
