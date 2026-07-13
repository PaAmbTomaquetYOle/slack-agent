import { describe, it, expect } from 'vitest';
import { InMemoryInterviewSessionStore } from '../inMemoryInterviewSessionStore.js';
import { ProcessId, InterviewId } from '../../../domain/index.js';
import type { InterviewTurn } from '../../../domain/index.js';

function makeTurn(overrides: Partial<InterviewTurn> = {}): InterviewTurn {
  return {
    turnType: 'note',
    speakerRole: 'interviewee',
    timestamp: new Date('2026-07-06T09:05:00.000Z'),
    content: 'hello',
    order: 0,
    topic: null,
    sentiment: null,
    answerText: null,
    ...overrides,
  };
}

describe('InMemoryInterviewSessionStore', () => {
  it('has no session for a process until start() is called', () => {
    const store = new InMemoryInterviewSessionStore();
    expect(store.find(new ProcessId('proc-1'))).toBeNull();
  });

  it('start() creates an empty session with a generated interview id', () => {
    const store = new InMemoryInterviewSessionStore();
    const processId = new ProcessId('proc-1');

    const session = store.start(processId);

    expect(session.processId).toBe(processId);
    expect(session.turns).toEqual([]);
    expect(session.id.value).toBeTruthy();
    expect(store.find(processId)).toEqual(session);
  });

  it('start() throws when a session is already in flight for the process', () => {
    const store = new InMemoryInterviewSessionStore();
    const processId = new ProcessId('proc-1');
    store.start(processId);

    expect(() => store.start(processId)).toThrow();
  });

  it('appendTurns() accumulates turns for the session', () => {
    const store = new InMemoryInterviewSessionStore();
    const processId = new ProcessId('proc-1');
    store.start(processId);

    store.appendTurns(processId, [makeTurn({ order: 0 })]);
    const session = store.appendTurns(processId, [makeTurn({ order: 1, content: 'second' })]);

    expect(session.turns).toHaveLength(2);
    expect(session.turns[1]?.content).toBe('second');
  });

  it('appendTurns() throws when no session is in flight', () => {
    const store = new InMemoryInterviewSessionStore();
    expect(() => store.appendTurns(new ProcessId('proc-1'), [makeTurn()])).toThrow();
  });

  it('end() discards the session', () => {
    const store = new InMemoryInterviewSessionStore();
    const processId = new ProcessId('proc-1');
    store.start(processId);

    store.end(processId);

    expect(store.find(processId)).toBeNull();
  });

  it('restore() seeds a session from backend-persisted turns, keeping the given interview id', () => {
    const store = new InMemoryInterviewSessionStore();
    const processId = new ProcessId('proc-1');
    const interviewId = new InterviewId('int-persisted');
    const turns = [makeTurn({ order: 0 }), makeTurn({ order: 1, content: 'second' })];

    const session = store.restore(processId, interviewId, turns);

    expect(session.id).toBe(interviewId);
    expect(session.turns).toEqual(turns);
    expect(store.find(processId)).toEqual(session);
  });

  it('restore() throws when a session is already in flight for the process', () => {
    const store = new InMemoryInterviewSessionStore();
    const processId = new ProcessId('proc-1');
    store.start(processId);

    expect(() => store.restore(processId, new InterviewId('int-1'), [])).toThrow();
  });
});
