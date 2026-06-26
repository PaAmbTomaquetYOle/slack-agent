import { OffboardingProcessState } from './state.js';
import { FinishedState } from './finished.js';

export class PendingRevisionState extends OffboardingProcessState {
  get stateName(): string { return 'pending_revision'; }

  override complete(): OffboardingProcessState {
    return new FinishedState();
  }
}
