import { Field, Float, InputType, ObjectType } from 'type-graphql'

/* eslint-disable indent */
@ObjectType()
export class Node {
    @Field()
    id!: string
    @Field(() => String, { nullable: true })
    ipAddress!: string | null
    @Field(() => Location, { nullable: true })
    location!: Location | null
    @Field(() => [StreamPartNeigbors])
    neighbors!: StreamPartNeigbors[]
}

/* eslint-disable indent */
@ObjectType()
export class StreamPartNeigbors {
    @Field(() => String, { nullable: false })
    streamPartId!: string | null
    // TODO could return Node entities?
    @Field(() => [String])
    nodeIds!: string[]
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

/* eslint-disable indent */
@InputType()
export class NeighborInput {
    @Field(() => String, { nullable: false })
    node!: string | null
    @Field(() => String, { nullable: false })
    streamPart!: string | null
}

/* eslint-disable indent */
@ObjectType()
export class Neighbor {
    @Field()
    nodeId1!: string
    @Field()
    nodeId2!: string
}

/* eslint-disable indent */
@ObjectType()
export class Neighbors {
    @Field(() => [Neighbor])
    items!: Neighbor[]
    @Field(() => String, { nullable: true })
    cursor!: string | null
}
