import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { IMcpClient } from '../../application/ports/index.js';
import { SETTINGS } from '../settings/index.js';
import type {
  McpTool,
  McpToolResult,
  McpPrompt,
  McpPromptResult,
  McpResource,
  McpResourceContent,
  McpResourceTemplate,
} from '../../domain/index.js';

export class McpClient implements IMcpClient {
  readonly #url: URL;
  #connected: boolean = false;
  #client: Client | null = null;

  constructor(serverUrl?: string) {
    this.#url = new URL(serverUrl ?? SETTINGS.MCP_SERVER_URL);
  }

  async connect(): Promise<void> {
    try {
      const client = new Client(
        { name: SETTINGS.CLIENT_NAME, version: SETTINGS.CLIENT_VERSION },
        { capabilities: {} },
      );
      const transport = new StreamableHTTPClientTransport(this.#url);
      transport.onclose = () => {
        this.#connected = false;
      };
      
      const safeTransport = transport as unknown as Parameters<
        typeof client.connect
      >[0];
      await client.connect(safeTransport);
      this.#client = client;
      this.#connected = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to connect to MCP server at ${this.#url.toString()}: ${message}`,
      );
    }
  }

  isConnected(): boolean {
    return this.#connected;
  }

  async listTools(): Promise<McpTool[]> {
    if (this.#client === null || !this.#connected) {
      throw new Error('MCP client is not connected. Call connect() first.');
    }
    const { tools } = await this.#client.listTools();
    return tools.map((tool): McpTool => ({
      name: tool.name,
      inputSchema: tool.inputSchema as Record<string, unknown>,
      ...(tool.description !== undefined ? { description: tool.description } : {}),
    }));
  }

  async callTool(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<McpToolResult> {
    if (this.#client === null || !this.#connected) {
      throw new Error('MCP client is not connected. Call connect() first.');
    }
    const result = await this.#client.callTool({ name, arguments: args ?? {} });
    return {
      content: result.content as McpToolResult['content'],
      ...(result.isError !== undefined ? { isError: result.isError as boolean } : {}),
    };
  }

  async listPrompts(): Promise<McpPrompt[]> {
    if (this.#client === null || !this.#connected) {
      throw new Error('MCP client is not connected. Call connect() first.');
    }
    const { prompts } = await this.#client.listPrompts();
    return prompts.map((p): McpPrompt => ({
      name: p.name,
      ...(p.description !== undefined ? { description: p.description } : {}),
      ...(p.arguments !== undefined
        ? {
            arguments: p.arguments.map((a) => ({
              name: a.name,
              ...(a.description !== undefined ? { description: a.description } : {}),
              ...(a.required !== undefined ? { required: a.required } : {}),
            })),
          }
        : {}),
    }));
  }

  async getPrompt(name: string, args?: Record<string, string>): Promise<McpPromptResult> {
    if (this.#client === null || !this.#connected) {
      throw new Error('MCP client is not connected. Call connect() first.');
    }
    const result = await this.#client.getPrompt({
      name,
      ...(args !== undefined ? { arguments: args } : {}),
    });
    return {
      messages: result.messages.map((m) => ({
        role: m.role,
        content: m.content as McpPromptResult['messages'][number]['content'],
      })),
      ...(result.description !== undefined ? { description: result.description } : {}),
    };
  }

  async listResources(): Promise<McpResource[]> {
    if (this.#client === null || !this.#connected) {
      throw new Error('MCP client is not connected. Call connect() first.');
    }
    const { resources } = await this.#client.listResources();
    return resources.map((r): McpResource => ({
      uri: r.uri,
      name: r.name,
      ...(r.description !== undefined ? { description: r.description } : {}),
      ...(r.mimeType !== undefined ? { mimeType: r.mimeType } : {}),
    }));
  }

  async listResourceTemplates(): Promise<McpResourceTemplate[]> {
    if (this.#client === null || !this.#connected) {
      throw new Error('MCP client is not connected. Call connect() first.');
    }
    const { resourceTemplates } = await this.#client.listResourceTemplates();
    return resourceTemplates.map((t): McpResourceTemplate => ({
      uriTemplate: t.uriTemplate,
      name: t.name,
      ...(t.description !== undefined ? { description: t.description } : {}),
      ...(t.mimeType !== undefined ? { mimeType: t.mimeType } : {}),
    }));
  }

  async readResource(uri: string): Promise<McpResourceContent[]> {
    if (this.#client === null || !this.#connected) {
      throw new Error('MCP client is not connected. Call connect() first.');
    }
    const { contents } = await this.#client.readResource({ uri });
    return contents as McpResourceContent[];
  }

  async close(): Promise<void> {
    if (this.#client !== null) {
      try {
        await this.#client.close();
      } catch {
        // connection may already be terminated - ignore
      }
      this.#connected = false;
      this.#client = null;
    }
  }
}
