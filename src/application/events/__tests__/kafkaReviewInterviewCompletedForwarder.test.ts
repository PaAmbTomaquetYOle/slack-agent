import { describe, it, expect, vi } from 'vitest';
import { createKafkaReviewInterviewCompletedForwarder } from '../kafkaReviewInterviewCompletedForwarder.js';
import type { IEventPublisher } from '../../ports/index.js';
import {
  ReviewInterviewCompletedEvent,
  ProcessId,
  InterviewId,
  MONTHLY_REVIEW_INTERVIEW_COMPLETED,
  ANNUAL_REVIEW_INTERVIEW_COMPLETED,
} from '../../../domain/index.js';
import type { InterviewTurn } from '../../../domain/index.js';

function makePublisherMock(): IEventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined), publishMany: vi.fn().mockResolvedValue(undefined) };
}

const TURNS: InterviewTurn[] = [
  {
    turnType: 'note', speakerRole: 'interviewee', timestamp: new Date('2026-07-06T09:00:00.000Z'),
    content: 'Worked on the migration.', order: 0,
    topic: 'current_projects', sentiment: 'neutral', answerText: 'Migration work',
  },
];

describe('createKafkaReviewInterviewCompletedForwarder', () => {
  it('forwards a monthly ReviewInterviewCompletedEvent as monthly_review.interview_completed', async () => {
    const publisher = makePublisherMock();
    const forward = createKafkaReviewInterviewCompletedForwarder(publisher);
    const event = new ReviewInterviewCompletedEvent(new ProcessId('proc-1'), new InterviewId('int-1'), 'monthly', TURNS);

    await forward(event);

    expect(publisher.publish).toHaveBeenCalledWith({
      eventType: MONTHLY_REVIEW_INTERVIEW_COMPLETED,
      payload: {
        process_id: 'proc-1',
        turns: [
          {
            turn_type: 'note',
            speaker_role: 'interviewee',
            timestamp: '2026-07-06T09:00:00.000Z',
            content: 'Worked on the migration.',
            order: 0,
            topic: 'current_projects',
            sentiment: 'neutral',
            answer_text: 'Migration work',
          },
        ],
      },
    });
  });

  it('forwards an annual ReviewInterviewCompletedEvent as annual_review.interview_completed', async () => {
    const publisher = makePublisherMock();
    const forward = createKafkaReviewInterviewCompletedForwarder(publisher);
    const event = new ReviewInterviewCompletedEvent(new ProcessId('proc-1'), new InterviewId('int-1'), 'annual', []);

    await forward(event);

    expect(publisher.publish).toHaveBeenCalledWith({
      eventType: ANNUAL_REVIEW_INTERVIEW_COMPLETED,
      payload: { process_id: 'proc-1', turns: [] },
    });
  });

  it('throws on an unexpected event type', async () => {
    const forward = createKafkaReviewInterviewCompletedForwarder(makePublisherMock());
    await expect(forward({ eventName: 'other.event', occurredOn: new Date() })).rejects.toThrow();
  });
});
