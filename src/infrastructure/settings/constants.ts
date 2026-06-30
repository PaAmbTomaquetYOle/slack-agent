import * as dotenv from 'dotenv';

dotenv.config();

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN;
const PORT = process.env.PORT ?? 3000;
const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? 'http://localhost:8000/mcp';
const CLIENT_NAME = process.env.CLIENT_NAME ?? 'slack-agent';
const CLIENT_VERSION = process.env.CLIENT_VERSION ?? '0.1.0';
const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:8001/api/v1';
const BACKEND_JWT_SECRET = process.env.BACKEND_JWT_SECRET ?? '';
const BACKEND_JWT_ISSUER = process.env.BACKEND_JWT_ISSUER ?? 'slack-agent';

export const SETTINGS = {
  SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET,
  SLACK_APP_TOKEN,
  PORT,
  MCP_SERVER_URL,
  CLIENT_NAME,
  CLIENT_VERSION,
  BACKEND_API_URL,
  BACKEND_JWT_SECRET,
  BACKEND_JWT_ISSUER
};