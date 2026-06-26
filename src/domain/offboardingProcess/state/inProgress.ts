import { OffboardingProcessState } from './state';
import { PendingRevisionState } from './pendingRevision';

export class InProgressState extends OffboardingProcessState {
  get stateName(): string { return 'in_progress'; }

  override submitForReview(): OffboardingProcessState {
    return new PendingRevisionState();
  }
}
