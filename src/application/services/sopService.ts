import type { IMessagingPort } from '../ports';
import type { IDomainEventBus } from '../events';
import type { ISopService } from '../serviceInterfaces';
import { SOP_ACCEPT_ACTION_ID, SOP_DECLINE_ACTION_ID } from '../serviceInterfaces';
import type { ExpertResponseDetector } from '../../domain';
import { ChannelId, UserId, SopCreationRequestedEvent } from '../../domain';

const OFFER_TEXT = 'That looked like a valuable answer! Want to save it as an SOP so it is not lost?';
const DEFAULT_MAX_TRACKED_CANDIDATES = 500;

interface SopCandidate {
  channelId: string;
  authorId: string;
  text: string;
  messageTs: string;
  offered: boolean;
}

export class SopService implements ISopService {
  readonly #detector: ExpertResponseDetector;
  readonly #messagingPort: IMessagingPort;
  readonly #eventBus: IDomainEventBus;
  readonly #monitoredChannelIds: Set<string>;
  readonly #maxTrackedCandidates: number;
  readonly #candidates = new Map<string, SopCandidate>();

  constructor(
    detector: ExpertResponseDetector,
    messagingPort: IMessagingPort,
    eventBus: IDomainEventBus,
    monitoredChannelIds: string[],
    maxTrackedCandidates: number = DEFAULT_MAX_TRACKED_CANDIDATES,
  ) {
    this.#detector = detector;
    this.#messagingPort = messagingPort;
    this.#eventBus = eventBus;
    this.#monitoredChannelIds = new Set(monitoredChannelIds);
    this.#maxTrackedCandidates = maxTrackedCandidates;
  }

  isMonitoredChannel(channelId: string): boolean {
    return this.#monitoredChannelIds.has(channelId);
  }

  async handleChannelMessage(channelId: string, authorId: string, text: string, messageTs: string): Promise<void> {
    if (!this.#monitoredChannelIds.has(channelId)) return;

    const key = SopService.#key(channelId, messageTs);
    this.#trackCandidate(key, { channelId, authorId, text, messageTs, offered: false });

    const candidate = this.#candidates.get(key);
    if (!candidate || candidate.offered) return;

    if (this.#detector.isHighValue({ text: candidate.text, reactionCount: 0 })) {
      await this.#offer(key);
    }
  }

  async handleReactionAdded(channelId: string, messageTs: string, reactionCount: number): Promise<void> {
    const key = SopService.#key(channelId, messageTs);
    const candidate = this.#candidates.get(key);
    if (!candidate || candidate.offered) return;

    if (this.#detector.isHighValue({ text: candidate.text, reactionCount })) {
      await this.#offer(key);
    }
  }

  async handleSopDecision(channelId: string, messageTs: string, accepted: boolean): Promise<void> {
    const key = SopService.#key(channelId, messageTs);
    const candidate = this.#candidates.get(key);
    if (!candidate) return;

    this.#candidates.delete(key);
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

  async #offer(key: string): Promise<void> {
    const candidate = this.#candidates.get(key);
    if (!candidate) return;

    try {
      await this.#messagingPort.sendEphemeralActionPrompt(candidate.channelId, candidate.authorId, OFFER_TEXT, [
        { actionId: SOP_ACCEPT_ACTION_ID, text: 'Yes, save it', value: candidate.messageTs },
        { actionId: SOP_DECLINE_ACTION_ID, text: 'No thanks', value: candidate.messageTs },
      ]);
    } catch (error) {
      console.error('Failed to send SOP save prompt; will retry on the next reaction:', error);
      return;
    }
    candidate.offered = true;
  }

  #trackCandidate(key: string, candidate: SopCandidate): void {
    if (this.#candidates.has(key)) return;

    if (this.#candidates.size >= this.#maxTrackedCandidates) {
      const evictableEntry = Array.from(this.#candidates.entries()).find(([, c]) => !c.offered);
      if (evictableEntry) {
        this.#candidates.delete(evictableEntry[0]);
      } else {
        console.warn(
          'SopService: candidate cache is full of entries awaiting a decision; growing past the cap to avoid dropping a pending SOP decision.',
        );
      }
    }
    this.#candidates.set(key, candidate);
  }

  static #key(channelId: string, messageTs: string): string {
    return `${channelId}:${messageTs}`;
  }
}
