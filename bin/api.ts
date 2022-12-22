#!/usr/bin/env node

import 'reflect-metadata'

import Container from 'typedi'
import { APIServer } from '../src/api/APIServer'
import { CONFIG_TOKEN, readFromFile } from '../src/Config'

const main = async () => {
    const configFile = process.argv[2]
    Container.set(CONFIG_TOKEN, await readFromFile(configFile))
    const apiServer = Container.get(APIServer)
    apiServer.start()
}

main()
