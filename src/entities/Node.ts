import { Field, ObjectType } from 'type-graphql'

/* eslint-disable indent */
@ObjectType()
export class Node {
    @Field()
    id!: string
    @Field(() => String, { nullable: true })
    ipAddress!: string | null
}

/* eslint-disable indent */
@ObjectType()
export class Nodes {
    @Field(() => [Node])
    items!: Node[]
    @Field(() => String, { nullable: true })
    cursor!: string | null
}
