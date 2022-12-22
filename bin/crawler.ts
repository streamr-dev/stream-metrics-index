#!/usr/bin/env node

import 'reflect-metadata'

import Container from 'typedi'
import { CONFIG_TOKEN, readFromFile } from '../src/Config'
import { Crawler } from '../src/crawler/Crawler'

const main = async () => {
    const configFile = process.argv[2]
    Container.set(CONFIG_TOKEN, await readFromFile(configFile))
    const crawler = Container.get(Crawler)
    // eslint-disable-next-line no-constant-condition
    while (true) {
        await crawler.updateStreams()
    }
}

main()
