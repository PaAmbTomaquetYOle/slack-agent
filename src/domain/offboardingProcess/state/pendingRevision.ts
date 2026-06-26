import {OffboardingProcessState} from "./state";
import {OffboardingStateEnum} from "../../enums";

export class PendingRevisionState extends OffboardingProcessState {
    getState(): OffboardingStateEnum {
        return OffboardingStateEnum.PendingRevision;
    }

}