import {OffboardingProcessState} from "./state";

export class OffboardingProcess {
    private state: OffboardingProcessState;

    constructor(state: OffboardingProcessState) {
        this.state = state;
    }

    get getState(): OffboardingProcessState {
        return this.state;
    }

    set setState(newState: OffboardingProcessState) {
        this.state = newState;
    }
}