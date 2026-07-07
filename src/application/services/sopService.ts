import type { IMessagingPort } from '../ports';
import type { IDomainEventBus } from '../events';
import type { ISopService } from '../serviceInterfaces';
import type { ExpertResponseDetector } from '../../domain';
import { ChannelId, UserId, SopCreationRequestedEvent } from '../../domain';

export const SOP_ACCEPT_ACTION_ID = 'sop_accept';
export const SOP_DECLINE_ACTION_ID = 'sop_decline';
const OFFER_TEXT = 'That looked like a valuable answer! Want to save it as an SOP so it is not lost?';
const MAX_TRACKED_CANDIDATES = 500;

interface SopCandidate {
  channelId: string;
  authorId: string;
  text: string;
  offered: boolean;
}

export class SopService implements ISopService {
  readonly #detector: ExpertResponseDetector;
  readonly #messagingPort: IMessagingPort;
  readonly #eventBus: IDomainEventBus;
  readonly #monitoredChannelIds: Set<string>;
  readonly #candidates = new Map<string, SopCandidate>();

  constructor(
    detector: ExpertResponseDetector,
    messagingPort: IMessagingPort,
    eventBus: IDomainEventBus,
    monitoredChannelIds: string[],
  ) {
    this.#detector = detector;
    this.#messagingPort = messagingPort;
    this.#eventBus = eventBus;
    this.#monitoredChannelIds = new Set(monitoredChannelIds);
  }

  async handleChannelMessage(channelId: string, authorId: string, text: string, messageTs: string): Promise<void> {
    if (!this.#monitoredChannelIds.has(channelId)) return;

    this.#trackCandidate(messageTs, { channelId, authorId, text, offered: false });

    const candidate = this.#candidates.get(messageTs);
    if (candidate?.offered) return;

    if (this.#detector.isHighValue({ text, reactionCount: 0 })) {
      await this.#offer(messageTs);
    }
  }

  async handleReactionAdded(channelId: string, messageTs: string, reactionCount: number): Promise<void> {
    const candidate = this.#candidates.get(messageTs);
    if (!candidate || candidate.offered) return;

    if (this.#detector.isHighValue({ text: candidate.text, reactionCount })) {
      await this.#offer(messageTs);
    }
  }

  async handleSopDecision(channelId: string, messageTs: string, accepted: boolean): Promise<void> {
    const candidate = this.#candidates.get(messageTs);
    if (!candidate) return;

    this.#candidates.delete(messageTs);
    if (!accepted) return;

    await this.#eventBus.publish(
      new SopCreationRequestedEvent(
        new ChannelId(candidate.channelId),
        new UserId(candidate.authorId),
        candidate.text,
        messageTs,
      ),
    );
  }

  async #offer(messageTs: string): Promise<void> {
    const candidate = this.#candidates.get(messageTs);
    if (!candidate) return;

    candidate.offered = true;
    await this.#messagingPort.sendEphemeralActionPrompt(candidate.channelId, candidate.authorId, OFFER_TEXT, [
      { actionId: SOP_ACCEPT_ACTION_ID, text: 'Yes, save it', value: messageTs },
      { actionId: SOP_DECLINE_ACTION_ID, text: 'No thanks', value: messageTs },
    ]);
  }

  #trackCandidate(messageTs: string, candidate: SopCandidate): void {
    if (this.#candidates.has(messageTs)) return;

    if (this.#candidates.size >= MAX_TRACKED_CANDIDATES) {
      const oldestKey = this.#candidates.keys().next().value;
      if (oldestKey !== undefined) this.#candidates.delete(oldestKey);
    }
    this.#candidates.set(messageTs, candidate);
  }
}
