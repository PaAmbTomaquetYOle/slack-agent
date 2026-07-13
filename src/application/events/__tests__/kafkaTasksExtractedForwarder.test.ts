import { describe, it, expect, vi } from 'vitest';
import { createKafkaTasksExtractedForwarder } from '../kafkaTasksExtractedForwarder.js';
import type { IEventPublisher } from '../../ports/index.js';
import { TasksExtractedEvent, ProcessId, Task, TASKS_EXTRACTED } from '../../../domain/index.js';

function makePublisherMock(): IEventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined), publishMany: vi.fn().mockResolvedValue(undefined) };
}

describe('createKafkaTasksExtractedForwarder', () => {
  it('forwards TasksExtractedEvent as a tasks.extracted Kafka event, in snake_case', async () => {
    const publisher = makePublisherMock();
    const forward = createKafkaTasksExtractedForwarder(publisher);
    const tasks = [
      new Task('PROJ-1', 'Fix bug', 'jira', 'in_progress', 'https://jira/PROJ-1', 'desc'),
      new Task('T-1', 'Card', 'trello', 'pending'),
    ];
    const event = new TasksExtractedEvent(new ProcessId('proc-1'), tasks);

    await forward(event);

    expect(publisher.publish).toHaveBeenCalledWith({
      eventType: TASKS_EXTRACTED,
      payload: {
        process_id: 'proc-1',
        tasks: [
          { id: 'PROJ-1', title: 'Fix bug', source: 'jira', status: 'in_progress', url: 'https://jira/PROJ-1', description: 'desc' },
          { id: 'T-1', title: 'Card', source: 'trello', status: 'pending' },
        ],
      },
    });
  });

  it('throws on an unexpected event type', async () => {
    const forward = createKafkaTasksExtractedForwarder(makePublisherMock());
    await expect(forward({ eventName: 'other.event', occurredOn: new Date() })).rejects.toThrow();
  });
});
