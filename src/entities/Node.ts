import { Field, Float, Int, ObjectType } from 'type-graphql'

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
    @Field(() => String, { nullable: true })
    city!: string | null
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

/* eslint-disable indent */
@ObjectType()
export class Neighbor {
    @Field()
    streamPartId!: string
    @Field()
    nodeId1!: string
    @Field()
    nodeId2!: string
    @Field(() => Int, { nullable: true })
    rtt!: number | null
}

/* eslint-disable indent */
@ObjectType()
export class Neighbors {
    @Field(() => [Neighbor])
    items!: Neighbor[]
    @Field(() => String, { nullable: true })
    cursor!: string | null
}
