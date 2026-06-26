import { OffboardingProcessState } from './state.js';
import { InProgressState } from './inProgress.js';

export class NotStartedState extends OffboardingProcessState {
  get stateName(): string { return 'not_started'; }

  override start(): OffboardingProcessState {
    return new InProgressState();
  }
}
