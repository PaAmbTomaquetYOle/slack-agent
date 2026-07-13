import type { DomainEvent, Task, OutboundTaskPayload } from '../../domain/index.js';
import type { TasksExtractedEvent } from '../../domain/index.js';
import { TASKS_EXTRACTED } from '../../domain/index.js';
import type { IEventPublisher } from '../ports/index.js';

function isTasksExtractedEvent(event: DomainEvent): event is TasksExtractedEvent {
  return event.eventName === 'tasks.extracted';
}

function toOutboundTask(task: Task): OutboundTaskPayload {
  return {
    id: task.id,
    title: task.title,
    source: task.source,
    status: task.status,
    ...(task.url !== null ? { url: task.url } : {}),
    ...(task.description !== null ? { description: task.description } : {}),
  };
}

/**
 * Bridges the in-process DomainEventBus to Kafka: forwards TasksExtractedEvent as a
 * `tasks.extracted` event so the backend can persist the pending Jira/Trello tasks captured
 * during the interview (SA-18).
 */
export function createKafkaTasksExtractedForwarder(publisher: IEventPublisher) {
  return async (event: DomainEvent): Promise<void> => {
    if (!isTasksExtractedEvent(event)) {
      throw new Error(`Unexpected event type: ${event.eventName}`);
    }
    await publisher.publish({
      eventType: TASKS_EXTRACTED,
      payload: {
        process_id: event.processId.value,
        tasks: event.tasks.map(toOutboundTask),
      },
    });
  };
}
