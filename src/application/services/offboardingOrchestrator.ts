import type { IOffboardingProcessRepository, IInterviewRepository, IMessagingPort, IScheduler, ILogger } from '../ports';
import type { IDomainEventBus } from '../events';
import type { IInterviewService, IOffboardingOrchestrator } from '../serviceInterfaces';
import {
  OffboardingProcess,
  OffboardingStartedEvent,
  InterviewStartedEvent,
  InterviewCompletedEvent,
} from '../../domain';
import type { Interview, DomainEvent } from '../../domain';

const PRE_INTERVIEW_PREFIX = 'pre-interview';
const INTERVIEW_STALL_PREFIX = 'interview-stall';
const NUDGE_SUFFIX = 'nudge';
const ABANDON_SUFFIX = 'abandon';

interface PendingTrigger {
  readonly initiatorId: string;
}

/**
 * The agent's "brain" (SA-10): coordinates trigger -> interview -> dossier by subscribing to the
 * existing domain-event choreography (kept as-is, never duplicated), tracks each in-flight
 * process' state locally, and re-nudges/abandons interviews the departing user goes silent on.
 * It does not perform the coordinated work itself — it orchestrates the existing services
 * (`IInterviewService`, the Kafka forwarders already wired in `appFactory`) and never writes
 * process state to the backend over HTTP; the backend remains the source of truth.
 */
export class OffboardingOrchestrator implements IOffboardingOrchestrator {
  readonly #repository: IOffboardingProcessRepository;
  readonly #interviewRepository: IInterviewRepository;
  readonly #interviewService: IInterviewService;
  readonly #messagingPort: IMessagingPort;
  readonly #scheduler: IScheduler;
  readonly #logger: ILogger;
  readonly #nudgeTimeoutMs: number;
  readonly #abandonTimeoutMs: number;

  readonly #pendingTriggers = new Map<string, PendingTrigger>(); // departingUserId -> trigger, before the interview starts
  readonly #processes = new Map<string, OffboardingProcess>(); // processId.value -> tracked process
  readonly #activeProcessByUser = new Map<string, string>(); // departingUserId -> processId.value

  constructor(
    eventBus: IDomainEventBus,
    repository: IOffboardingProcessRepository,
    interviewRepository: IInterviewRepository,
    interviewService: IInterviewService,
    messagingPort: IMessagingPort,
    scheduler: IScheduler,
    logger: ILogger,
    nudgeTimeoutMs: number,
    abandonTimeoutMs: number,
  ) {
    this.#repository = repository;
    this.#interviewRepository = interviewRepository;
    this.#interviewService = interviewService;
    this.#messagingPort = messagingPort;
    this.#scheduler = scheduler;
    this.#logger = logger;
    this.#nudgeTimeoutMs = nudgeTimeoutMs;
    this.#abandonTimeoutMs = abandonTimeoutMs;

    eventBus.subscribe(OffboardingStartedEvent.EVENT_NAME, (event: DomainEvent) =>
      this.#onOffboardingStarted(event as OffboardingStartedEvent));
    eventBus.subscribe(InterviewStartedEvent.EVENT_NAME, (event: DomainEvent) =>
      this.#onInterviewStarted(event as InterviewStartedEvent));
    eventBus.subscribe(InterviewCompletedEvent.EVENT_NAME, (event: DomainEvent) =>
      this.#onInterviewCompleted(event as InterviewCompletedEvent));
  }

  async handleInterviewMessage(userId: string, text: string): Promise<void> {
    this.#rearmActiveStall(userId);
    await this.#interviewService.handleIncomingDirectMessage(userId, text);
  }

  onDossierGenerated(processId: string): void {
    this.#advanceState(processId, (process) => process.complete());
    this.#logger.info('Dossier generated; process marked finished', { processId });
  }

  onOffboardingCompleted(processId: string): void {
    this.#logger.info('Offboarding completed', { processId });
    this.#scheduler.cancel(this.#stallNudgeKey(processId));
    this.#scheduler.cancel(this.#stallAbandonKey(processId));
    const process = this.#processes.get(processId);
    if (process) {
      this.#activeProcessByUser.delete(process.departingUserId.value);
      this.#processes.delete(processId);
    }
  }

  async recover(): Promise<void> {
    const { items } = await this.#repository.findAll({ state: 'in_progress' });
    for (const process of items) {
      this.#processes.set(process.id.value, process);
      await this.#rehydrate(process);
    }
    this.#logger.info('Orchestrator recovery complete', { rehydrated: items.length });
  }

  async #onOffboardingStarted(event: OffboardingStartedEvent): Promise<void> {
    const departingUserId = event.departingUserId.value;
    const initiatorId = event.initiatorId.value;
    this.#pendingTriggers.set(departingUserId, { initiatorId });
    this.#logger.info('Offboarding triggered', { departingUserId, initiatorId });
    this.#armNudgeThenAbandon(
      this.#preInterviewNudgeKey(departingUserId),
      this.#preInterviewAbandonKey(departingUserId),
      this.#nudgeTimeoutMs,
      () => this.#sendPreInterviewNudge(departingUserId),
      () => this.#abandonPreInterview(departingUserId),
    );
  }

  async #onInterviewStarted(event: InterviewStartedEvent): Promise<void> {
    const departingUserId = event.employeeId.value;
    const processId = event.processId.value;
    const pending = this.#pendingTriggers.get(departingUserId);
    this.#pendingTriggers.delete(departingUserId);
    this.#scheduler.cancel(this.#preInterviewNudgeKey(departingUserId));
    this.#scheduler.cancel(this.#preInterviewAbandonKey(departingUserId));

    const process = await this.#repository.findById(event.processId);
    if (process) this.#processes.set(processId, process);
    this.#activeProcessByUser.set(departingUserId, processId);
    this.#logger.info('Interview started', { processId, departingUserId });

    const initiatorId = process?.initiatorId.value ?? pending?.initiatorId;
    if (!initiatorId) {
      this.#logger.warn('No initiator known; stall notifications disabled for this process', { processId });
      return;
    }
    this.#armNudgeThenAbandon(
      this.#stallNudgeKey(processId),
      this.#stallAbandonKey(processId),
      this.#nudgeTimeoutMs,
      () => this.#sendStallNudge(departingUserId),
      () => this.#abandonStall(processId, departingUserId, initiatorId),
    );
  }

  async #onInterviewCompleted(event: InterviewCompletedEvent): Promise<void> {
    const processId = event.processId.value;
    this.#scheduler.cancel(this.#stallNudgeKey(processId));
    this.#scheduler.cancel(this.#stallAbandonKey(processId));
    this.#advanceState(processId, (process) => process.submitForReview());
    this.#logger.info('Interview completed', { processId });
  }

  #rearmActiveStall(departingUserId: string): void {
    const processId = this.#activeProcessByUser.get(departingUserId);
    if (!processId) return;
    this.#scheduler.cancel(this.#stallNudgeKey(processId));
    this.#scheduler.cancel(this.#stallAbandonKey(processId));

    const initiatorId = this.#processes.get(processId)?.initiatorId.value;
    if (!initiatorId) return;
    this.#armNudgeThenAbandon(
      this.#stallNudgeKey(processId),
      this.#stallAbandonKey(processId),
      this.#nudgeTimeoutMs,
      () => this.#sendStallNudge(departingUserId),
      () => this.#abandonStall(processId, departingUserId, initiatorId),
    );
  }

  async #rehydrate(process: OffboardingProcess): Promise<void> {
    const departingUserId = process.departingUserId.value;
    const initiatorId = process.initiatorId.value;
    const interview = await this.#interviewRepository.findByProcessId(process.id);

    if (!interview) {
      this.#pendingTriggers.set(departingUserId, { initiatorId });
      await this.#rearmFromElapsed(
        Date.now() - process.createdAt.getTime(),
        this.#preInterviewNudgeKey(departingUserId),
        this.#preInterviewAbandonKey(departingUserId),
        () => this.#sendPreInterviewNudge(departingUserId),
        () => this.#abandonPreInterview(departingUserId),
      );
      return;
    }

    const processId = process.id.value;
    this.#activeProcessByUser.set(departingUserId, processId);
    const lastActivity = OffboardingOrchestrator.#lastTurnTimestamp(interview) ?? process.createdAt;
    await this.#rearmFromElapsed(
      Date.now() - lastActivity.getTime(),
      this.#stallNudgeKey(processId),
      this.#stallAbandonKey(processId),
      () => this.#sendStallNudge(departingUserId),
      () => this.#abandonStall(processId, departingUserId, initiatorId),
    );
  }

  #armNudgeThenAbandon(
    nudgeKey: string,
    abandonKey: string,
    nudgeDelayMs: number,
    onNudge: () => Promise<void>,
    onAbandon: () => Promise<void>,
  ): void {
    this.#scheduler.schedule(nudgeKey, new Date(Date.now() + nudgeDelayMs), async () => {
      await onNudge();
      this.#scheduler.schedule(abandonKey, new Date(Date.now() + this.#abandonTimeoutMs), onAbandon);
    });
  }

  async #rearmFromElapsed(
    elapsedMs: number,
    nudgeKey: string,
    abandonKey: string,
    onNudge: () => Promise<void>,
    onAbandon: () => Promise<void>,
  ): Promise<void> {
    if (elapsedMs >= this.#abandonTimeoutMs) {
      await onAbandon();
      return;
    }
    if (elapsedMs >= this.#nudgeTimeoutMs) {
      await onNudge();
      this.#scheduler.schedule(abandonKey, new Date(Date.now() + (this.#abandonTimeoutMs - elapsedMs)), onAbandon);
      return;
    }
    this.#scheduler.schedule(nudgeKey, new Date(Date.now() + (this.#nudgeTimeoutMs - elapsedMs)), async () => {
      await onNudge();
      this.#scheduler.schedule(abandonKey, new Date(Date.now() + this.#abandonTimeoutMs), onAbandon);
    });
  }

  #advanceState(processId: string, transition: (process: OffboardingProcess) => void): void {
    const process = this.#processes.get(processId);
    if (!process) {
      this.#logger.warn('No tracked process for state transition', { processId });
      return;
    }
    try {
      transition(process);
    } catch (error) {
      this.#logger.warn('Ignoring invalid state transition', {
        processId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async #sendPreInterviewNudge(departingUserId: string): Promise<void> {
    await this.#messagingPort.sendDirectMessage(
      departingUserId,
      ':wave: Just checking in — whenever you have a moment, reply here to start your offboarding handover interview.',
    );
  }

  async #abandonPreInterview(departingUserId: string): Promise<void> {
    const pending = this.#pendingTriggers.get(departingUserId);
    this.#pendingTriggers.delete(departingUserId);
    this.#logger.warn('Departing user never started the interview; notifying initiator', { departingUserId });
    if (!pending) return;
    await this.#messagingPort.sendDirectMessage(
      pending.initiatorId,
      `:warning: <@${departingUserId}> hasn't started their offboarding interview yet. You may want to follow up directly.`,
    );
  }

  async #sendStallNudge(departingUserId: string): Promise<void> {
    await this.#messagingPort.sendDirectMessage(
      departingUserId,
      ':wave: Still there? Whenever you are ready, reply here to continue your offboarding handover interview.',
    );
  }

  async #abandonStall(processId: string, departingUserId: string, initiatorId: string): Promise<void> {
    this.#logger.warn('Interview stalled; abandoning', { processId, departingUserId });
    this.#advanceState(processId, (process) => process.cancel());
    this.#activeProcessByUser.delete(departingUserId);
    await this.#messagingPort.sendDirectMessage(
      initiatorId,
      `:warning: The offboarding interview for <@${departingUserId}> stalled with no response and was abandoned. You may want to follow up directly.`,
    );
  }

  #preInterviewNudgeKey(departingUserId: string): string {
    return `${PRE_INTERVIEW_PREFIX}:${departingUserId}:${NUDGE_SUFFIX}`;
  }

  #preInterviewAbandonKey(departingUserId: string): string {
    return `${PRE_INTERVIEW_PREFIX}:${departingUserId}:${ABANDON_SUFFIX}`;
  }

  #stallNudgeKey(processId: string): string {
    return `${INTERVIEW_STALL_PREFIX}:${processId}:${NUDGE_SUFFIX}`;
  }

  #stallAbandonKey(processId: string): string {
    return `${INTERVIEW_STALL_PREFIX}:${processId}:${ABANDON_SUFFIX}`;
  }

  static #lastTurnTimestamp(interview: Interview): Date | null {
    return interview.turns.reduce<Date | null>((latest, turn) => {
      if (!latest || turn.timestamp > latest) return turn.timestamp;
      return latest;
    }, null);
  }
}
