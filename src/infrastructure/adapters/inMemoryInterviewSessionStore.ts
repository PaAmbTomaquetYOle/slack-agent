import { InterviewId } from '../../domain/index.js';
import type { ProcessId, InterviewTurn } from '../../domain/index.js';
import type { IInterviewSessionStore, InterviewSession } from '../../application/ports/index.js';

class MutableInterviewSession implements InterviewSession {
  readonly id: InterviewId;
  readonly processId: ProcessId;
  readonly startedAt: Date;
  turns: readonly InterviewTurn[];

  constructor(processId: ProcessId, id: InterviewId = InterviewId.generate(), turns: readonly InterviewTurn[] = []) {
    this.id = id;
    this.processId = processId;
    this.startedAt = new Date();
    this.turns = turns;
  }
}

/**
 * Holds each in-flight guided-interview conversation in memory (BE-7: the backend's REST
 * surface is read-only, so slack-agent owns turn-by-turn state and only hands the backend a
 * `interview.started` marker and the full turn list on `interview.completed`).
 */
export class InMemoryInterviewSessionStore implements IInterviewSessionStore {
  readonly #sessions = new Map<string, MutableInterviewSession>();

  find(processId: ProcessId): InterviewSession | null {
    return this.#sessions.get(processId.value) ?? null;
  }

  start(processId: ProcessId): InterviewSession {
    if (this.#sessions.has(processId.value)) {
      throw new Error(`Interview session already in flight for process '${processId.value}'`);
    }
    const session = new MutableInterviewSession(processId);
    this.#sessions.set(processId.value, session);
    return session;
  }

  appendTurns(processId: ProcessId, turns: readonly InterviewTurn[]): InterviewSession {
    const session = this.#sessions.get(processId.value);
    if (!session) {
      throw new Error(`No interview session in flight for process '${processId.value}'`);
    }
    session.turns = [...session.turns, ...turns];
    return session;
  }

  end(processId: ProcessId): void {
    this.#sessions.delete(processId.value);
  }

  restore(processId: ProcessId, interviewId: InterviewId, turns: readonly InterviewTurn[]): InterviewSession {
    if (this.#sessions.has(processId.value)) {
      throw new Error(`Interview session already in flight for process '${processId.value}'`);
    }
    const session = new MutableInterviewSession(processId, interviewId, turns);
    this.#sessions.set(processId.value, session);
    return session;
  }
}
