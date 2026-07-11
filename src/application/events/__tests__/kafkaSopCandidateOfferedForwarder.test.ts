import { describe, it, expect, vi } from 'vitest';
import { createKafkaSopCandidateOfferedForwarder } from '../kafkaSopCandidateOfferedForwarder';
import type { IEventPublisher } from '../../ports';
import { SopCandidateOfferedEvent, ChannelId, UserId, SOP_CANDIDATE_OFFERED } from '../../../domain';

function makePublisherMock(): IEventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined), publishMany: vi.fn().mockResolvedValue(undefined) };
}

describe('createKafkaSopCandidateOfferedForwarder', () => {
  it('forwards SopCandidateOfferedEvent as a sop.candidate_offered Kafka event', async () => {
    const publisher = makePublisherMock();
    const forward = createKafkaSopCandidateOfferedForwarder(publisher);
    const event = new SopCandidateOfferedEvent(
      new ChannelId('C1'),
      new UserId('U1'),
      'Rotate secrets every 90 days',
      '111.1',
    );

    await forward(event);

    expect(publisher.publish).toHaveBeenCalledWith({
      eventType: SOP_CANDIDATE_OFFERED,
      payload: {
        channel_id: 'C1',
        author_id: 'U1',
        message_ts: '111.1',
        content: 'Rotate secrets every 90 days',
      },
    });
  });

  it('throws on an unexpected event type', async () => {
    const forward = createKafkaSopCandidateOfferedForwarder(makePublisherMock());
    await expect(forward({ eventName: 'other.event', occurredOn: new Date() })).rejects.toThrow();
  });
});
