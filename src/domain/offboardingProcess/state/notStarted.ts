import { OffboardingProcessState } from './state.js';
import { InProgressState } from './inProgress.js';
import { CancelledState } from './cancelled.js';

export class NotStartedState extends OffboardingProcessState {
  get stateName(): string { return 'not_started'; }

  override start(): OffboardingProcessState {
    return new InProgressState();
  }

  override cancel(): OffboardingProcessState {
    return new CancelledState();
  }
}
