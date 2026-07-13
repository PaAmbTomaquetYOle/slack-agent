import { describe, it, expect, vi } from 'vitest';
import { createKafkaOffboardingCancellationRequestedForwarder } from '../kafkaOffboardingCancellationRequestedForwarder.js';
import type { IEventPublisher } from '../../ports/index.js';
import { OffboardingCancellationRequestedEvent, ProcessId, OFFBOARDING_CANCELLATION_REQUESTED } from '../../../domain/index.js';

function makePublisherMock(): IEventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined), publishMany: vi.fn().mockResolvedValue(undefined) };
}

describe('createKafkaOffboardingCancellationRequestedForwarder', () => {
  it('forwards OffboardingCancellationRequestedEvent as an offboarding.cancellation_requested Kafka event', async () => {
    const publisher = makePublisherMock();
    const forward = createKafkaOffboardingCancellationRequestedForwarder(publisher);
    const event = new OffboardingCancellationRequestedEvent(new ProcessId('proc-1'));

    await forward(event);

    expect(publisher.publish).toHaveBeenCalledWith({
      eventType: OFFBOARDING_CANCELLATION_REQUESTED,
      payload: { process_id: 'proc-1' },
    });
  });

  it('throws on an unexpected event type', async () => {
    const forward = createKafkaOffboardingCancellationRequestedForwarder(makePublisherMock());
    await expect(forward({ eventName: 'other.event', occurredOn: new Date() })).rejects.toThrow();
  });
});
