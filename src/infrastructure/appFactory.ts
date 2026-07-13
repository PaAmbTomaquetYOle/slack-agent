import { readFileSync } from 'node:fs';
import { App } from '@slack/bolt';
import { Kafka } from 'kafkajs';
import type { Producer } from 'kafkajs';
import { GoogleGenAI } from '@google/genai';
import type {
  IOffboardingProcessRepository,
  IInterviewRepository,
  ITaskRepository,
  IInterviewAgent,
  IDossierRepository,
  ISopCandidateReadRepository,
  IMessagingPort,
  IUserInfoProvider,
  IEventPublisher,
  IEventConsumer,
  IMcpService,
  IOffboardingService,
  IInterviewService,
  ISopService,
  IDossierService,
  IQuestionSuggestionService,
  IAuthService,
  IOffboardingOrchestrator,
  IExpertRecommendationService,
  IKnowledgeGraphReadPort,
  IReviewInterviewAgent,
  IActiveReviewStore,
  IReviewInterviewService,
} from '../application/index.js';
import {
  McpClient,
  SlackMessagingAdapter,
  SlackUserInfoProvider,
  HttpOffboardingProcessRepository,
  HttpInterviewRepository,
  HttpTaskRepository,
  HttpDossierRepository,
  HttpSopCandidateRepository,
  HttpKnowledgeGraphAdapter,
  GeminiInterviewAgent,
  GeminiReviewInterviewAgent,
  InMemoryActiveReviewStore,
  NoOpEventPublisher,
  KafkaEventPublisher,
  KafkaDeadLetterQueue,
  KafkaEventConsumer,
  ConsoleLogger,
  InMemoryScheduler,
  InMemoryInterviewSessionStore,
} from './adapters/index.js';
import {
  McpPromptController,
  OffboardingController,
  AppMentionController,
  DirectMessageController,
  AuthActionController,
  SopController,
  QuestionSuggestionController,
  ExpertRecommendationController,
  KnowledgeGraphVisualizationController,
} from './controllers/index.js';
import { APP_OPTIONS, SETTINGS } from './settings/index.js';
import {
  McpService,
  OffboardingService,
  InterviewService,
  ReviewInterviewService,
  SopService,
  DossierService,
  QuestionSuggestionService,
  AuthService,
  OffboardingOrchestrator,
  DomainEventBus,
  createOffboardingStartedHandler,
  createKafkaOffboardingStartedForwarder,
  createKafkaOffboardingCancellationRequestedForwarder,
  createKafkaInterviewStartedForwarder,
  createKafkaInterviewCompletedForwarder,
  createKafkaInterviewTurnRecordedForwarder,
  createKafkaTasksExtractedForwarder,
  createKafkaSopCreationRequestedForwarder,
  createKafkaSopCandidateOfferedForwarder,
  createKafkaSopCandidateDecidedForwarder,
  createKafkaDossierGenerationRequestedForwarder,
  createDossierGenerationTriggerHandler,
  createKafkaReviewInterviewCompletedForwarder,
  createKafkaReviewDossierGenerationRequestedForwarder,
  createReviewDossierGenerationTriggerHandler,
  createInterviewKnowledgeGraphForwarder,
  createSopKnowledgeGraphForwarder,
  createKafkaChannelActivityRegisteredForwarder,
  ExpertRecommendationService,
  InboundEventDispatcher,
  OffboardingStateChangedHandler,
  OffboardingCompletedHandler,
  InterviewCompletedHandler,
  DossierGeneratedHandler,
  SopCreatedHandler,
  ReviewStateChangedHandler,
} from '../application/index.js';
import {
  OffboardingStartedEvent,
  OffboardingCancellationRequestedEvent,
  InterviewStartedEvent,
  InterviewCompletedEvent,
  InterviewTurnRecordedEvent,
  TasksExtractedEvent,
  SopCreationRequestedEvent,
  SopCandidateOfferedEvent,
  SopCandidateDecidedEvent,
  DossierGenerationRequestedEvent,
  ReviewInterviewCompletedEvent,
  ReviewDossierGenerationRequestedEvent,
  MONTHLY_REVIEW_STATE_CHANGED,
  ANNUAL_REVIEW_STATE_CHANGED,
  INBOUND_EVENT_TYPES,
  ExpertResponseDetector,
  QuestionDetector,
} from '../domain/index.js';
import { createBackendHttpClient } from './http/index.js';

interface EventInfrastructure {
  publisher: IEventPublisher;
  consumer: IEventConsumer | null;
}

export class AppFactory {
  private createMcpClient() {
    return new McpClient(SETTINGS.MCP_SERVER_URL);
  }

  private createMcpService(): IMcpService {
    return new McpService(this.createMcpClient());
  }

  private createInterviewAgent(mcpService: IMcpService, authService: IAuthService): IInterviewAgent {
    if (!SETTINGS.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required to run the guided offboarding interview.');
    }
    const client = new GoogleGenAI({ apiKey: SETTINGS.GEMINI_API_KEY });
    return new GeminiInterviewAgent(client, SETTINGS.GEMINI_MODEL, mcpService, authService);
  }

  // SA-20: a separate, simpler agent for monthly/annual review interviews — no MCP tool calls,
  // review-appropriate framing. See GeminiReviewInterviewAgent's docstring.
  private createReviewInterviewAgent(): IReviewInterviewAgent {
    if (!SETTINGS.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required to run the guided review interview.');
    }
    const client = new GoogleGenAI({ apiKey: SETTINGS.GEMINI_API_KEY });
    return new GeminiReviewInterviewAgent(client, SETTINGS.GEMINI_MODEL);
  }

  private createExpertResponseDetector(): ExpertResponseDetector {
    const keywords = SETTINGS.SOP_KEYWORDS.split(',').map((keyword) => keyword.trim()).filter(Boolean);
    return new ExpertResponseDetector({
      minLength: SETTINGS.SOP_MIN_MESSAGE_LENGTH,
      keywords,
      minReactions: SETTINGS.SOP_MIN_REACTIONS,
    });
  }

  private createQuestionDetector(): QuestionDetector {
    return new QuestionDetector({ minLength: SETTINGS.QUESTION_MIN_MESSAGE_LENGTH });
  }

  private async createEventInfrastructure(
    repository: IOffboardingProcessRepository,
    messagingPort: IMessagingPort,
    dossierService: IDossierService,
    orchestrator: IOffboardingOrchestrator,
    activeReviewStore: IActiveReviewStore,
  ): Promise<EventInfrastructure> {
    if (!SETTINGS.KAFKA_BROKERS) {
      console.warn('KAFKA_BROKERS not set; Kafka is disabled, events will not be published or consumed.');
      return { publisher: new NoOpEventPublisher(), consumer: null };
    }

    const kafka = new Kafka({
      clientId: SETTINGS.KAFKA_CLIENT_ID,
      brokers: SETTINGS.KAFKA_BROKERS.split(','),
      // BE-7: broker requires SASL_SSL/SCRAM-SHA-512, PLAINTEXT is no longer accepted.
      ssl: SETTINGS.KAFKA_SSL_CA ? { ca: [readFileSync(SETTINGS.KAFKA_SSL_CA, 'utf-8')] } : true,
      sasl: {
        mechanism: SETTINGS.KAFKA_SASL_MECHANISM as 'scram-sha-512',
        username: SETTINGS.KAFKA_SASL_USERNAME,
        password: SETTINGS.KAFKA_SASL_PASSWORD,
      },
    });

    let producer: Producer;
    try {
      producer = kafka.producer();
      await producer.connect();
    } catch (error) {
      console.warn('Failed to connect Kafka producer; falling back to no-op publisher.', error);
      return { publisher: new NoOpEventPublisher(), consumer: null };
    }
    const publisher: IEventPublisher = new KafkaEventPublisher(producer, SETTINGS.KAFKA_OUTBOUND_TOPIC_PREFIX);

    let consumer: IEventConsumer | null = null;
    try {
      const dlq = new KafkaDeadLetterQueue(producer, SETTINGS.KAFKA_DLQ_TOPIC);
      const dispatcher = new InboundEventDispatcher([
        new OffboardingStateChangedHandler(messagingPort),
        new InterviewCompletedHandler(messagingPort, repository),
        new DossierGeneratedHandler(messagingPort, repository, dossierService, orchestrator),
        new OffboardingCompletedHandler(messagingPort, orchestrator),
        new SopCreatedHandler(messagingPort),
        new ReviewStateChangedHandler(MONTHLY_REVIEW_STATE_CHANGED, 'monthly', activeReviewStore, messagingPort),
        new ReviewStateChangedHandler(ANNUAL_REVIEW_STATE_CHANGED, 'annual', activeReviewStore, messagingPort),
      ]);
      const topics = INBOUND_EVENT_TYPES.map((eventType) => `${SETTINGS.KAFKA_INBOUND_TOPIC_PREFIX}.${eventType}`);
      const kafkaConsumer = new KafkaEventConsumer(
        kafka.consumer({ groupId: SETTINGS.KAFKA_CONSUMER_GROUP_ID }),
        dispatcher,
        dlq,
        topics,
      );
      await kafkaConsumer.start();
      consumer = kafkaConsumer;
    } catch (error) {
      console.warn('Failed to start Kafka consumer; inbound events will not be processed.', error);
    }

    return { publisher, consumer };
  }

  async create(): Promise<{
    app: App;
    eventConsumer: IEventConsumer | null;
    orchestrator: IOffboardingOrchestrator;
    sopService: ISopService;
  }> {
    // MCP wiring (existing)
    const mcpService = this.createMcpService();

    // HTTP client (shared) — created before the App so its custom routes (SA-9 knowledge
    // graph visualization) can be registered on the Socket Mode receiver at construction time.
    const httpClient = createBackendHttpClient();
    const knowledgeGraphReadPort: IKnowledgeGraphReadPort = new HttpKnowledgeGraphAdapter(httpClient);
    const knowledgeGraphVisualizationController = new KnowledgeGraphVisualizationController(knowledgeGraphReadPort);
    const healthRoute = {
      path: '/health',
      method: 'GET' as const,
      handler: (_req: unknown, res: {
        writeHead: (statusCode: number, headers: Record<string, string>) => void;
        end: (payload: string) => void;
      }): void => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'ok' }));
      },
    };

    const app = new App({
      ...APP_OPTIONS,
      customRoutes: [healthRoute, ...knowledgeGraphVisualizationController.customRoutes],
    });

    // Offboarding wiring
    const repository: IOffboardingProcessRepository = new HttpOffboardingProcessRepository(httpClient);
    const interviewRepository: IInterviewRepository = new HttpInterviewRepository(httpClient);
    const taskRepository: ITaskRepository = new HttpTaskRepository(httpClient);
    const dossierRepository: IDossierRepository = new HttpDossierRepository(httpClient);
    const messagingPort: IMessagingPort = new SlackMessagingAdapter(app.client);
    const userInfoProvider: IUserInfoProvider = new SlackUserInfoProvider(app.client);

    // Jira/Trello OAuth wiring (SA-12)
    const authService: IAuthService = new AuthService(mcpService, messagingPort);
    new McpPromptController(mcpService, authService).register(app);
    new AuthActionController().register(app);

    const eventBus = new DomainEventBus();
    const dossierService: IDossierService = new DossierService(
      repository,
      dossierRepository,
      userInfoProvider,
      messagingPort,
      eventBus,
      SETTINGS.DOSSIER_MANAGERS_CHANNEL_ID,
    );

    // Guided interview wiring (BE-7: turns live in memory now — the backend's interview REST
    // endpoints are read-only, so InterviewService no longer depends on the HTTP repository).
    const interviewAgent = this.createInterviewAgent(mcpService, authService);
    const interviewService: IInterviewService = new InterviewService(
      repository,
      new InMemoryInterviewSessionStore(),
      interviewRepository,
      interviewAgent,
      userInfoProvider,
      messagingPort,
      eventBus,
    );

    // Orchestration (SA-10): coordinates the flow via the event bus, tracks process state
    // in-memory, and nudges/abandons interviews the departing user goes silent on.
    const orchestrator: IOffboardingOrchestrator = new OffboardingOrchestrator(
      eventBus,
      repository,
      interviewRepository,
      taskRepository,
      interviewService,
      messagingPort,
      new InMemoryScheduler(),
      new ConsoleLogger(),
      authService,
      SETTINGS.INTERVIEW_NUDGE_TIMEOUT_MS,
      SETTINGS.INTERVIEW_ABANDON_TIMEOUT_MS,
    );

    // Review interview wiring (SA-20): parallel to offboarding's, not generalized from it — the
    // orchestration logic is genuinely different (backend-scheduler-triggered, no nudge/abandon,
    // no Jira/Trello task extraction) and there is no HTTP read model to key an active-process
    // lookup off, so it needs its own in-memory tracker (IActiveReviewStore) instead of
    // IOffboardingProcessRepository.
    const activeReviewStore: IActiveReviewStore = new InMemoryActiveReviewStore();
    const reviewInterviewAgent = this.createReviewInterviewAgent();
    const reviewInterviewService: IReviewInterviewService = new ReviewInterviewService(
      activeReviewStore,
      new InMemoryInterviewSessionStore(),
      reviewInterviewAgent,
      userInfoProvider,
      messagingPort,
      eventBus,
    );

    const { publisher, consumer: eventConsumer } = await this.createEventInfrastructure(
      repository,
      messagingPort,
      dossierService,
      orchestrator,
      activeReviewStore,
    );

    eventBus.subscribe(OffboardingStartedEvent.EVENT_NAME, createOffboardingStartedHandler(messagingPort));
    eventBus.subscribe(OffboardingStartedEvent.EVENT_NAME, createKafkaOffboardingStartedForwarder(publisher));
    eventBus.subscribe(
      OffboardingCancellationRequestedEvent.EVENT_NAME,
      createKafkaOffboardingCancellationRequestedForwarder(publisher),
    );
    eventBus.subscribe(InterviewStartedEvent.EVENT_NAME, createKafkaInterviewStartedForwarder(publisher));
    eventBus.subscribe(InterviewCompletedEvent.EVENT_NAME, createKafkaInterviewCompletedForwarder(publisher));
    eventBus.subscribe(
      InterviewTurnRecordedEvent.EVENT_NAME,
      createKafkaInterviewTurnRecordedForwarder(publisher),
    );
    eventBus.subscribe(
      TasksExtractedEvent.EVENT_NAME,
      createKafkaTasksExtractedForwarder(publisher),
    );
    eventBus.subscribe(InterviewCompletedEvent.EVENT_NAME, createDossierGenerationTriggerHandler(dossierService));
    eventBus.subscribe(
      DossierGenerationRequestedEvent.EVENT_NAME,
      createKafkaDossierGenerationRequestedForwarder(publisher),
    );
    eventBus.subscribe(SopCreationRequestedEvent.EVENT_NAME, createKafkaSopCreationRequestedForwarder(publisher));
    eventBus.subscribe(
      SopCandidateOfferedEvent.EVENT_NAME,
      createKafkaSopCandidateOfferedForwarder(publisher),
    );
    eventBus.subscribe(
      SopCandidateDecidedEvent.EVENT_NAME,
      createKafkaSopCandidateDecidedForwarder(publisher),
    );

    // SA-20: monthly/annual review interview completion -> dossier generation, mirroring the
    // offboarding InterviewCompleted -> DossierGenerationRequested chain above.
    eventBus.subscribe(
      ReviewInterviewCompletedEvent.EVENT_NAME,
      createKafkaReviewInterviewCompletedForwarder(publisher),
    );
    eventBus.subscribe(
      ReviewInterviewCompletedEvent.EVENT_NAME,
      createReviewDossierGenerationTriggerHandler(eventBus),
    );
    eventBus.subscribe(
      ReviewDossierGenerationRequestedEvent.EVENT_NAME,
      createKafkaReviewDossierGenerationRequestedForwarder(publisher),
    );

    // Knowledge graph population (SA-9): feed the graph from completed interviews and
    // accepted SOP answers so /find-expert has data to recommend from.
    eventBus.subscribe(
      InterviewCompletedEvent.EVENT_NAME,
      createInterviewKnowledgeGraphForwarder(publisher, repository, userInfoProvider),
    );
    eventBus.subscribe(
      SopCreationRequestedEvent.EVENT_NAME,
      createSopKnowledgeGraphForwarder(publisher, userInfoProvider),
    );
    eventBus.subscribe(
      SopCreationRequestedEvent.EVENT_NAME,
      createKafkaChannelActivityRegisteredForwarder(publisher, userInfoProvider),
    );

    const offboardingService: IOffboardingService = new OffboardingService(eventBus, userInfoProvider);
    new OffboardingController(offboardingService).register(app);

    // Expert recommendation wiring (SA-9): /find-expert, /knowledge-graph, and the
    // "who knows about X?" app mention pattern all resolve through the same service.
    const expertRecommendationService: IExpertRecommendationService = new ExpertRecommendationService(
      mcpService,
      messagingPort,
      SETTINGS.EXPERT_MAX_RESULTS,
    );
    new ExpertRecommendationController(
      expertRecommendationService,
      `${SETTINGS.KNOWLEDGE_GRAPH_BASE_URL}/knowledge-graph`,
    ).register(app);
    new AppMentionController(
      expertRecommendationService,
      offboardingService,
      mcpService,
      authService,
      `${SETTINGS.KNOWLEDGE_GRAPH_BASE_URL}/knowledge-graph`,
    ).register(app);

    new DirectMessageController(authService, orchestrator, reviewInterviewService).register(app);

    // SOP detection wiring
    const monitoredChannelIds = SETTINGS.SOP_MONITORED_CHANNELS.split(',').map((id) => id.trim()).filter(Boolean);
    const sopCandidateReadRepository: ISopCandidateReadRepository = new HttpSopCandidateRepository(httpClient);
    const sopService: ISopService = new SopService(
      this.createExpertResponseDetector(),
      messagingPort,
      eventBus,
      monitoredChannelIds,
      undefined,
      sopCandidateReadRepository,
    );
    new SopController(sopService).register(app);

    // Question -> related SOP suggestion wiring (SA-8)
    const questionMonitoredChannelIds = SETTINGS.QUESTION_SUGGESTION_MONITORED_CHANNELS
      .split(',').map((id) => id.trim()).filter(Boolean);
    const questionSuggestionService: IQuestionSuggestionService = new QuestionSuggestionService(
      this.createQuestionDetector(),
      mcpService,
      messagingPort,
      questionMonitoredChannelIds,
      SETTINGS.QUESTION_MAX_SUGGESTIONS,
    );
    new QuestionSuggestionController(questionSuggestionService).register(app);

    return { app, eventConsumer, orchestrator, sopService };
  }
}
