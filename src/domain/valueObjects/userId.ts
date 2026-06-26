import { DomainError } from '../exceptions/index';

export class UserId {
  readonly #value: string;

  constructor(value: string) {
    if (!value.trim()) throw new DomainError('UserId cannot be empty');
    this.#value = value;
  }

  get value(): string { return this.#value; }

  equals(other: UserId): boolean { return this.#value === other.#value; }

  toString(): string { return this.#value; }
}
