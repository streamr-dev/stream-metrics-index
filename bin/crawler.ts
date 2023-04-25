#!/usr/bin/env node

import 'reflect-metadata'

import Container from 'typedi'
import { CONFIG_TOKEN, readFromFile } from '../src/Config'
import { Crawler } from '../src/crawler/Crawler'

const main = async () => {
    const configFile = process.argv[2]
    const config = await readFromFile(configFile)
    Container.set(CONFIG_TOKEN, config)
    const crawler = Container.get(Crawler)
    crawler.start()
}

main()
