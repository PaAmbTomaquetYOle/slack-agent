import { describe, it, expect } from 'vitest';
import { Task } from '../task';
import { InvalidValueObjectError } from '../../exceptions';

describe('Task', () => {
  it('constructs with all fields and exposes them via getters', () => {
    const task = new Task('PROJ-1', 'Fix the thing', 'jira', 'in_progress', 'https://example.com', 'desc');

    expect(task.id).toBe('PROJ-1');
    expect(task.title).toBe('Fix the thing');
    expect(task.source).toBe('jira');
    expect(task.status).toBe('in_progress');
    expect(task.url).toBe('https://example.com');
    expect(task.description).toBe('desc');
  });

  it('defaults url and description to null when omitted', () => {
    const task = new Task('T-1', 'Card', 'trello', 'pending');

    expect(task.url).toBeNull();
    expect(task.description).toBeNull();
  });

  it('throws when id is empty', () => {
    expect(() => new Task('  ', 'title', 'jira', 'pending')).toThrow(InvalidValueObjectError);
  });

  it('throws when title is empty', () => {
    expect(() => new Task('id', '', 'jira', 'pending')).toThrow(InvalidValueObjectError);
  });

  it('throws when status is empty', () => {
    expect(() => new Task('id', 'title', 'jira', '  ')).toThrow(InvalidValueObjectError);
  });

  it('throws when source is not jira or trello', () => {
    // @ts-expect-error deliberately invalid source to exercise the runtime guard
    expect(() => new Task('id', 'title', 'asana', 'pending')).toThrow(InvalidValueObjectError);
  });

  it('equals() compares by id and source', () => {
    const a = new Task('id', 'title', 'jira', 'pending');
    const b = new Task('id', 'title', 'jira', 'done');
    const c = new Task('id', 'title', 'trello', 'pending');
    const d = new Task('other', 'title', 'jira', 'pending');

    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
    expect(a.equals(d)).toBe(false);
  });
});
