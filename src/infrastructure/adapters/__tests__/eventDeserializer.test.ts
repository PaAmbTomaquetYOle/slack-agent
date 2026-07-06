import { describe, it, expect } from 'vitest';
import { deserializeEnvelope, EventDeserializationError } from '../eventDeserializer';

describe('deserializeEnvelope', () => {
  it('parses a valid envelope', () => {
    const raw = Buffer.from(JSON.stringify({
      event_id: 'evt-1',
      event_type: 'offboarding.completed',
      occurred_at: '2024-01-01T00:00:00.000Z',
      payload: { process_id: 'proc-1' },
    }));
    const envelope = deserializeEnvelope(raw);
    expect(envelope.event_type).toBe('offboarding.completed');
    expect(envelope.payload).toEqual({ process_id: 'proc-1' });
  });

  it('throws EventDeserializationError on invalid JSON', () => {
    expect(() => deserializeEnvelope(Buffer.from('not json'))).toThrow(EventDeserializationError);
  });

  it('throws EventDeserializationError when a required field is missing', () => {
    const raw = Buffer.from(JSON.stringify({ event_type: 'offboarding.completed', payload: {} }));
    expect(() => deserializeEnvelope(raw)).toThrow(EventDeserializationError);
  });

  it('throws EventDeserializationError when a field has the wrong type', () => {
    const raw = Buffer.from(JSON.stringify({
      event_id: 'evt-1',
      event_type: 'offboarding.completed',
      occurred_at: '2024-01-01T00:00:00.000Z',
      payload: 'not-an-object',
    }));
    expect(() => deserializeEnvelope(raw)).toThrow(EventDeserializationError);
  });
});
