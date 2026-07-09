import { readFileSync } from 'node:fs';
import { App } from '@slack/bolt';
import { Kafka } from 'kafkajs';
import type { Producer } from 'kafkajs';
import { GoogleGenAI } from '@google/genai';
import type {
  IOffboardingProcessRepository,
  IInterviewRepository,
  IInterviewAgent,
  IDossierRepository,
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
} from '../application';
import {
  McpClient,
  SlackMessagingAdapter,
  SlackUserInfoProvider,
  HttpOffboardingProcessRepository,
  HttpInterviewRepository,
  HttpDossierRepository,
  GeminiInterviewAgent,
  NoOpEventPublisher,
  KafkaEventPublisher,
  KafkaDeadLetterQueue,
  KafkaEventConsumer,
  ConsoleLogger,
  InMemoryScheduler,
  InMemoryInterviewSessionStore,
} from './adapters';
import {
  McpPromptController,
  OffboardingController,
  AppMentionController,
  DirectMessageController,
  AuthActionController,
  SopController,
  QuestionSuggestionController,
} from './controllers';
import { APP_OPTIONS, SETTINGS } from './settings';
import {
  McpService,
  OffboardingService,
  InterviewService,
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
  createKafkaSopCreationRequestedForwarder,
  createKafkaDossierGenerationRequestedForwarder,
  createDossierGenerationTriggerHandler,
  InboundEventDispatcher,
  OffboardingStateChangedHandler,
  OffboardingCompletedHandler,
  InterviewCompletedHandler,
  DossierGeneratedHandler,
  SopCreatedHandler,
} from '../application';
import {
  OffboardingStartedEvent,
  OffboardingCancellationRequestedEvent,
  InterviewStartedEvent,
  InterviewCompletedEvent,
  SopCreationRequestedEvent,
  DossierGenerationRequestedEvent,
  INBOUND_EVENT_TYPES,
  ExpertResponseDetector,
  QuestionDetector,
} from '../domain';
import { createBackendHttpClient } from './http';

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

  async create(): Promise<{ app: App; eventConsumer: IEventConsumer | null; orchestrator: IOffboardingOrchestrator }> {
    const app = new App(APP_OPTIONS);

    // MCP wiring (existing)
    const mcpService = this.createMcpService();

    // HTTP client (shared)
    const httpClient = createBackendHttpClient();

    // Offboarding wiring
    const repository: IOffboardingProcessRepository = new HttpOffboardingProcessRepository(httpClient);
    const interviewRepository: IInterviewRepository = new HttpInterviewRepository(httpClient);
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
      interviewService,
      messagingPort,
      new InMemoryScheduler(),
      new ConsoleLogger(),
      authService,
      SETTINGS.INTERVIEW_NUDGE_TIMEOUT_MS,
      SETTINGS.INTERVIEW_ABANDON_TIMEOUT_MS,
    );

    const { publisher, consumer: eventConsumer } = await this.createEventInfrastructure(
      repository,
      messagingPort,
      dossierService,
      orchestrator,
    );

    eventBus.subscribe(OffboardingStartedEvent.EVENT_NAME, createOffboardingStartedHandler(messagingPort));
    eventBus.subscribe(OffboardingStartedEvent.EVENT_NAME, createKafkaOffboardingStartedForwarder(publisher));
    eventBus.subscribe(
      OffboardingCancellationRequestedEvent.EVENT_NAME,
      createKafkaOffboardingCancellationRequestedForwarder(publisher),
    );
    eventBus.subscribe(InterviewStartedEvent.EVENT_NAME, createKafkaInterviewStartedForwarder(publisher));
    eventBus.subscribe(InterviewCompletedEvent.EVENT_NAME, createKafkaInterviewCompletedForwarder(publisher));
    eventBus.subscribe(InterviewCompletedEvent.EVENT_NAME, createDossierGenerationTriggerHandler(dossierService));
    eventBus.subscribe(
      DossierGenerationRequestedEvent.EVENT_NAME,
      createKafkaDossierGenerationRequestedForwarder(publisher),
    );
    eventBus.subscribe(SopCreationRequestedEvent.EVENT_NAME, createKafkaSopCreationRequestedForwarder(publisher));
    const offboardingService: IOffboardingService = new OffboardingService(eventBus, userInfoProvider);
    new OffboardingController(offboardingService).register(app);
    new AppMentionController().register(app);

    new DirectMessageController(authService, orchestrator).register(app);

    // SOP detection wiring
    const monitoredChannelIds = SETTINGS.SOP_MONITORED_CHANNELS.split(',').map((id) => id.trim()).filter(Boolean);
    const sopService: ISopService = new SopService(
      this.createExpertResponseDetector(),
      messagingPort,
      eventBus,
      monitoredChannelIds,
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

    return { app, eventConsumer, orchestrator };
  }
}
