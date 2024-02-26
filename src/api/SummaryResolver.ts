import { Query, Resolver } from 'type-graphql'
import { Inject, Service } from 'typedi'
import { Summary } from '../entities/Summary'
import { SummaryRepository } from '../repository/SummaryRepository'

@Resolver()
@Service()
export class SummaryResolver {

    private repository: SummaryRepository

    constructor(
        @Inject() repository: SummaryRepository
    ) {
        this.repository = repository
    }

    @Query(() => Summary)
    async summary(): Promise<Summary> {
        return this.repository.getSummary()
    }
}
