import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Consumer, EachMessagePayload } from 'kafkajs';
import { KafkaEventConsumer } from '../kafkaEventConsumer';
import { InboundEventDispatcher } from '../../../application/events';
import type { IDeadLetterQueue } from '../../../application/ports';
import type { IInboundEventHandler } from '../../../application/events';

function makeConsumerMock() {
  let eachMessage: (payload: EachMessagePayload) => Promise<void> = async () => {};
  const consumer = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    run: vi.fn().mockImplementation(async ({ eachMessage: fn }) => { eachMessage = fn; }),
  } as unknown as Consumer;
  return { consumer, getEachMessage: () => eachMessage };
}

function makePayload(value: string): EachMessagePayload {
  return {
    topic: 'offboarding.offboarding.completed',
    partition: 0,
    message: { value: Buffer.from(value), key: null, timestamp: '0', attributes: 0, offset: '0', headers: {} },
    heartbeat: async () => {},
    pause: () => () => {},
  } as unknown as EachMessagePayload;
}

describe('KafkaEventConsumer', () => {
  let dlq: IDeadLetterQueue;
  let handler: IInboundEventHandler;
  let dispatcher: InboundEventDispatcher;

  beforeEach(() => {
    dlq = { send: vi.fn().mockResolvedValue(undefined) };
    handler = { eventType: 'offboarding.completed', handle: vi.fn().mockResolvedValue(undefined) };
    dispatcher = new InboundEventDispatcher([handler]);
  });

  it('subscribes to the given topics and starts a run loop on start()', async () => {
    const { consumer } = makeConsumerMock();
    const kafkaConsumer = new KafkaEventConsumer(consumer, dispatcher, dlq, ['offboarding.offboarding.completed']);
    await kafkaConsumer.start();
    expect(consumer.connect).toHaveBeenCalled();
    expect(consumer.subscribe).toHaveBeenCalledWith({ topics: ['offboarding.offboarding.completed'], fromBeginning: false });
    expect(consumer.run).toHaveBeenCalled();
  });

  it('dispatches a valid message and does not send it to the DLQ', async () => {
    const { consumer, getEachMessage } = makeConsumerMock();
    const kafkaConsumer = new KafkaEventConsumer(consumer, dispatcher, dlq, ['t']);
    await kafkaConsumer.start();
    const validEnvelope = JSON.stringify({
      event_id: 'evt-1', event_type: 'offboarding.completed', occurred_at: '2024-01-01T00:00:00.000Z', payload: {},
    });
    await getEachMessage()(makePayload(validEnvelope));
    expect(handler.handle).toHaveBeenCalled();
    expect(dlq.send).not.toHaveBeenCalled();
  });

  it('routes a malformed message to the DLQ without throwing', async () => {
    const { consumer, getEachMessage } = makeConsumerMock();
    const kafkaConsumer = new KafkaEventConsumer(consumer, dispatcher, dlq, ['t']);
    await kafkaConsumer.start();
    await expect(getEachMessage()(makePayload('not json'))).resolves.toBeUndefined();
    expect(dlq.send).toHaveBeenCalled();
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('routes a handler failure to the DLQ without throwing', async () => {
    vi.mocked(handler.handle).mockRejectedValue(new Error('boom'));
    const { consumer, getEachMessage } = makeConsumerMock();
    const kafkaConsumer = new KafkaEventConsumer(consumer, dispatcher, dlq, ['t']);
    await kafkaConsumer.start();
    const validEnvelope = JSON.stringify({
      event_id: 'evt-1', event_type: 'offboarding.completed', occurred_at: '2024-01-01T00:00:00.000Z', payload: {},
    });
    await expect(getEachMessage()(makePayload(validEnvelope))).resolves.toBeUndefined();
    expect(dlq.send).toHaveBeenCalled();
  });

  it('disconnects on stop()', async () => {
    const { consumer } = makeConsumerMock();
    const kafkaConsumer = new KafkaEventConsumer(consumer, dispatcher, dlq, ['t']);
    await kafkaConsumer.stop();
    expect(consumer.disconnect).toHaveBeenCalled();
  });
});
