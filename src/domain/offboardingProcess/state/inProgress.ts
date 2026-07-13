import { OffboardingProcessState } from './state.js';
import { PendingRevisionState } from './pendingRevision.js';
import { CancelledState } from './cancelled.js';

export class InProgressState extends OffboardingProcessState {
  get stateName(): string { return 'in_progress'; }

  override submitForReview(): OffboardingProcessState {
    return new PendingRevisionState();
  }

  override cancel(): OffboardingProcessState {
    return new CancelledState();
  }
}
