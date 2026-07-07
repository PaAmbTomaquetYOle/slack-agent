import { describe, it, expect, vi } from 'vitest';
import { createKafkaOffboardingStartedForwarder } from '../kafkaOffboardingStartedForwarder';
import type { IEventPublisher } from '../../ports';
import { OffboardingStartedEvent, UserId, OFFBOARDING_TRIGGERED } from '../../../domain';

function makePublisherMock(): IEventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined), publishMany: vi.fn().mockResolvedValue(undefined) };
}

describe('createKafkaOffboardingStartedForwarder', () => {
  it('forwards OffboardingStartedEvent as an offboarding.triggered Kafka event', async () => {
    const publisher = makePublisherMock();
    const forward = createKafkaOffboardingStartedForwarder(publisher);
    const event = new OffboardingStartedEvent(new UserId('emp-1'), new UserId('mgr-1'), 'Emp Name', 'Mgr Name');

    await forward(event);

    expect(publisher.publish).toHaveBeenCalledWith({
      eventType: OFFBOARDING_TRIGGERED,
      payload: { employee_id: 'emp-1', manager_id: 'mgr-1', employee_name: 'Emp Name', manager_name: 'Mgr Name' },
    });
  });

  it('throws on an unexpected event type', async () => {
    const forward = createKafkaOffboardingStartedForwarder(makePublisherMock());
    await expect(forward({ eventName: 'other.event', occurredOn: new Date() })).rejects.toThrow();
  });
});
