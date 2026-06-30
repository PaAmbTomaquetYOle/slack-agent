import { OffboardingProcessState } from './state';
import { FinishedState } from './finished';
import { CancelledState } from './cancelled';

export class PendingRevisionState extends OffboardingProcessState {
  get stateName(): string { return 'pending_revision'; }

  override complete(): OffboardingProcessState {
    return new FinishedState();
  }

  override cancel(): OffboardingProcessState {
    return new CancelledState();
  }
}
