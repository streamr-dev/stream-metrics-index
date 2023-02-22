import { Arg, Int, Query, Resolver } from 'type-graphql'
import { Inject, Service } from 'typedi'
import { OrderBy, Streams, Summary } from '../entities'
import { StreamRepository } from '../StreamRepository'

@Resolver()
@Service()
export class StreamResolver {

    private repository: StreamRepository

    constructor(
        @Inject() repository: StreamRepository
    ) {
        this.repository = repository
    }

    @Query(() => Streams)
    async streams(
        @Arg("ids", () => [String], { nullable: true }) ids?: string[],
        @Arg("searchTerm", { nullable: true }) searchTerm?: string,
        @Arg("owner", { nullable: true }) owner?: string,
        @Arg("orderBy", () => OrderBy, { nullable: true }) orderBy?: OrderBy,
        @Arg("pageSize", () => Int, { nullable: true }) pageSize?: number,
        @Arg("cursor", { nullable: true }) cursor?: string,
    ): Promise<Streams> {
        return this.repository.getStreams(ids, searchTerm, owner, orderBy, pageSize, cursor)
    }

    @Query(() => Summary)
    async summary(): Promise<Summary> {
        return this.repository.getSummary()
    }
}
