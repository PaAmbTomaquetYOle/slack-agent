export interface McpPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: McpPromptArgument[];
}

export type McpPromptRole = 'user' | 'assistant';

export type McpPromptContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'audio'; data: string; mimeType: string }
  | { type: 'resource'; resource: { uri: string; mimeType?: string; text?: string; blob?: string } };

export interface McpPromptMessage {
  role: McpPromptRole;
  content: McpPromptContent;
}

export interface McpPromptResult {
  messages: McpPromptMessage[];
  description?: string;
}
