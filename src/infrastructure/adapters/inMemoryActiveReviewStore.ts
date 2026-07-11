import type { ProcessId, UserId, ActiveReview, ReviewScope } from '../../domain';
import type { IActiveReviewStore } from '../../application/ports';

/**
 * Holds each in-flight review process's employee mapping in memory (SA-20) — see
 * IActiveReviewStore and ActiveReview for why (no backend HTTP read model for review
 * processes, unlike offboarding). Lost on restart; a future issue could add a backend read
 * endpoint to support rehydration, mirroring OffboardingOrchestrator.recover().
 */
export class InMemoryActiveReviewStore implements IActiveReviewStore {
  readonly #byEmployee = new Map<string, ActiveReview>();

  find(employeeId: UserId): ActiveReview | null {
    return this.#byEmployee.get(employeeId.value) ?? null;
  }

  start(employeeId: UserId, processId: ProcessId, reviewScope: ReviewScope): ActiveReview {
    const active: ActiveReview = { employeeId, processId, reviewScope };
    this.#byEmployee.set(employeeId.value, active);
    return active;
  }

  end(employeeId: UserId): void {
    this.#byEmployee.delete(employeeId.value);
  }
}
