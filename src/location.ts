import geoip from 'geoip-lite'
import { Location } from './entities/Node'

export const getLocationFromIpAddress = (ipAddress: string): Location | undefined => {
    const data = geoip.lookup(ipAddress)
    if (data !== null) {
        return {
            latitude: data.ll[0],
            longitude: data.ll[1],
            city: (data.city) !== '' ? (data.city) : null,
            country: data.country
        }
    } else {
        return undefined
    }
}
