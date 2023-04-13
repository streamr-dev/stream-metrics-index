import { wait, waitForCondition } from '@streamr/utils'
import { Server } from 'http'
import { AddressInfo } from 'net'
import { StreamID } from 'streamr-client'
import { NewStreamsPoller } from '../src/crawler/NewStreamsPoller'
import { startTheGraphServer } from './utils'

const RESPONSES = [
    [{
        id: 'stream-id-2',
        createdAt: 222
    }, {
        id: 'stream-id-3',
        createdAt: 333
    }, {
        id: 'stream-id-1',
        createdAt: 111
    }],
    [],
    [{
        id: 'stream-id-4',
        createdAt: 444
    }]
]

describe('NewStreamsPoller', () => {

    let theGraphServer: Server

    beforeEach(async () => {
        theGraphServer = await startTheGraphServer(RESPONSES)
    })

    afterEach(() => {
        theGraphServer.close()
    })

    it('happy path', async () => {
        const client = {
            getStream: (id: StreamID) => ({ id })
        }
        const onNewStreamsAvailable = jest.fn()
        const poller = new NewStreamsPoller(
            onNewStreamsAvailable,
            `http://localhost:${(theGraphServer.address() as AddressInfo).port}/path`,
            client as any,
            500)
        poller.start()
        await waitForCondition(() => onNewStreamsAvailable.mock.calls.length === 1)
        expect(onNewStreamsAvailable.mock.calls[0][0]).toEqual([{ 'id': 'stream-id-2' }, { 'id': 'stream-id-3' }, { 'id': 'stream-id-1' }])
        await waitForCondition(() => onNewStreamsAvailable.mock.calls.length === 2)
        expect(onNewStreamsAvailable.mock.calls[1][0]).toEqual([{ 'id': 'stream-id-4' }])
        await poller.destroy()
    })

    it('destroy waits until callback promise resolves', async () => {
        let callbackCompleted = false
        const onNewStreamsAvailable = jest.fn().mockImplementation(async () => {
            await wait(100)
            callbackCompleted = true
        })
        const client = {
            getStream: (id: StreamID) => ({ id })
        }
        const poller = new NewStreamsPoller(
            onNewStreamsAvailable,
            `http://localhost:${(theGraphServer.address() as AddressInfo).port}/path`,
            client as any,
            500)
        poller.start()
        await waitForCondition(() => onNewStreamsAvailable.mock.calls.length === 1)
        expect(callbackCompleted).toBe(false)
        await poller.destroy()
        expect(callbackCompleted).toBe(true)
    })
})
