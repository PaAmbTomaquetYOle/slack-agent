import { DomainError } from './domainError.js';

export class InvalidValueObjectError extends DomainError {
  constructor(valueObjectName: string, message: string) {
    super(`${valueObjectName}: ${message}`);
  }
}
