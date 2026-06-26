import type { OffboardingProcess } from '../../domain';

export interface IOffboardingService {
  startOffboarding(departingUserId: string, initiatorId: string): Promise<OffboardingProcess>;
}
