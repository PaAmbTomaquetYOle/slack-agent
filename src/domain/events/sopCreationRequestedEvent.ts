import type { DomainEvent } from './domainEvent';
import type { ChannelId, UserId } from '../valueObjects/index';

export class SopCreationRequestedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'sop.creation_requested' as const;
  readonly eventName = SopCreationRequestedEvent.EVENT_NAME;
  readonly occurredOn: Date;
  readonly channelId: ChannelId;
  readonly authorId: UserId;
  readonly messageText: string;
  readonly messageTs: string;
  readonly title: string;

  constructor(
    channelId: ChannelId,
    authorId: UserId,
    messageText: string,
    messageTs: string,
    title: string,
    occurredOn: Date = new Date(),
  ) {
    this.occurredOn = occurredOn;
    this.channelId = channelId;
    this.authorId = authorId;
    this.messageText = messageText;
    this.messageTs = messageTs;
    this.title = title;
  }
}
