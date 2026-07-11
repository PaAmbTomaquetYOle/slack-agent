import type { DomainEvent } from './domainEvent';
import type { ChannelId, UserId } from '../valueObjects/index';

/**
 * Raised when a candidate message is offered to its author as a possible SOP, so the backend
 * can persist it (SA-16) — otherwise, a slack-agent restart before the author responds loses
 * the candidate and their eventual Yes/No click resolves to nothing.
 */
export class SopCandidateOfferedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'sop.candidate_offered' as const;
  readonly eventName = SopCandidateOfferedEvent.EVENT_NAME;
  readonly occurredOn: Date;
  readonly channelId: ChannelId;
  readonly authorId: UserId;
  readonly messageText: string;
  readonly messageTs: string;

  constructor(
    channelId: ChannelId,
    authorId: UserId,
    messageText: string,
    messageTs: string,
    occurredOn: Date = new Date(),
  ) {
    this.occurredOn = occurredOn;
    this.channelId = channelId;
    this.authorId = authorId;
    this.messageText = messageText;
    this.messageTs = messageTs;
  }
}
