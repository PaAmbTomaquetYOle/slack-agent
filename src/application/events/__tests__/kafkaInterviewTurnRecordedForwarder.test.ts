import { describe, it, expect, vi } from 'vitest';
import { createKafkaInterviewTurnRecordedForwarder } from '../kafkaInterviewTurnRecordedForwarder.js';
import type { IEventPublisher } from '../../ports/index.js';
import {
  InterviewTurnRecordedEvent,
  ProcessId,
  INTERVIEW_TURN_RECORDED,
} from '../../../domain/index.js';
import type { InterviewTurn } from '../../../domain/index.js';

function makePublisherMock(): IEventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined), publishMany: vi.fn().mockResolvedValue(undefined) };
}

function makeTurn(overrides: Partial<InterviewTurn> = {}): InterviewTurn {
  return {
    turnType: 'note',
    speakerRole: 'interviewee',
    timestamp: new Date('2026-07-06T10:00:00.000Z'),
    content: 'I own the onboarding docs.',
    order: 0,
    topic: 'current_projects',
    sentiment: 'positive',
    answerText: 'Owns onboarding docs.',
    ...overrides,
  };
}

describe('createKafkaInterviewTurnRecordedForwarder', () => {
  it('forwards InterviewTurnRecordedEvent as an interview.turn_recorded Kafka event with mapped turns', async () => {
    const publisher = makePublisherMock();
    const forward = createKafkaInterviewTurnRecordedForwarder(publisher);
    const turns = [makeTurn()];
    const event = new InterviewTurnRecordedEvent(new ProcessId('proc-1'), turns);

    await forward(event);

    expect(publisher.publish).toHaveBeenCalledWith({
      eventType: INTERVIEW_TURN_RECORDED,
      payload: {
        process_id: 'proc-1',
        turns: [
          {
            turn_type: 'note',
            speaker_role: 'interviewee',
            timestamp: '2026-07-06T10:00:00.000Z',
            content: 'I own the onboarding docs.',
            order: 0,
            topic: 'current_projects',
            sentiment: 'positive',
            answer_text: 'Owns onboarding docs.',
          },
        ],
      },
    });
  });

  it('omits null topic/sentiment/answer_text fields instead of sending null', async () => {
    const publisher = makePublisherMock();
    const forward = createKafkaInterviewTurnRecordedForwarder(publisher);
    const turns = [makeTurn({ topic: null, sentiment: null, answerText: null })];
    const event = new InterviewTurnRecordedEvent(new ProcessId('proc-1'), turns);

    await forward(event);

    const call = vi.mocked(publisher.publish).mock.calls[0]?.[0];
    const payloadTurn = (call as { payload: { turns: Record<string, unknown>[] } }).payload.turns[0];
    expect(payloadTurn).not.toHaveProperty('topic');
    expect(payloadTurn).not.toHaveProperty('sentiment');
    expect(payloadTurn).not.toHaveProperty('answer_text');
  });

  it('throws on an unexpected event type', async () => {
    const forward = createKafkaInterviewTurnRecordedForwarder(makePublisherMock());
    await expect(forward({ eventName: 'other.event', occurredOn: new Date() })).rejects.toThrow();
  });
});
