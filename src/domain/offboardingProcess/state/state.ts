import {OffboardingStateEnum} from "../../enums";

export abstract class OffboardingProcessState {
    abstract getState(): OffboardingStateEnum;
}