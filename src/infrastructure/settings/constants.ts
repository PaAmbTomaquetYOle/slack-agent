import * as dotenv from 'dotenv';

dotenv.config();

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN;
const PORT = process.env.PORT ?? 3000;
const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? 'http://localhost:8000/mcp';
const CLIENT_NAME = process.env.CLIENT_NAME ?? 'slack-agent';
const CLIENT_VERSION = process.env.CLIENT_VERSION ?? '0.1.0';

export const SETTINGS = {
  SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET,
  SLACK_APP_TOKEN,
  PORT,
  MCP_SERVER_URL,
  CLIENT_NAME,
  CLIENT_VERSION
};