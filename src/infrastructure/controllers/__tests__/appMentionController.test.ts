import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IExpertRecommendationService } from '../../../application/serviceInterfaces/index.js';
import { AppMentionController } from '../appMentionController.js';
import { makeAppMock, makeSayFn } from '../../../testing/slackMocks.js';

function makeExpertRecommendationServiceMock(): IExpertRecommendationService {
  return { findExperts: vi.fn().mockResolvedValue(undefined) };
}

describe('AppMentionController', () => {
  let app: ReturnType<typeof makeAppMock>['app'];
  let trigger: ReturnType<typeof makeAppMock>['trigger'];

  beforeEach(() => {
    ({ app, trigger } = makeAppMock());
  });

  it('replies with a greeting when there is no expert service configured', async () => {
    new AppMentionController().register(app);
    const say = makeSayFn();

    await trigger('event', 'app_mention', {
      event: { user: 'U1', text: '<@BOT> hello', channel: 'C1', ts: '1' },
      say,
    });

    expect(say).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('Hi') }));
  });

  it('routes "who knows about X" to the expert recommendation service', async () => {
    const service = makeExpertRecommendationServiceMock();
    new AppMentionController(service).register(app);
    const say = makeSayFn();

    await trigger('event', 'app_mention', {
      event: { user: 'U1', text: '<@BOT> who knows about kubernetes?', channel: 'C1', ts: '1' },
      say,
    });

    expect(service.findExperts).toHaveBeenCalledWith('C1', 'U1', 'kubernetes');
    expect(say).not.toHaveBeenCalled();
  });

  it('routes "experto en X" (Spanish) to the expert recommendation service', async () => {
    const service = makeExpertRecommendationServiceMock();
    new AppMentionController(service).register(app);
    const say = makeSayFn();

    await trigger('event', 'app_mention', {
      event: { user: 'U1', text: '<@BOT> experto en despliegues', channel: 'C1', ts: '1' },
      say,
    });

    expect(service.findExperts).toHaveBeenCalledWith('C1', 'U1', 'despliegues');
  });

  it('falls back to the greeting when the text does not match an expert pattern', async () => {
    const service = makeExpertRecommendationServiceMock();
    new AppMentionController(service).register(app);
    const say = makeSayFn();

    await trigger('event', 'app_mention', {
      event: { user: 'U1', text: '<@BOT> hello there', channel: 'C1', ts: '1' },
      say,
    });

    expect(service.findExperts).not.toHaveBeenCalled();
    expect(say).toHaveBeenCalled();
  });
});
