/**
 * Wire format for Kafka messages exchanged with the backend. Field names are
 * snake_case to match the backend's `DomainEvent.to_dict()` envelope exactly.
 */
export interface KafkaEventEnvelope {
  event_id: string;
  event_type: string;
  occurred_at: string;
  payload: Record<string, unknown>;
}
