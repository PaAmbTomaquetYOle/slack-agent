import { OffboardingProcessState } from './state';
import { PendingRevisionState } from './pendingRevision';
import { CancelledState } from './cancelled';

export class InProgressState extends OffboardingProcessState {
  get stateName(): string { return 'in_progress'; }

  override submitForReview(): OffboardingProcessState {
    return new PendingRevisionState();
  }

  override cancel(): OffboardingProcessState {
    return new CancelledState();
  }
}
