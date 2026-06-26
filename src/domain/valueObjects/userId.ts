export class UserId {
  readonly #value: string;

  constructor(value: string) {
    if (!value.trim()) throw new Error('UserId cannot be empty');
    this.#value = value;
  }

  get value(): string { return this.#value; }

  equals(other: UserId): boolean { return this.#value === other.#value; }
}
