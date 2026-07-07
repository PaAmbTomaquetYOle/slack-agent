import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SopService } from '../sopService';
import type { IMessagingPort } from '../../ports';
import type { IDomainEventBus } from '../../events';
import { ExpertResponseDetector, SopCreationRequestedEvent } from '../../../domain';

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

    it('does not publish anything when declined', async () => {
      await service.handleChannelMessage('C-monitored', 'U1', HIGH_VALUE_TEXT, '333.2');

      await service.handleSopDecision('C-monitored', '333.2', false);

      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('does nothing for an unknown candidate', async () => {
      await expect(service.handleSopDecision('C-monitored', 'unknown-ts', true)).resolves.not.toThrow();
      expect(eventBus.publish).not.toHaveBeenCalled();
    });
  });
});
