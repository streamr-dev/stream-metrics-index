import { Field, Float, ObjectType } from 'type-graphql'

/* eslint-disable indent */
@ObjectType()
export class Node {
    @Field()
    id!: string
    @Field(() => String, { nullable: true })
    ipAddress!: string | null
    @Field(() => Location, { nullable: true })
    location!: Location | null
}

/* eslint-disable indent */
@ObjectType()
export class Location {
    @Field(() => Float)
    latitude!: number
    @Field(() => Float)
    longitude!: number
    @Field()
    city!: string
    @Field()
    country!: string
}

/* eslint-disable indent */
@ObjectType()
export class Nodes {
    @Field(() => [Node])
    items!: Node[]
    @Field(() => String, { nullable: true })
    cursor!: string | null
}
