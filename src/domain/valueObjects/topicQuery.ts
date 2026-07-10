import { InvalidValueObjectError } from '../exceptions';

export class TopicQuery {
  readonly #value: string;

  constructor(value: string) {
    const trimmed = value.trim();
    if (!trimmed) throw new InvalidValueObjectError('TopicQuery', 'cannot be empty');
    this.#value = trimmed;
  }

  get value(): string { return this.#value; }

  equals(other: TopicQuery): boolean { return this.#value === other.#value; }

  toString(): string { return this.#value; }
}
