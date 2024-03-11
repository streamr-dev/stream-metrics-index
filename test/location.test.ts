import { getLocationFromIpAddress } from '../src/location'

describe('getLocationFromIpAddress', () => {

    it('data available', () => {
        expect(getLocationFromIpAddress('123.1.2.3')).toEqual({
            city: 'Nagoya',
            country: 'JP',
            latitude: 35.1926,
            longitude: 136.906
        })
    })

    it('data unavailable', () => {
        expect(getLocationFromIpAddress('127.0.0.1')).toBeUndefined()
    })

    it('no city', () => {
        expect(getLocationFromIpAddress('1.2.3.4')).toEqual({
            city: null,
            country: 'AU',
            latitude: -33.494,
            longitude: 143.2104,
        })
    })
})
