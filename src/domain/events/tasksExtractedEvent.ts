import type { DomainEvent } from './domainEvent.js';
import type { ProcessId } from '../valueObjects/index.js';
import type { Task } from '../offboardingProcess/task.js';

/**
 * Raised when pending Jira/Trello tasks are extracted via MCP during the guided interview
 * (SA-18), so the backend can persist them and the process aggregate can be rehydrated with
 * them after a restart.
 */
export class TasksExtractedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'tasks.extracted' as const;
  readonly eventName = TasksExtractedEvent.EVENT_NAME;
  readonly occurredOn: Date;
  readonly processId: ProcessId;
  readonly tasks: readonly Task[];

  constructor(processId: ProcessId, tasks: readonly Task[], occurredOn: Date = new Date()) {
    this.occurredOn = occurredOn;
    this.processId = processId;
    this.tasks = tasks;
  }
}
