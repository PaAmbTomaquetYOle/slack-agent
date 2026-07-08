import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Producer } from 'kafkajs';
import { KafkaDeadLetterQueue } from '../kafkaDeadLetterQueue';

function makeProducerMock() {
  return { send: vi.fn().mockResolvedValue(undefined) } as unknown as Producer;
}

describe('KafkaDeadLetterQueue', () => {
  let producer: Producer;
  let dlq: KafkaDeadLetterQueue;

  beforeEach(() => {
    producer = makeProducerMock();
    dlq = new KafkaDeadLetterQueue(producer, 'slack-agent.dlq');
  });

  it('publishes the raw message to the DLQ topic with source_topic and error headers', async () => {
    const raw = Buffer.from('not json');
    const error = new Error('invalid JSON');
    await dlq.send(raw, 'offboarding.dossier.generated', error);
    expect(producer.send).toHaveBeenCalledWith({
      topic: 'slack-agent.dlq',
      messages: [{
        value: raw,
        headers: { source_topic: 'offboarding.dossier.generated', error: 'invalid JSON' },
      }],
    });
  });

  it('does not throw when the producer send rejects', async () => {
    vi.mocked(producer.send).mockRejectedValue(new Error('broker unreachable'));
    await expect(dlq.send(Buffer.from('x'), 'topic', new Error('boom'))).resolves.toBeUndefined();
  });
});
