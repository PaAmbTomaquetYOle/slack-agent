import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SopService } from '../sopService';
import type { IMessagingPort } from '../../ports';
import type { IDomainEventBus } from '../../events';
import { ExpertResponseDetector, SopCreationRequestedEvent, SopCandidateDecidedEvent } from '../../../domain';

const DETECTOR_CONFIG = { minLength: 20, keywords: ['deploy'], minReactions: 3 };
const HIGH_VALUE_TEXT = 'To deploy the service, run the pipeline script in staging first.';
const LOW_VALUE_TEXT = 'sounds good';

function makeMessagingMock(): IMessagingPort {
  return {
    sendDirectMessage: vi.fn().mockResolvedValue(undefined),
    sendEphemeralActionPrompt: vi.fn().mockResolvedValue(undefined),
  };
}

function makeEventBusMock(): IDomainEventBus {
  return { subscribe: vi.fn(), publish: vi.fn().mockResolvedValue(undefined) };
}

describe('SopService', () => {
  let messaging: IMessagingPort;
  let eventBus: IDomainEventBus;
  let service: SopService;

  beforeEach(() => {
    messaging = makeMessagingMock();
    eventBus = makeEventBusMock();
    service = new SopService(
      new ExpertResponseDetector(DETECTOR_CONFIG),
      messaging,
      eventBus,
      ['C-monitored'],
    );
  });

  describe('handleChannelMessage', () => {
    it('offers to save a high-value message from a monitored channel', async () => {
      await service.handleChannelMessage('C-monitored', 'U1', HIGH_VALUE_TEXT, '111.1');

      expect(messaging.sendEphemeralActionPrompt).toHaveBeenCalledWith(
        'C-monitored',
        'U1',
        expect.stringContaining('SOP'),
        expect.arrayContaining([
          expect.objectContaining({ value: '111.1' }),
        ]),
      );
    });

    it('does nothing for a low-value message', async () => {
      await service.handleChannelMessage('C-monitored', 'U1', LOW_VALUE_TEXT, '111.2');

      expect(messaging.sendEphemeralActionPrompt).not.toHaveBeenCalled();
    });

    it('ignores messages from unmonitored channels', async () => {
      await service.handleChannelMessage('C-other', 'U1', HIGH_VALUE_TEXT, '111.3');

      expect(messaging.sendEphemeralActionPrompt).not.toHaveBeenCalled();
    });

    it('does not re-offer the same message twice', async () => {
      await service.handleChannelMessage('C-monitored', 'U1', HIGH_VALUE_TEXT, '111.4');
      await service.handleChannelMessage('C-monitored', 'U1', HIGH_VALUE_TEXT, '111.4');

      expect(messaging.sendEphemeralActionPrompt).toHaveBeenCalledTimes(1);
    });

    it('does not confuse candidates from different channels that share the same message ts', async () => {
      service = new SopService(
        new ExpertResponseDetector(DETECTOR_CONFIG),
        messaging,
        eventBus,
        ['C-monitored', 'C-other-monitored'],
      );
      await service.handleChannelMessage('C-monitored', 'U1', HIGH_VALUE_TEXT, 'shared-ts');
      await service.handleChannelMessage('C-other-monitored', 'U2', HIGH_VALUE_TEXT, 'shared-ts');

      vi.mocked(eventBus.publish).mockClear();
      await service.handleSopDecision('C-monitored', 'shared-ts', true);

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: SopCreationRequestedEvent.EVENT_NAME,
          authorId: expect.objectContaining({ value: 'U1' }),
        }),
      );
      expect(eventBus.publish).not.toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: SopCreationRequestedEvent.EVENT_NAME,
          authorId: expect.objectContaining({ value: 'U2' }),
        }),
      );

      vi.mocked(eventBus.publish).mockClear();
      await service.handleSopDecision('C-other-monitored', 'shared-ts', true);

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: SopCreationRequestedEvent.EVENT_NAME,
          authorId: expect.objectContaining({ value: 'U2' }),
        }),
      );
    });
  });

  describe('handleReactionAdded', () => {
    it('offers a previously low-value message once reactions push it over the threshold', async () => {
      await service.handleChannelMessage('C-monitored', 'U1', LOW_VALUE_TEXT, '222.1');
      expect(messaging.sendEphemeralActionPrompt).not.toHaveBeenCalled();

      await service.handleReactionAdded('C-monitored', '222.1', 3);

      expect(messaging.sendEphemeralActionPrompt).toHaveBeenCalledWith(
        'C-monitored',
        'U1',
        expect.stringContaining('SOP'),
        expect.arrayContaining([expect.objectContaining({ value: '222.1' })]),
      );
    });

    it('does nothing for an untracked message', async () => {
      await service.handleReactionAdded('C-monitored', 'unknown-ts', 5);

      expect(messaging.sendEphemeralActionPrompt).not.toHaveBeenCalled();
    });

    it('does not re-offer a message that was already offered', async () => {
      await service.handleChannelMessage('C-monitored', 'U1', HIGH_VALUE_TEXT, '222.2');
      await service.handleReactionAdded('C-monitored', '222.2', 5);

      expect(messaging.sendEphemeralActionPrompt).toHaveBeenCalledTimes(1);
    });

    it('retries offering after a failed send instead of stranding the candidate', async () => {
      vi.mocked(messaging.sendEphemeralActionPrompt).mockRejectedValueOnce(new Error('slack unavailable'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await service.handleChannelMessage('C-monitored', 'U1', HIGH_VALUE_TEXT, '222.3');
      expect(messaging.sendEphemeralActionPrompt).toHaveBeenCalledTimes(1);

      await service.handleReactionAdded('C-monitored', '222.3', 3);
      expect(messaging.sendEphemeralActionPrompt).toHaveBeenCalledTimes(2);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('handleSopDecision', () => {
    it('publishes SopCreationRequestedEvent with the candidate content when accepted', async () => {
      await service.handleChannelMessage('C-monitored', 'U1', HIGH_VALUE_TEXT, '333.1');

      await service.handleSopDecision('C-monitored', '333.1', true);

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: SopCreationRequestedEvent.EVENT_NAME,
          channelId: expect.objectContaining({ value: 'C-monitored' }),
          authorId: expect.objectContaining({ value: 'U1' }),
          messageText: HIGH_VALUE_TEXT,
          messageTs: '333.1',
        }),
      );
    });

    it('publishes SopCandidateDecidedEvent but not SopCreationRequestedEvent when declined', async () => {
      await service.handleChannelMessage('C-monitored', 'U1', HIGH_VALUE_TEXT, '333.2');
      vi.mocked(eventBus.publish).mockClear();

      await service.handleSopDecision('C-monitored', '333.2', false);

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: SopCandidateDecidedEvent.EVENT_NAME,
          messageTs: '333.2',
          accepted: false,
        }),
      );
      expect(eventBus.publish).not.toHaveBeenCalledWith(
        expect.objectContaining({ eventName: SopCreationRequestedEvent.EVENT_NAME }),
      );
    });

    it('does nothing for an unknown candidate', async () => {
      await expect(service.handleSopDecision('C-monitored', 'unknown-ts', true)).resolves.not.toThrow();
      expect(eventBus.publish).not.toHaveBeenCalled();
    });
  });

  describe('candidate cache eviction', () => {
    it('does not evict a candidate awaiting a decision even when the cache is at capacity', async () => {
      service = new SopService(
        new ExpertResponseDetector(DETECTOR_CONFIG),
        messaging,
        eventBus,
        ['C-monitored'],
        1,
      );
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await service.handleChannelMessage('C-monitored', 'U1', HIGH_VALUE_TEXT, 'keep');
      await service.handleChannelMessage('C-monitored', 'U2', LOW_VALUE_TEXT, 'other');

      await service.handleSopDecision('C-monitored', 'keep', true);

      expect(eventBus.publish).toHaveBeenCalledWith(expect.objectContaining({ messageTs: 'keep' }));

      consoleWarnSpy.mockRestore();
    });
  });

  describe('isMonitoredChannel', () => {
    it('returns true only for configured channels', () => {
      expect(service.isMonitoredChannel('C-monitored')).toBe(true);
      expect(service.isMonitoredChannel('C-other')).toBe(false);
    });
  });

  describe('rehydrate', () => {
    it('seeds the cache from the backend so a decision after a restart still resolves', async () => {
      const candidateReadRepository = {
        findPending: vi.fn().mockResolvedValue([
          { channelId: 'C-monitored', authorId: 'U1', content: 'Rotate secrets every 90 days', messageTs: 'persisted-ts' },
        ]),
      };
      service = new SopService(
        new ExpertResponseDetector(DETECTOR_CONFIG),
        messaging,
        eventBus,
        ['C-monitored'],
        undefined,
        candidateReadRepository,
      );

      await service.rehydrate();
      await service.handleSopDecision('C-monitored', 'persisted-ts', true);

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: SopCreationRequestedEvent.EVENT_NAME,
          messageTs: 'persisted-ts',
        }),
      );
    });

    it('is a no-op when no read repository was configured', async () => {
      await expect(service.rehydrate()).resolves.not.toThrow();
    });

    it('logs and swallows errors instead of blocking startup', async () => {
      const candidateReadRepository = {
        findPending: vi.fn().mockRejectedValue(new Error('backend unavailable')),
      };
      service = new SopService(
        new ExpertResponseDetector(DETECTOR_CONFIG),
        messaging,
        eventBus,
        ['C-monitored'],
        undefined,
        candidateReadRepository,
      );
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(service.rehydrate()).resolves.not.toThrow();

      errorSpy.mockRestore();
    });
  });
});
