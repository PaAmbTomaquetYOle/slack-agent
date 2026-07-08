import { OffboardingProcessState } from './state';
import { InProgressState } from './inProgress';
import { CancelledState } from './cancelled';

export class NotStartedState extends OffboardingProcessState {
  get stateName(): string { return 'not_started'; }

  override start(): OffboardingProcessState {
    return new InProgressState();
  }

  override cancel(): OffboardingProcessState {
    return new CancelledState();
  }
}
