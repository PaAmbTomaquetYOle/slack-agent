import type { DomainEvent } from './domainEvent';
import type { ChannelId } from '../valueObjects/index';

/**
 * Raised when a SOP candidate's author clicks Yes/No on the save prompt, so the backend can
 * record the decision (SA-16) even though the actual SOP is only created, on acceptance, via
 * the existing `sop.creation_requested` flow.
 */
export class SopCandidateDecidedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'sop.candidate_decided' as const;
  readonly eventName = SopCandidateDecidedEvent.EVENT_NAME;
  readonly occurredOn: Date;
  readonly channelId: ChannelId;
  readonly messageTs: string;
  readonly accepted: boolean;

  constructor(
    channelId: ChannelId,
    messageTs: string,
    accepted: boolean,
    occurredOn: Date = new Date(),
  ) {
    this.occurredOn = occurredOn;
    this.channelId = channelId;
    this.messageTs = messageTs;
    this.accepted = accepted;
  }
}
