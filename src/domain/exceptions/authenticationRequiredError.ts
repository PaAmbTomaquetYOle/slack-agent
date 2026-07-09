import type { AuthProvider } from '../auth';
import { DomainError } from './domainError';

export class AuthenticationRequiredError extends DomainError {
  readonly provider: AuthProvider;

  constructor(provider: AuthProvider) {
    super(`Authentication required for ${provider}`);
    this.provider = provider;
  }
}
