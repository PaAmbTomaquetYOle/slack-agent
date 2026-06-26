import { OffboardingProcessState } from './state';
import { InProgressState } from './inProgress';

export class NotStartedState extends OffboardingProcessState {
  get stateName(): string { return 'not_started'; }

  override start(): OffboardingProcessState {
    return new InProgressState();
  }
}
