import {OffboardingProcessState} from "./state";
import {OffboardingStateEnum} from "../../enums";

export class NotStartedState extends OffboardingProcessState {
    getState(): OffboardingStateEnum {
        return OffboardingStateEnum.NotStarted;
    }

}