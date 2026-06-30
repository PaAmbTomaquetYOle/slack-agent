import axios from 'axios';
import { DomainError } from '../../domain';

export class BackendConnectionError extends DomainError {
  constructor(message: string) {
    super(`Backend connection error: ${message}`);
  }
}

export class BackendNotFoundError extends DomainError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
  }
}

export class BackendValidationError extends DomainError {
  constructor(detail: string) {
    super(`Backend validation error: ${detail}`);
  }
}

export class BackendError extends DomainError {
  constructor(status: number, detail: string) {
    super(`Backend error (${status}): ${detail}`);
  }
}

export function handleAxiosError(error: unknown, resource: string, id = ''): never {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      throw new BackendConnectionError(error.message);
    }
    const status = error.response.status;
    const detail = (error.response.data as { detail?: string })?.detail ?? error.message;
    if (status === 404) throw new BackendNotFoundError(resource, id);
    if (status === 400 || status === 422) throw new BackendValidationError(detail);
    throw new BackendError(status, detail);
  }
  throw error;
}
