import type { IMessagingPort, ISopCandidateReadRepository } from '../ports';
import type { IDomainEventBus } from '../events';
import type { ISopService } from '../serviceInterfaces';
import { SOP_ACCEPT_ACTION_ID, SOP_DECLINE_ACTION_ID } from '../serviceInterfaces';
import type { ExpertResponseDetector } from '../../domain';
import {
  ChannelId,
  UserId,
  SopCreationRequestedEvent,
  SopCandidateOfferedEvent,
  SopCandidateDecidedEvent,
} from '../../domain';

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
  readonly #candidateReadRepository: ISopCandidateReadRepository | null;
  readonly #candidates = new Map<string, SopCandidate>();

  constructor(
    detector: ExpertResponseDetector,
    messagingPort: IMessagingPort,
    eventBus: IDomainEventBus,
    monitoredChannelIds: string[],
    maxTrackedCandidates: number = DEFAULT_MAX_TRACKED_CANDIDATES,
    candidateReadRepository: ISopCandidateReadRepository | null = null,
  ) {
    this.#detector = detector;
    this.#messagingPort = messagingPort;
    this.#eventBus = eventBus;
    this.#monitoredChannelIds = new Set(monitoredChannelIds);
    this.#maxTrackedCandidates = maxTrackedCandidates;
    this.#candidateReadRepository = candidateReadRepository;
  }

  /**
   * Rehydrates candidates still awaiting a decision from the backend (SA-16), so an author's
   * Yes/No click still resolves after a restart wiped the in-memory cache. Call once on
   * startup. Failures are logged, not thrown — falling back to the pre-SA-16 behavior of an
   * empty cache rather than blocking startup.
   */
  async rehydrate(): Promise<void> {
    if (!this.#candidateReadRepository) return;
    try {
      const pending = await this.#candidateReadRepository.findPending();
      for (const candidate of pending) {
        const key = SopService.#key(candidate.channelId, candidate.messageTs);
        this.#candidates.set(key, {
          channelId: candidate.channelId,
          authorId: candidate.authorId,
          text: candidate.content,
          messageTs: candidate.messageTs,
          offered: true,
        });
      }
    } catch (error) {
      console.error('Failed to rehydrate pending SOP candidates from the backend:', error);
    }
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
    await this.#eventBus.publish(new SopCandidateDecidedEvent(new ChannelId(channelId), messageTs, accepted));
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
    await this.#eventBus.publish(
      new SopCandidateOfferedEvent(
        new ChannelId(candidate.channelId),
        new UserId(candidate.authorId),
        candidate.text,
        candidate.messageTs,
      ),
    );
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
