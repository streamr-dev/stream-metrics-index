import { binaryToUtf8, toStreamID } from '@streamr/utils'
import { Arg, Query, Resolver } from 'type-graphql'
import { Inject, Service } from 'typedi'
import { ContentType, Message } from '../entities/Message'
import { MessageRepository } from '../repository/MessageRepository'

@Resolver()
@Service()
export class MessageResolver {

    private repository: MessageRepository

    constructor(
        @Inject() repository: MessageRepository
    ) {
        this.repository = repository
    }

    @Query(() => Message, { nullable: true })
    async sampleMessage(
        @Arg("stream", { nullable: false }) streamId: string
    ): Promise<Message | null> {
        const message = await this.repository.getSampleMessage(toStreamID(streamId))
        if (message !== null) {
            return {
                content: (message.contentType === ContentType.JSON)
                    ? binaryToUtf8(message.content)
                    : Buffer.from(message.content).toString('base64'),
                contentType: message.contentType
            }
        } else {
            return null
        }
    }
}
