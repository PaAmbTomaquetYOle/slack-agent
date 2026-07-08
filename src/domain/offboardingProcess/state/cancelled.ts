import { OffboardingProcessState } from './state';

export class CancelledState extends OffboardingProcessState {
  get stateName(): string { return 'cancelled'; }
  // Terminal state — all transitions throw (inherited from base)
}
