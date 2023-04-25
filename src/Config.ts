import { NetworkNodeOptions } from '@streamr/network-node'
import { readFile } from 'fs/promises'
import { StreamrClientConfig, TrackerRegistryRecord } from 'streamr-client'
import { MarkRequired } from 'ts-essentials'
import { Token } from 'typedi'

export const CONFIG_TOKEN = new Token<Config>()

export interface Config {
    api: {
        port: number
        graphiql: boolean
    }
    crawler: {
        subscribeDuration: number
        iterationDelay: number
    }
    database: {
        host: string
        name: string
        user: string
        password: string
    }
    trackers: TrackerRegistryRecord[]
    networkNode: Omit<NetworkNodeOptions, | 'trackers' | 'metricsContext'>
    contracts: MarkRequired<
        Pick<
            Exclude<StreamrClientConfig['contracts'], undefined>, 
            'streamRegistryChainAddress' | 'streamRegistryChainRPCs' | 'theGraphUrl' | 'pollInterval'
        >, 'theGraphUrl'>
}

export const readFromFile = async (fileName: string): Promise<Config> => {
    const content = await readFile(fileName, { encoding: 'utf-8' })
    return JSON.parse(content) as Config
}
