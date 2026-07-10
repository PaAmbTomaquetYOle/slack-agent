import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IExpertRecommendationService } from '../../../application/serviceInterfaces';
import { ExpertRecommendationController } from '../expertRecommendationController';
import { makeAppMock, makeAckFn, makeWebClientMock, type WebClientMock } from '../../../testing/slackMocks';

function makeExpertRecommendationServiceMock(): IExpertRecommendationService {
  return { findExperts: vi.fn().mockResolvedValue(undefined) };
}

describe('ExpertRecommendationController', () => {
  let service: IExpertRecommendationService;
  let app: ReturnType<typeof makeAppMock>['app'];
  let trigger: ReturnType<typeof makeAppMock>['trigger'];
  let client: WebClientMock;

  beforeEach(() => {
    service = makeExpertRecommendationServiceMock();
    ({ app, trigger } = makeAppMock());
    client = makeWebClientMock();
    new ExpertRecommendationController(service, 'http://localhost:3000/knowledge-graph').register(app);
  });

  it('/find-expert with a topic calls the service', async () => {
    const ack = makeAckFn();
    await trigger('command', '/find-expert', {
      ack,
      client,
      command: { text: 'kubernetes', channel_id: 'C1', user_id: 'U1' },
    });

    expect(ack).toHaveBeenCalled();
    expect(service.findExperts).toHaveBeenCalledWith('C1', 'U1', 'kubernetes');
  });

  it('/find-expert with no topic sends a usage hint instead of calling the service', async () => {
    const ack = makeAckFn();
    await trigger('command', '/find-expert', {
      ack,
      client,
      command: { text: '', channel_id: 'C1', user_id: 'U1' },
    });

    expect(service.findExperts).not.toHaveBeenCalled();
    expect(client.chat.postEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'C1', user: 'U1', text: expect.stringContaining('Usage') }),
    );
  });

  it('/knowledge-graph replies with the visualization URL', async () => {
    const ack = makeAckFn();
    await trigger('command', '/knowledge-graph', {
      ack,
      client,
      command: { text: '', channel_id: 'C1', user_id: 'U1' },
    });

    expect(client.chat.postEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C1',
        user: 'U1',
        text: expect.stringContaining('http://localhost:3000/knowledge-graph'),
      }),
    );
  });
});
