import { DomainError } from '../exceptions/index';

export class ChannelId {
  readonly #value: string;

  constructor(value: string) {
    if (!value.trim()) throw new DomainError('ChannelId cannot be empty');
    this.#value = value;
  }

  get value(): string { return this.#value; }

  equals(other: ChannelId): boolean { return this.#value === other.#value; }

  toString(): string { return this.#value; }
}
