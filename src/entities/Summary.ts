import { Field, Float, Int, ObjectType } from 'type-graphql'

/* eslint-disable indent */
@ObjectType()
export class Summary {
    @Field(() => Int)
    streamCount!: number
    @Field(() => Float)
    messagesPerSecond!: number
    @Field(() => Int)
    nodeCount!: number
}
