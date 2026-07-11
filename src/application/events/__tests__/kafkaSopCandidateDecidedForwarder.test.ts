import { describe, it, expect, vi } from 'vitest';
import { createKafkaSopCandidateDecidedForwarder } from '../kafkaSopCandidateDecidedForwarder';
import type { IEventPublisher } from '../../ports';
import { SopCandidateDecidedEvent, ChannelId, SOP_CANDIDATE_DECIDED } from '../../../domain';

function makePublisherMock(): IEventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined), publishMany: vi.fn().mockResolvedValue(undefined) };
}

describe('createKafkaSopCandidateDecidedForwarder', () => {
  it('forwards SopCandidateDecidedEvent as a sop.candidate_decided Kafka event', async () => {
    const publisher = makePublisherMock();
    const forward = createKafkaSopCandidateDecidedForwarder(publisher);
    const event = new SopCandidateDecidedEvent(new ChannelId('C1'), '111.1', true);

    await forward(event);

    expect(publisher.publish).toHaveBeenCalledWith({
      eventType: SOP_CANDIDATE_DECIDED,
      payload: {
        channel_id: 'C1',
        message_ts: '111.1',
        accepted: true,
      },
    });
  });

  it('throws on an unexpected event type', async () => {
    const forward = createKafkaSopCandidateDecidedForwarder(makePublisherMock());
    await expect(forward({ eventName: 'other.event', occurredOn: new Date() })).rejects.toThrow();
  });
});
