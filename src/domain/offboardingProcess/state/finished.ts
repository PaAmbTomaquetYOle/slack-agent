import {OffboardingProcessState} from "./state";
import {OffboardingStateEnum} from "../../enums";

export class FinishedState extends OffboardingProcessState {
    getState(): OffboardingStateEnum {
        return OffboardingStateEnum.Finished;
    }

}