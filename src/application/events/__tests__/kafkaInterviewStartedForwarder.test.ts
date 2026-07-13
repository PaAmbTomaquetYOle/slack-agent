import { describe, it, expect, vi } from 'vitest';
import { createKafkaInterviewStartedForwarder } from '../kafkaInterviewStartedForwarder.js';
import type { IEventPublisher } from '../../ports/index.js';
import { InterviewStartedEvent, ProcessId, UserId, INTERVIEW_STARTED } from '../../../domain/index.js';

function makePublisherMock(): IEventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined), publishMany: vi.fn().mockResolvedValue(undefined) };
}

describe('createKafkaInterviewStartedForwarder', () => {
  it('forwards InterviewStartedEvent as an interview.started Kafka event', async () => {
    const publisher = makePublisherMock();
    const forward = createKafkaInterviewStartedForwarder(publisher);
    const event = new InterviewStartedEvent(new ProcessId('proc-1'), new UserId('emp-1'));

    await forward(event);

    expect(publisher.publish).toHaveBeenCalledWith({
      eventType: INTERVIEW_STARTED,
      payload: { process_id: 'proc-1' },
    });
  });

  it('throws on an unexpected event type', async () => {
    const forward = createKafkaInterviewStartedForwarder(makePublisherMock());
    await expect(forward({ eventName: 'other.event', occurredOn: new Date() })).rejects.toThrow();
  });
});
