import { OffboardingProcessState } from './state';
import { FinishedState } from './finished';

export class PendingRevisionState extends OffboardingProcessState {
  get stateName(): string { return 'pending_revision'; }

  override complete(): OffboardingProcessState {
    return new FinishedState();
  }
}
