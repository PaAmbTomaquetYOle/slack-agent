import type { AuthProvider } from '../auth/index.js';
import { DomainError } from './domainError.js';

export class AuthenticationRequiredError extends DomainError {
  readonly provider: AuthProvider;

  constructor(provider: AuthProvider) {
    super(`Authentication required for ${provider}`);
    this.provider = provider;
  }
}
