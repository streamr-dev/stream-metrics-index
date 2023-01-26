#!/usr/bin/env node

import { readFromFile } from '../src/Config'
import { queryAPI } from '../src/utils'

const main = async () => {
    const configFile = process.argv[2]
    const config = await readFromFile(configFile)
    await queryAPI('{ streams(pageSize:1) { items { id } } }', config.api.port)
}

main()