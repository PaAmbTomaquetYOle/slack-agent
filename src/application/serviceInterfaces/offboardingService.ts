export interface IOffboardingService {
  startOffboarding(departingUserId: string, initiatorId: string): Promise<void>;
}
