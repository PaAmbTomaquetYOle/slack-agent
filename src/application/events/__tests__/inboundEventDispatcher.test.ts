import { describe, it, expect, vi } from 'vitest';
import { InboundEventDispatcher, UnknownEventTypeError } from '../inboundEventDispatcher.js';
import type { IInboundEventHandler } from '../inboundEventHandler.js';
import type { KafkaEventEnvelope } from '../../../domain/index.js';

function envelope(eventType: string): KafkaEventEnvelope {
  return { event_id: 'evt-1', event_type: eventType, occurred_at: '2024-01-01T00:00:00.000Z', payload: {} };
}

describe('InboundEventDispatcher', () => {
  it('routes an envelope to the matching handler', async () => {
    const handler: IInboundEventHandler = { eventType: 'dossier.generated', handle: vi.fn().mockResolvedValue(undefined) };
    const dispatcher = new InboundEventDispatcher([handler]);
    await dispatcher.dispatch(envelope('dossier.generated'));
    expect(handler.handle).toHaveBeenCalledWith(envelope('dossier.generated'));
  });

  it('throws UnknownEventTypeError when no handler matches', async () => {
    const dispatcher = new InboundEventDispatcher([]);
    await expect(dispatcher.dispatch(envelope('unknown.event'))).rejects.toThrow(UnknownEventTypeError);
  });

  it('throws when two handlers register the same event type', () => {
    const handlerA: IInboundEventHandler = { eventType: 'dossier.generated', handle: vi.fn() };
    const handlerB: IInboundEventHandler = { eventType: 'dossier.generated', handle: vi.fn() };
    expect(() => new InboundEventDispatcher([handlerA, handlerB])).toThrow();
  });
});
