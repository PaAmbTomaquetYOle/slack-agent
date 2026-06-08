# Infrastructure Adapters (Secondary Adapters)

This directory contains the implementations of the application's outbound ports (driven interfaces). They act as bridges between our application logic and external services.

## Purpose

- **Isolation:** By wrapping external SDKs, HTTP clients, and APIs in adapters, we prevent third-party library details from leaking into the core application.
- **Tech Stack Flexibility:** If we switch from one service provider (e.g., OpenAI) to another (e.g., Anthropic), we only need to implement a new adapter here.

## Examples
- `JiraAdapter`: Implements a port interface to create issues in Jira.
- `SlackNotifierAdapter`: Implements a port interface to send messages to Slack channels.
- `LlmAdapter`: Implements an AI interface to query LLMs.
