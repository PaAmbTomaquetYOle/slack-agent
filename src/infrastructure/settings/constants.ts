import * as dotenv from 'dotenv';

dotenv.config();

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN;
const SLACK_AGENT_DRY_RUN = process.env.SLACK_AGENT_DRY_RUN === 'true';
const PORT = process.env.PORT ?? 3000;
const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? 'http://localhost:8000/mcp';
const CLIENT_NAME = process.env.CLIENT_NAME ?? 'slack-agent';
const CLIENT_VERSION = process.env.CLIENT_VERSION ?? '0.1.0';
const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:8888/api/v1';
// BE-7: slack-agent no longer self-signs its JWT; it requests one from the backend's
// client-credentials token endpoint and caches/refreshes it (see BackendTokenProvider).
const BACKEND_CLIENT_ID = process.env.BACKEND_CLIENT_ID ?? '';
const BACKEND_CLIENT_SECRET = process.env.BACKEND_CLIENT_SECRET ?? '';
// Empty KAFKA_BROKERS disables Kafka entirely: publisher falls back to a
// no-op and no consumer is started, so the Slack bot works without it.
const KAFKA_BROKERS = process.env.KAFKA_BROKERS ?? '';
const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID ?? 'slack-agent';
const KAFKA_OUTBOUND_TOPIC_PREFIX = process.env.KAFKA_OUTBOUND_TOPIC_PREFIX ?? 'slack-agent';
const KAFKA_INBOUND_TOPIC_PREFIX = process.env.KAFKA_INBOUND_TOPIC_PREFIX ?? 'offboarding';
const KAFKA_CONSUMER_GROUP_ID = process.env.KAFKA_CONSUMER_GROUP_ID ?? 'slack-agent-consumer';
const KAFKA_DLQ_TOPIC = process.env.KAFKA_DLQ_TOPIC ?? 'slack-agent.dlq';
// Empty username/password uses the plaintext Compose broker; providing both enables SASL_SSL/SCRAM-SHA-512.
const KAFKA_SASL_MECHANISM = process.env.KAFKA_SASL_MECHANISM ?? 'scram-sha-512';
const KAFKA_SASL_USERNAME = process.env.KAFKA_SASL_USERNAME ?? '';
const KAFKA_SASL_PASSWORD = process.env.KAFKA_SASL_PASSWORD ?? '';
// Path to a PEM-encoded CA certificate; empty means trust the system's default CA store.
const KAFKA_SSL_CA = process.env.KAFKA_SSL_CA ?? '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
// Comma-separated channel IDs to monitor for high-value expert answers (SA-7).
const SOP_MONITORED_CHANNELS = process.env.SOP_MONITORED_CHANNELS ?? '';
const SOP_MIN_MESSAGE_LENGTH = Number(process.env.SOP_MIN_MESSAGE_LENGTH ?? '200');
const SOP_KEYWORDS = process.env.SOP_KEYWORDS
  ?? 'deploy,pipeline,credentials,migration,workaround,config,rollback,incident';
const SOP_MIN_REACTIONS = Number(process.env.SOP_MIN_REACTIONS ?? '3');
// Empty channel id disables Slack publication of the handover dossier (SA-4);
// generation and the Kafka round-trip still happen either way.
const DOSSIER_MANAGERS_CHANNEL_ID = process.env.DOSSIER_MANAGERS_CHANNEL_ID ?? '';
// Comma-separated channel IDs to watch for questions and suggest related
// SOPs/answers for (SA-8). Defaults to the same channels as SOP capture.
const QUESTION_SUGGESTION_MONITORED_CHANNELS = process.env.QUESTION_SUGGESTION_MONITORED_CHANNELS
  ?? SOP_MONITORED_CHANNELS;
const QUESTION_MIN_MESSAGE_LENGTH = Number(process.env.QUESTION_MIN_MESSAGE_LENGTH ?? '15');
const QUESTION_MAX_SUGGESTIONS = Number(process.env.QUESTION_MAX_SUGGESTIONS ?? '3');
// SA-10: how long the orchestrator waits for the departing user to respond (pre-interview or
// mid-interview) before nudging, and then before giving up and notifying the manager.
const INTERVIEW_NUDGE_TIMEOUT_MS = Number(process.env.INTERVIEW_NUDGE_TIMEOUT_MS ?? String(24 * 60 * 60 * 1000));
const INTERVIEW_ABANDON_TIMEOUT_MS = Number(process.env.INTERVIEW_ABANDON_TIMEOUT_MS ?? String(72 * 60 * 60 * 1000));
// SA-9: max experts returned by /find-expert and the "who knows about X?" app mention pattern.
const EXPERT_MAX_RESULTS = Number(process.env.EXPERT_MAX_RESULTS ?? '3');
// SA-9: externally reachable base URL for the knowledge graph visualization page, shared via
// the /knowledge-graph slash command. Defaults to the local Socket Mode HTTP server address.
const KNOWLEDGE_GRAPH_BASE_URL = process.env.KNOWLEDGE_GRAPH_BASE_URL ?? `http://localhost:${PORT}`;

export const SETTINGS = {
  SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET,
  SLACK_APP_TOKEN,
  SLACK_AGENT_DRY_RUN,
  PORT,
  MCP_SERVER_URL,
  CLIENT_NAME,
  CLIENT_VERSION,
  BACKEND_API_URL,
  BACKEND_CLIENT_ID,
  BACKEND_CLIENT_SECRET,
  KAFKA_BROKERS,
  KAFKA_CLIENT_ID,
  KAFKA_OUTBOUND_TOPIC_PREFIX,
  KAFKA_INBOUND_TOPIC_PREFIX,
  KAFKA_CONSUMER_GROUP_ID,
  KAFKA_DLQ_TOPIC,
  KAFKA_SASL_MECHANISM,
  KAFKA_SASL_USERNAME,
  KAFKA_SASL_PASSWORD,
  KAFKA_SSL_CA,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  SOP_MONITORED_CHANNELS,
  SOP_MIN_MESSAGE_LENGTH,
  SOP_KEYWORDS,
  SOP_MIN_REACTIONS,
  DOSSIER_MANAGERS_CHANNEL_ID,
  QUESTION_SUGGESTION_MONITORED_CHANNELS,
  QUESTION_MIN_MESSAGE_LENGTH,
  QUESTION_MAX_SUGGESTIONS,
  INTERVIEW_NUDGE_TIMEOUT_MS,
  INTERVIEW_ABANDON_TIMEOUT_MS,
  EXPERT_MAX_RESULTS,
  KNOWLEDGE_GRAPH_BASE_URL,
};
