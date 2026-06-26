import type { OffboardingProcess } from '../../domain/index.js';

export interface IOffboardingService {
  startOffboarding(departingUserId: string, initiatorId: string): Promise<OffboardingProcess>;
}
