import { Arg, Int, Query, Resolver } from 'type-graphql'
import { Inject, Service } from 'typedi'
import { OrderDirection } from '../entities/OrderDirection'
import { StreamOrderBy, Streams } from '../entities/Stream'
import { StreamRepository } from '../repository/StreamRepository'
import { StreamID } from 'streamr-client'
import { toEthereumAddress } from '@streamr/utils'

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
        @Arg("orderBy", () => StreamOrderBy, { nullable: true }) orderBy?: StreamOrderBy,
        @Arg("orderDirection", () => OrderDirection, { nullable: true }) orderDirection?: OrderDirection,
        @Arg("pageSize", () => Int, { nullable: true }) pageSize?: number,
        @Arg("cursor", { nullable: true }) cursor?: string,
    ): Promise<Streams> {
        return this.repository.getStreams(
            (ids !== undefined) ? ids.map((id) => id as StreamID) : undefined,
            searchTerm,
            (owner !== undefined) ? toEthereumAddress(owner) : undefined,
            orderBy,
            orderDirection,
            pageSize,
            cursor
        )
    }
}
