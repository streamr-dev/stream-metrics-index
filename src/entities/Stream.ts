import { Field, Float, Int, ObjectType, registerEnumType } from 'type-graphql'

/* eslint-disable indent */
@ObjectType()
export class Stream {
    @Field()
    id!: string
    @Field(() => String, { nullable: true })
    description!: string | null
    @Field(() => Int)
    peerCount!: number
    @Field(() => Float)
    messagesPerSecond!: number
    @Field(() => Float)
    bytesPerSecond!: number
    @Field(() => Int, { nullable: true })
    publisherCount!: number | null
    @Field(() => Int, { nullable: true })
    subscriberCount!: number | null
}

export enum StreamOrderBy {
    ID = 'ID',
    DESCRIPTION = 'DESCRIPTION',
    PEER_COUNT = 'PEER_COUNT',
    MESSAGES_PER_SECOND = 'MESSAGES_PER_SECOND',
    BYTES_PER_SECOND = 'BYTES_PER_SECOND',
    SUBSCRIBER_COUNT = 'SUBSCRIBER_COUNT',
    PUBLISHER_COUNT = 'PUBLISHER_COUNT'
}

registerEnumType(StreamOrderBy, {
    name: 'StreamOrderBy'
})

/* eslint-disable indent */
@ObjectType()
export class Streams {
    @Field(() => [Stream])
    items!: Stream[]
    @Field(() => String, { nullable: true })
    cursor!: string | null
}
