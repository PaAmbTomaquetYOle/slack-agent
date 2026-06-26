import {OffboardingProcessState} from "./state";
import {OffboardingStateEnum} from "../../enums";

export class InProgressState extends OffboardingProcessState {
    getState(): OffboardingStateEnum {
        return OffboardingStateEnum.InProgress;
    }

}