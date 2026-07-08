import { InvalidValueObjectError } from '../exceptions';

export class InterviewId {
  readonly #value: string;

  constructor(value: string) {
    if (!value.trim()) throw new InvalidValueObjectError('InterviewId', 'cannot be empty');
    this.#value = value;
  }

  get value(): string { return this.#value; }

  equals(other: InterviewId): boolean { return this.#value === other.#value; }

  toString(): string { return this.#value; }

  static generate(): InterviewId { return new InterviewId(crypto.randomUUID()); }
}
