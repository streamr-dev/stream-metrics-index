#!/usr/bin/env node

import 'reflect-metadata'

import { readFromFile } from '../src/Config'
import { createDatabase, ensureDatabaseConnectivity } from '../src/utils'

const main = async () => {
    const configFile = process.argv[2]
    const config = await readFromFile(configFile)
    // test database connectivity because in streamr-docker-dev environment
    // mysql dependency may not be available immediately after the service has
    // been started
    await ensureDatabaseConnectivity(config.database)
    await createDatabase(config.database)
}

main()
