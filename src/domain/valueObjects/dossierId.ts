import { InvalidValueObjectError } from '../exceptions';

export class DossierId {
  readonly #value: string;

  constructor(value: string) {
    if (!value.trim()) throw new InvalidValueObjectError('DossierId', 'cannot be empty');
    this.#value = value;
  }

  get value(): string { return this.#value; }

  equals(other: DossierId): boolean { return this.#value === other.#value; }

  toString(): string { return this.#value; }

  static generate(): DossierId { return new DossierId(crypto.randomUUID()); }
}
