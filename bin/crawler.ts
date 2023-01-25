#!/usr/bin/env node

import 'reflect-metadata'

import Container from 'typedi'
import { CONFIG_TOKEN, readFromFile } from '../src/Config'
import { Crawler } from '../src/crawler/Crawler'
import { wait } from '@streamr/utils'

const main = async () => {
    const configFile = process.argv[2]
    const config = await readFromFile(configFile)
    Container.set(CONFIG_TOKEN, config)
    const crawler = Container.get(Crawler)
    // eslint-disable-next-line no-constant-condition
    while (true) {
        await crawler.updateStreams()
        await wait(config.crawler.iterationDelay)
    }
}

main()
