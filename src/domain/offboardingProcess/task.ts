import { InvalidValueObjectError } from '../exceptions/index.js';

export type TaskSource = 'jira' | 'trello';

const VALID_SOURCES: readonly TaskSource[] = ['jira', 'trello'];

/**
 * A pending Jira/Trello task belonging to the departing employee, extracted via MCP during the
 * guided interview (SA-18). Immutable value object — identity is `id` + `source`.
 */
export class Task {
  readonly #id: string;
  readonly #title: string;
  readonly #source: TaskSource;
  readonly #status: string;
  readonly #url: string | null;
  readonly #description: string | null;

  constructor(
    id: string,
    title: string,
    source: TaskSource,
    status: string,
    url: string | null = null,
    description: string | null = null,
  ) {
    if (!id.trim()) throw new InvalidValueObjectError('Task', 'id cannot be empty');
    if (!title.trim()) throw new InvalidValueObjectError('Task', 'title cannot be empty');
    if (!VALID_SOURCES.includes(source)) {
      throw new InvalidValueObjectError('Task', `source must be one of ${VALID_SOURCES.join(', ')}`);
    }
    if (!status.trim()) throw new InvalidValueObjectError('Task', 'status cannot be empty');
    this.#id = id;
    this.#title = title;
    this.#source = source;
    this.#status = status;
    this.#url = url;
    this.#description = description;
  }

  get id(): string { return this.#id; }
  get title(): string { return this.#title; }
  get source(): TaskSource { return this.#source; }
  get status(): string { return this.#status; }
  get url(): string | null { return this.#url; }
  get description(): string | null { return this.#description; }

  equals(other: Task): boolean {
    return this.#id === other.#id && this.#source === other.#source;
  }
}
