import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IOffboardingProcessRepository, IUserInfoProvider } from '../../ports';
import type { IDomainEventBus } from '../../events';
import { OffboardingService } from '../offboardingService';
import { OffboardingProcess, OffboardingStartedEvent, ProcessId, UserId } from '../../../domain';

function makeRepositoryMock(): IOffboardingProcessRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    delete: vi.fn(),
    start: vi.fn(),
    submitForReview: vi.fn(),
    complete: vi.fn(),
    cancel: vi.fn(),
  } as unknown as IOffboardingProcessRepository;
}

function makeUserInfoProviderMock(): IUserInfoProvider {
  return { getDisplayName: vi.fn() };
}

function makeEventBusMock(): IDomainEventBus {
  return { subscribe: vi.fn(), publish: vi.fn() };
}

describe('OffboardingService', () => {
  let repository: IOffboardingProcessRepository;
  let userInfoProvider: IUserInfoProvider;
  let eventBus: IDomainEventBus;
  let service: OffboardingService;

  beforeEach(() => {
    repository = makeRepositoryMock();
    userInfoProvider = makeUserInfoProviderMock();
    eventBus = makeEventBusMock();
    service = new OffboardingService(repository, eventBus, userInfoProvider);
  });

  it('startOffboarding() resolves display names, creates the process and publishes OffboardingStartedEvent', async () => {
    const departingUserId = new UserId('U-DEPARTING');
    const initiatorId = new UserId('U-INITIATOR');
    const process = OffboardingProcess.create(ProcessId.generate(), departingUserId, initiatorId);

    vi.mocked(userInfoProvider.getDisplayName).mockImplementation(async (id: string) =>
      id === 'U-DEPARTING' ? 'Alice' : 'Bob',
    );
    vi.mocked(repository.create).mockResolvedValue(process);

    const result = await service.startOffboarding('U-DEPARTING', 'U-INITIATOR');

    expect(userInfoProvider.getDisplayName).toHaveBeenCalledWith('U-DEPARTING');
    expect(userInfoProvider.getDisplayName).toHaveBeenCalledWith('U-INITIATOR');
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'U-DEPARTING' }),
      expect.objectContaining({ value: 'U-INITIATOR' }),
      'Alice',
      'Bob',
    );
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(OffboardingStartedEvent));
    expect(result).toBe(process);
  });

  it('startOffboarding() falls back to undefined names when the provider cannot resolve them', async () => {
    const process = OffboardingProcess.create(
      ProcessId.generate(),
      new UserId('U-DEPARTING'),
      new UserId('U-INITIATOR'),
    );
    vi.mocked(userInfoProvider.getDisplayName).mockResolvedValue(null);
    vi.mocked(repository.create).mockResolvedValue(process);

    await service.startOffboarding('U-DEPARTING', 'U-INITIATOR');

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'U-DEPARTING' }),
      expect.objectContaining({ value: 'U-INITIATOR' }),
      undefined,
      undefined,
    );
  });
});
