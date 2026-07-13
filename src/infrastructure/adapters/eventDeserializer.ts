import type { KafkaEventEnvelope } from '../../domain/index.js';

export class EventDeserializationError extends Error {
  constructor(reason: string) {
    super(`Failed to deserialize Kafka event: ${reason}`);
  }
}

function isValidEnvelope(value: unknown): value is KafkaEventEnvelope {
  const v = value as Partial<KafkaEventEnvelope> | null;
  return !!v
    && typeof v.event_id === 'string'
    && typeof v.event_type === 'string'
    && typeof v.occurred_at === 'string'
    && typeof v.payload === 'object' && v.payload !== null;
}

export function deserializeEnvelope(raw: Buffer): KafkaEventEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf-8'));
  } catch {
    throw new EventDeserializationError('invalid JSON');
  }
  if (!isValidEnvelope(parsed)) {
    throw new EventDeserializationError('missing or malformed envelope fields');
  }
  return parsed;
}
