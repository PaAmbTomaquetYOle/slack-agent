import { describe, it, expect } from 'vitest';
import { OffboardingProcess } from '../process.js';
import { Task } from '../task.js';
import { ProcessId, UserId, InterviewId, DossierId } from '../../valueObjects/index.js';

function makeProcess(): OffboardingProcess {
  return OffboardingProcess.create(new ProcessId('proc-1'), new UserId('U-DEP'), new UserId('U-INIT'));
}

describe('OffboardingProcess tasks (SA-18)', () => {
  it('starts with no tasks', () => {
    const process = makeProcess();
    expect(process.tasks).toEqual([]);
  });

  it('assignTasks() replaces the tracked tasks in-memory', () => {
    const process = makeProcess();
    const tasks = [new Task('PROJ-1', 'Fix bug', 'jira', 'in_progress'), new Task('T-1', 'Card', 'trello', 'pending')];

    process.assignTasks(tasks);

    expect(process.tasks).toHaveLength(2);
    expect(process.tasks[0]?.id).toBe('PROJ-1');
  });

  it('tasks getter returns a defensive copy', () => {
    const process = makeProcess();
    process.assignTasks([new Task('PROJ-1', 'Fix bug', 'jira', 'in_progress')]);

    const first = process.tasks;
    first.push(new Task('extra', 'sneaky', 'jira', 'pending'));

    expect(process.tasks).toHaveLength(1);
  });

  it('fromBackend() defaults tasks to an empty array when omitted', () => {
    const process = OffboardingProcess.fromBackend({
      id: new ProcessId('proc-1'),
      departingUserId: new UserId('U-DEP'),
      initiatorId: new UserId('U-INIT'),
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      state: 'in_progress',
      interviewId: new InterviewId('int-1'),
      dossierId: new DossierId('doss-1'),
    });

    expect(process.tasks).toEqual([]);
  });

  it('fromBackend() populates tasks when provided', () => {
    const tasks = [new Task('PROJ-1', 'Fix bug', 'jira', 'in_progress')];
    const process = OffboardingProcess.fromBackend({
      id: new ProcessId('proc-1'),
      departingUserId: new UserId('U-DEP'),
      initiatorId: new UserId('U-INIT'),
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      state: 'in_progress',
      interviewId: null,
      dossierId: null,
      tasks,
    });

    expect(process.tasks).toHaveLength(1);
    expect(process.tasks[0]?.id).toBe('PROJ-1');
  });
});
