import { InvalidStateTransitionError } from '../../exceptions/index';

export abstract class OffboardingProcessState {
  abstract get stateName(): string;

  start(): OffboardingProcessState {
    throw new InvalidStateTransitionError(this.stateName, 'start');
  }

  submitForReview(): OffboardingProcessState {
    throw new InvalidStateTransitionError(this.stateName, 'submitForReview');
  }

  complete(): OffboardingProcessState {
    throw new InvalidStateTransitionError(this.stateName, 'complete');
  }
}
