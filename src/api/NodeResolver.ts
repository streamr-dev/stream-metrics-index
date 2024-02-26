import { Arg, Info, Int, Query, Resolver } from 'type-graphql'
import { Inject, Service } from 'typedi'
import { Nodes } from '../entities/Node'
import { NodeRepository } from '../repository/NodeRepository'
import { FieldNode, GraphQLResolveInfo } from 'graphql'

export type NodesQueryFields = 'location'

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
        @Arg("pageSize", () => Int, { nullable: true }) pageSize?: number,
        @Arg("cursor", { nullable: true }) cursor?: string,
    ): Promise<Nodes> {
        const nodesField = info.fieldNodes[0]
        const itemsField = nodesField.selectionSet!.selections[0] as FieldNode
        const requestedFields = itemsField.selectionSet!.selections
        return this.repository.getNodes(
            new Set<NodesQueryFields>(requestedFields.map((f: any) => f.name.value)),
            ids,
            pageSize,
            cursor
        )
    }
}
