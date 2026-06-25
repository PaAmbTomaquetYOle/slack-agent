import * as dotenv from 'dotenv';

dotenv.config();

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN;
const PORT = process.env.PORT ?? 3000;
const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? 'http://localhost:8000/mcp';

export const SETTINGS = {
  SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET,
  SLACK_APP_TOKEN,
  PORT,
  MCP_SERVER_URL,
};