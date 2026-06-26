import { InvalidValueObjectError } from '../exceptions';

export class ProcessId {
  readonly #value: string;

  constructor(value: string) {
    if (!value.trim()) throw new InvalidValueObjectError('ProcessId', 'cannot be empty');
    this.#value = value;
  }

  get value(): string { return this.#value; }

  equals(other: ProcessId): boolean { return this.#value === other.#value; }

  toString(): string { return this.#value; }

  static generate(): ProcessId { return new ProcessId(crypto.randomUUID()); }
}
