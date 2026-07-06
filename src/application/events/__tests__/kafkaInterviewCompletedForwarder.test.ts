import { describe, it, expect, vi } from 'vitest';
import { createKafkaInterviewCompletedForwarder } from '../kafkaInterviewCompletedForwarder';
import type { IEventPublisher } from '../../ports';
import {
  InterviewCompletedEvent,
  ProcessId,
  InterviewId,
  OUTBOUND_INTERVIEW_COMPLETED,
} from '../../../domain';
import type { InterviewTurn } from '../../../domain';

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

describe('createKafkaInterviewCompletedForwarder', () => {
  it('forwards InterviewCompletedEvent as an interview.completed Kafka event with mapped turns', async () => {
    const publisher = makePublisherMock();
    const forward = createKafkaInterviewCompletedForwarder(publisher);
    const turns = [makeTurn()];
    const event = new InterviewCompletedEvent(new ProcessId('proc-1'), new InterviewId('int-1'), turns);

    await forward(event);

    expect(publisher.publish).toHaveBeenCalledWith({
      eventType: OUTBOUND_INTERVIEW_COMPLETED,
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
    const forward = createKafkaInterviewCompletedForwarder(publisher);
    const turns = [makeTurn({ topic: null, sentiment: null, answerText: null })];
    const event = new InterviewCompletedEvent(new ProcessId('proc-1'), new InterviewId('int-1'), turns);

    await forward(event);

    const call = vi.mocked(publisher.publish).mock.calls[0]?.[0];
    const payloadTurn = (call as { payload: { turns: Record<string, unknown>[] } }).payload.turns[0];
    expect(payloadTurn).not.toHaveProperty('topic');
    expect(payloadTurn).not.toHaveProperty('sentiment');
    expect(payloadTurn).not.toHaveProperty('answer_text');
  });

  it('throws on an unexpected event type', async () => {
    const forward = createKafkaInterviewCompletedForwarder(makePublisherMock());
    await expect(forward({ eventName: 'other.event', occurredOn: new Date() })).rejects.toThrow();
  });
});
