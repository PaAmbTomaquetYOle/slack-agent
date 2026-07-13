import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  IAuthService,
  IExpertRecommendationService,
  IMcpService,
  IOffboardingService,
} from '../../../application/serviceInterfaces/index.js';
import { AppMentionController } from '../appMentionController.js';
import { makeAppMock, makeSayFn } from '../../../testing/slackMocks.js';

function makeExpertRecommendationServiceMock(): IExpertRecommendationService {
  return { findExperts: vi.fn().mockResolvedValue(undefined) };
}

function makeOffboardingServiceMock(): IOffboardingService {
  return { startOffboarding: vi.fn().mockResolvedValue(undefined) };
}

function makeMcpServiceMock(): IMcpService {
  return {
    discoverTools: vi.fn(),
    callTool: vi.fn(),
    listPrompts: vi.fn(),
    getPrompt: vi.fn(),
    listResources: vi.fn(),
    listResourceTemplates: vi.fn(),
    readResource: vi.fn(),
    jiraLoginPrompt: vi.fn(),
    trelloLoginPrompt: vi.fn(),
    extractPendingJiraTasksPrompt: vi.fn().mockResolvedValue({
      messages: [{ role: 'assistant', content: { type: 'text', text: 'Jira task summary' } }],
    }),
    extractPendingTrelloTasksPrompt: vi.fn().mockResolvedValue({
      messages: [{ role: 'assistant', content: { type: 'text', text: 'Trello card summary' } }],
    }),
  };
}

function makeAuthServiceMock(): IAuthService {
  return {
    initiateAuth: vi.fn().mockResolvedValue(undefined),
    handleAuthCodeMessage: vi.fn(),
    hasPendingAuth: vi.fn(),
    isAuthErrorMessage: vi.fn().mockReturnValue(false),
  };
}

describe('AppMentionController', () => {
  let app: ReturnType<typeof makeAppMock>['app'];
  let trigger: ReturnType<typeof makeAppMock>['trigger'];

  beforeEach(() => {
    ({ app, trigger } = makeAppMock());
  });

  it('replies with help when there is no service configured', async () => {
    new AppMentionController().register(app);
    const say = makeSayFn();

    await trigger('event', 'app_mention', {
      event: { user: 'U1', text: '<@BOT> hello', channel: 'C1', ts: '1' },
      say,
    });

    expect(say).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('start offboarding') }));
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

  it('starts offboarding when an app mention asks for an interview with a mentioned user', async () => {
    const expertService = makeExpertRecommendationServiceMock();
    const offboardingService = makeOffboardingServiceMock();
    new AppMentionController(expertService, offboardingService).register(app);
    const say = makeSayFn();

    await trigger('event', 'app_mention', {
      event: {
        user: 'UMANAGER',
        text: '<@BOT> I need to book an interview with <@UERNEST> for his offboarding',
        channel: 'C1',
        ts: '1',
      },
      say,
    });

    expect(offboardingService.startOffboarding).toHaveBeenCalledWith('UERNEST', 'UMANAGER');
    expect(expertService.findExperts).not.toHaveBeenCalled();
    expect(say).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('<@UERNEST>'),
      thread_ts: '1',
    }));
  });

  it('starts Jira auth from chat', async () => {
    const authService = makeAuthServiceMock();
    new AppMentionController(undefined, undefined, undefined, authService).register(app);
    const say = makeSayFn();

    await trigger('event', 'app_mention', {
      event: { user: 'U1', text: '<@BOT> Jira login', channel: 'C1', ts: '1' },
      say,
    });

    expect(authService.initiateAuth).toHaveBeenCalledWith('jira', 'U1', 'C1');
    expect(say).not.toHaveBeenCalled();
  });

  it('returns the knowledge graph URL from chat', async () => {
    new AppMentionController(undefined, undefined, undefined, undefined, 'https://graph.example.com').register(app);
    const say = makeSayFn();

    await trigger('event', 'app_mention', {
      event: { user: 'U1', text: '<@BOT> knowledge graph', channel: 'C1', ts: '1' },
      say,
    });

    expect(say).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('https://graph.example.com'),
    }));
  });

  it('extracts Jira tasks from chat', async () => {
    const mcpService = makeMcpServiceMock();
    new AppMentionController(undefined, undefined, mcpService).register(app);
    const say = makeSayFn();

    await trigger('event', 'app_mention', {
      event: { user: 'U1', text: '<@BOT> show Jira tasks for ernest', channel: 'C1', ts: '1' },
      say,
    });

    expect(mcpService.extractPendingJiraTasksPrompt).toHaveBeenCalledWith('ernest');
    expect(say).toHaveBeenCalledWith(expect.objectContaining({ text: 'Jira task summary' }));
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

  it('falls back to help when the text does not match a controlled intent', async () => {
    const service = makeExpertRecommendationServiceMock();
    new AppMentionController(service).register(app);
    const say = makeSayFn();

    await trigger('event', 'app_mention', {
      event: { user: 'U1', text: '<@BOT> hello there', channel: 'C1', ts: '1' },
      say,
    });

    expect(service.findExperts).not.toHaveBeenCalled();
    expect(say).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('who knows about') }));
  });
});
