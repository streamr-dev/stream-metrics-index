import { Arg, Int, Query, Resolver } from 'type-graphql'
import { Inject, Service } from 'typedi'
import { Nodes } from '../entities/Node'
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
        @Arg("ids", () => [String], { nullable: true }) ids?: string[],
        @Arg("pageSize", () => Int, { nullable: true }) pageSize?: number,
        @Arg("cursor", { nullable: true }) cursor?: string,
    ): Promise<Nodes> {
        return this.repository.getNodes(ids, pageSize, cursor)
    }
}
