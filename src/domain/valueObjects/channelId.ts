export class ChannelId {
  readonly #value: string;

  constructor(value: string) {
    if (!value.trim()) throw new Error('ChannelId cannot be empty');
    this.#value = value;
  }

  get value(): string { return this.#value; }

  equals(other: ChannelId): boolean { return this.#value === other.#value; }
}
