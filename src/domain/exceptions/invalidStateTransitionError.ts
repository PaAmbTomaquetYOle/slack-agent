import { DomainError } from './domainError';

export class InvalidStateTransitionError extends DomainError {
  constructor(fromState: string, action: string) {
    super(`Cannot ${action} from state "${fromState}"`);
  }
}
