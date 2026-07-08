import { DomainError } from './domainError';

export class InvalidValueObjectError extends DomainError {
  constructor(valueObjectName: string, message: string) {
    super(`${valueObjectName}: ${message}`);
  }
}
