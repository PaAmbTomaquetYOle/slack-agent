import { DomainError } from '../../domain/index.js';
import type { KafkaEventEnvelope } from '../../domain/index.js';
import type { IInboundEventHandler } from './inboundEventHandler.js';

export class UnknownEventTypeError extends DomainError {
  constructor(eventType: string) {
    super(`No handler registered for event type '${eventType}'`);
  }
}

export class InboundEventDispatcher {
  readonly #handlers: Map<string, IInboundEventHandler> = new Map();

  constructor(handlers: IInboundEventHandler[]) {
    for (const handler of handlers) {
      if (this.#handlers.has(handler.eventType)) {
        throw new Error(`Duplicate handler registered for event type '${handler.eventType}'`);
      }
      this.#handlers.set(handler.eventType, handler);
    }
  }

  async dispatch(envelope: KafkaEventEnvelope): Promise<void> {
    const handler = this.#handlers.get(envelope.event_type);
    if (!handler) {
      throw new UnknownEventTypeError(envelope.event_type);
    }
    await handler.handle(envelope);
  }
}
