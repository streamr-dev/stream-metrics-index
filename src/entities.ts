/* eslint-disable indent */
import { Field, Float, Int, ObjectType, registerEnumType } from 'type-graphql'

@ObjectType()
export class Stream {
    @Field()
    id!: string
    @Field(() => Int)
    peerCount!: number
    @Field(() => Float)
    messagesPerSecond!: number
    @Field(() => Int, { nullable: true })
    publisherCount!: number | null
    @Field(() => Int, { nullable: true })
    subscriberCount!: number | null
}

export enum OrderBy {
    ID = 'ID',
    PEER_COUNT = 'PEER_COUNT',
    MESSAGES_PER_SECOND = 'MESSAGES_PER_SECOND',
    SUBSCRIBER_COUNT = 'SUBSCRIBER_COUNT',
    PUBLISHER_COUNT = 'PUBLISHER_COUNT'
}

registerEnumType(OrderBy, {
    name: 'OrderBy'
})

@ObjectType()
export class Streams {
    @Field(() => [Stream])
    items!: Stream[]
    @Field(() => String, { nullable: true })
    cursor!: string | null
}

@ObjectType()
export class Summary {
    @Field(() => Float)
    streamCount!: number
    @Field(() => Float)
    messagesPerSecond!: number
}
