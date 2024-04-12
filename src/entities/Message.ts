import { Field, ObjectType } from 'type-graphql'

export enum ContentType {
    JSON = 'JSON',
    BINARY = 'BINARY'
}

/* eslint-disable indent */
@ObjectType()
export class Message {
    @Field(() => String, { description: 'JSON string if contentType is JSON, otherwise base64-encoded binary content' })
    content!: string
    @Field()
    contentType!: ContentType
}
