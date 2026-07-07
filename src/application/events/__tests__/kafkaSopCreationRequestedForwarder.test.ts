import { describe, it, expect, vi } from 'vitest';
import { createKafkaSopCreationRequestedForwarder } from '../kafkaSopCreationRequestedForwarder';
import type { IEventPublisher } from '../../ports';
import { SopCreationRequestedEvent, ChannelId, UserId, SOP_CREATION_REQUESTED } from '../../../domain';

function makePublisherMock(): IEventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined), publishMany: vi.fn().mockResolvedValue(undefined) };
}

describe('createKafkaSopCreationRequestedForwarder', () => {
  it('forwards SopCreationRequestedEvent as a sop.creation_requested Kafka event', async () => {
    const publisher = makePublisherMock();
    const forward = createKafkaSopCreationRequestedForwarder(publisher);
    const event = new SopCreationRequestedEvent(
      new ChannelId('C123'),
      new UserId('U456'),
      'Run the deploy pipeline twice in staging before prod.',
      '1234.5678',
    );

    await forward(event);

    expect(publisher.publish).toHaveBeenCalledWith({
      eventType: SOP_CREATION_REQUESTED,
      payload: {
        channel_id: 'C123',
        author_id: 'U456',
        message_text: 'Run the deploy pipeline twice in staging before prod.',
        message_ts: '1234.5678',
      },
    });
  });

  it('throws on an unexpected event type', async () => {
    const forward = createKafkaSopCreationRequestedForwarder(makePublisherMock());
    await expect(forward({ eventName: 'other.event', occurredOn: new Date() })).rejects.toThrow();
  });
});
