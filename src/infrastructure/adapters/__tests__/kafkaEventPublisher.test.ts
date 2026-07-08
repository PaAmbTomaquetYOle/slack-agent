import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Producer } from 'kafkajs';
import { KafkaEventPublisher } from '../kafkaEventPublisher';
import { OFFBOARDING_TRIGGERED, DOSSIER_GENERATION_REQUESTED } from '../../../domain';
import type { OutboundEvent } from '../../../domain';

function makeProducerMock() {
  return { send: vi.fn().mockResolvedValue(undefined) } as unknown as Producer;
}

describe('KafkaEventPublisher', () => {
  let producer: Producer;
  let publisher: KafkaEventPublisher;

  beforeEach(() => {
    producer = makeProducerMock();
    publisher = new KafkaEventPublisher(producer, 'slack-agent');
  });

  it('publishes to a topic named "{prefix}.{eventType}"', async () => {
    const event: OutboundEvent = {
      eventType: OFFBOARDING_TRIGGERED,
      payload: { process_id: 'proc-1', employee_id: 'emp-1', manager_id: 'mgr-1' },
    };
    await publisher.publish(event);
    expect(producer.send).toHaveBeenCalledWith(expect.objectContaining({ topic: 'slack-agent.offboarding.triggered' }));
  });

  it('builds an envelope with event_type, payload, a UUID event_id, and an ISO occurred_at', async () => {
    const event: OutboundEvent = {
      eventType: DOSSIER_GENERATION_REQUESTED,
      payload: { process_id: 'proc-1' },
    };
    await publisher.publish(event);
    const call = vi.mocked(producer.send).mock.calls[0]?.[0];
    const message = call?.messages[0] as { value: string };
    const envelope = JSON.parse(message.value);
    expect(envelope.event_type).toBe('dossier.generation_requested');
    expect(envelope.payload).toEqual({ process_id: 'proc-1' });
    expect(envelope.event_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(envelope.occurred_at).toISOString()).toBe(envelope.occurred_at);
  });

  it('uses payload.process_id as the message key when present', async () => {
    const event: OutboundEvent = {
      eventType: OFFBOARDING_TRIGGERED,
      payload: { process_id: 'proc-42', employee_id: 'emp-1', manager_id: 'mgr-1' },
    };
    await publisher.publish(event);
    const call = vi.mocked(producer.send).mock.calls[0]?.[0];
    const message = call?.messages[0] as { key: string };
    expect(message.key).toBe('proc-42');
  });

  it('falls back to event_id as the key when process_id is absent', async () => {
    const event: OutboundEvent = {
      eventType: OFFBOARDING_TRIGGERED,
      payload: { employee_id: 'emp-1', manager_id: 'mgr-1' },
    };
    await publisher.publish(event);
    const call = vi.mocked(producer.send).mock.calls[0]?.[0];
    const message = call?.messages[0] as { key: string; value: string };
    const envelope = JSON.parse(message.value);
    expect(message.key).toBe(envelope.event_id);
  });

  it('does not throw when the producer send rejects', async () => {
    vi.mocked(producer.send).mockRejectedValue(new Error('broker unreachable'));
    const event: OutboundEvent = {
      eventType: DOSSIER_GENERATION_REQUESTED,
      payload: { process_id: 'proc-1' },
    };
    await expect(publisher.publish(event)).resolves.toBeUndefined();
  });

  it('publishMany publishes each event', async () => {
    const events: OutboundEvent[] = [
      { eventType: DOSSIER_GENERATION_REQUESTED, payload: { process_id: 'proc-1' } },
      { eventType: DOSSIER_GENERATION_REQUESTED, payload: { process_id: 'proc-2' } },
    ];
    await publisher.publishMany(events);
    expect(producer.send).toHaveBeenCalledTimes(2);
  });
});
