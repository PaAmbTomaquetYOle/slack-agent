import { OffboardingProcessState } from './state.js';

export class FinishedState extends OffboardingProcessState {
  get stateName(): string { return 'finished'; }
  // Terminal state — all transitions throw (inherited from base)
}
