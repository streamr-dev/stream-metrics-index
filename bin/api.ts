#!/usr/bin/env node

import 'reflect-metadata'

import Container from 'typedi'
import { APIServer } from '../src/api/APIServer'
import { CONFIG_TOKEN, readFromFile } from '../src/Config'

const main = async () => {
    const configFile = process.argv[2]
    const config = await readFromFile(configFile)
    Container.set(CONFIG_TOKEN, config)
    const apiServer = Container.get(APIServer)
    apiServer.start()
}

main()
