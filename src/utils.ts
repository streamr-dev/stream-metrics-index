export const collect = async <T>(source: AsyncIterable<T>, maxCount?: number): Promise<T[]> => {
    const items: T[] = []
    for await (const item of source) {
        items.push(item)
        if ((maxCount !== undefined) && (items.length >= maxCount)) {
            break
        }
    }
    return items
}

export const count = async (source: AsyncIterable<any>): Promise<number> => {
    const items = await collect(source)
    return items.length
}
