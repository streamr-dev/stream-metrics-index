import { Logger } from '@streamr/utils'
import cors from 'cors'
import { once } from 'events'
import express from 'express'
import { graphqlHTTP } from 'express-graphql'
import { Server } from 'http'
import { AddressInfo } from 'net'
import { buildSchema } from 'type-graphql'
import { Container, Inject, Service } from 'typedi'
import { Config, CONFIG_TOKEN } from '../Config'
import { StreamResolver } from './StreamResolver'
import { SummaryResolver } from './SummaryResolver'

const logger = new Logger(module)

const ENDPOINT = '/api'

@Service()
export class APIServer {

    private httpServer?: Server
    private readonly config: Config

    constructor(
        @Inject(CONFIG_TOKEN) config: Config
    ) {
        this.config = config
    }

    async start(): Promise<void> {
        const schema = await buildSchema({
            resolvers: [StreamResolver, SummaryResolver],
            container: Container,
            validate: false
        })
        const app = express()
        app.use(cors())
        app.use(
            ENDPOINT,
            graphqlHTTP({
                schema: schema,
                graphiql: this.config.api.graphiql
            })
        )
        const port = this.config.api.port
        this.httpServer = app.listen(port)
        await once(this.httpServer, 'listening')
        logger.info('API server started')
    }

    getPort(): number {
        return (this.httpServer?.address() as AddressInfo).port
    }

    async destroy(): Promise<void> {
        if (this.httpServer !== undefined && this.httpServer.listening) {
            this.httpServer.close()
            await once(this.httpServer, 'close')
        }
    }
}
