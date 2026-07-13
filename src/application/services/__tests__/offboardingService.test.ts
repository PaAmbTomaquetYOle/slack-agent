import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IUserInfoProvider } from '../../ports/index.js';
import type { IDomainEventBus } from '../../events/index.js';
import { OffboardingService } from '../offboardingService.js';
import { OffboardingStartedEvent } from '../../../domain/index.js';

function makeUserInfoProviderMock(): IUserInfoProvider {
  return { getDisplayName: vi.fn() };
}

function makeEventBusMock(): IDomainEventBus {
  return { subscribe: vi.fn(), publish: vi.fn() };
}

describe('OffboardingService', () => {
  let userInfoProvider: IUserInfoProvider;
  let eventBus: IDomainEventBus;
  let service: OffboardingService;

  beforeEach(() => {
    userInfoProvider = makeUserInfoProviderMock();
    eventBus = makeEventBusMock();
    service = new OffboardingService(eventBus, userInfoProvider);
  });

  it('startOffboarding() resolves display names and publishes OffboardingStartedEvent (Kafka-only, no REST)', async () => {
    vi.mocked(userInfoProvider.getDisplayName).mockImplementation(async (id: string) =>
      id === 'U-DEPARTING' ? 'Alice' : 'Bob',
    );

    await service.startOffboarding('U-DEPARTING', 'U-INITIATOR');

    expect(userInfoProvider.getDisplayName).toHaveBeenCalledWith('U-DEPARTING');
    expect(userInfoProvider.getDisplayName).toHaveBeenCalledWith('U-INITIATOR');
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: OffboardingStartedEvent.EVENT_NAME,
        departingUserId: expect.objectContaining({ value: 'U-DEPARTING' }),
        initiatorId: expect.objectContaining({ value: 'U-INITIATOR' }),
        employeeName: 'Alice',
        managerName: 'Bob',
      }),
    );
  });

  it('startOffboarding() falls back to undefined names when the provider cannot resolve them', async () => {
    vi.mocked(userInfoProvider.getDisplayName).mockResolvedValue(null);

    await service.startOffboarding('U-DEPARTING', 'U-INITIATOR');

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ employeeName: undefined, managerName: undefined }),
    );
  });
});
