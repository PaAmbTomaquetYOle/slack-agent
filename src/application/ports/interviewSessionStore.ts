import type { InterviewId, ProcessId, InterviewTurn } from '../../domain';

/**
 * A single guided-interview conversation, held entirely in memory for the lifetime of the
 * offboarding process (BE-7: the backend no longer exposes interview write endpoints, so
 * slack-agent is the source of truth for in-flight turns; only `interview.started` and
 * `interview.completed` — the latter carrying every turn — cross over to Kafka).
 */
export interface InterviewSession {
  readonly id: InterviewId;
  readonly processId: ProcessId;
  readonly startedAt: Date;
  readonly turns: readonly InterviewTurn[];
}

export interface IInterviewSessionStore {
  /** Returns the in-flight session for a process, or null if none has been started yet. */
  find(processId: ProcessId): InterviewSession | null;
  /** Starts a new session for a process. Throws if one is already in flight. */
  start(processId: ProcessId): InterviewSession;
  /** Appends turns to an in-flight session and returns the updated session. */
  appendTurns(processId: ProcessId, turns: readonly InterviewTurn[]): InterviewSession;
  /** Ends (discards) the in-flight session once the interview is complete. */
  end(processId: ProcessId): void;
  /**
   * Seeds an in-flight session from turns already persisted on the backend (SA-16), so a
   * process restart resumes an interview instead of losing it. Throws if one is already in
   * flight for the process.
   */
  restore(processId: ProcessId, interviewId: InterviewId, turns: readonly InterviewTurn[]): InterviewSession;
}
