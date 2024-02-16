import { readFile } from 'fs/promises'
import { StreamrClientConfig } from 'streamr-client'
import { Token } from 'typedi'

export const CONFIG_TOKEN = new Token<Config>()

export interface Config {
    api: {
        port: number
        graphiql: boolean
    }
    crawler: {
        subscribeDuration: number
        newStreamAnalysisDelay: number  // TODO add value for this in the production config
        iterationDelay: number
    }
    database: {
        host: string
        name: string
        user: string
        password: string
    }
    client: StreamrClientConfig
}

export const readFromFile = async (fileName: string): Promise<Config> => {
    const content = await readFile(fileName, { encoding: 'utf-8' })
    return JSON.parse(content) as Config
}
