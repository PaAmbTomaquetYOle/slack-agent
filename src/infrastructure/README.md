# Infrastructure Layer

This directory contains all the **Adapters** that connect our core application to the external world. It is the outermost layer in the Hexagonal Architecture.

## Rules
- **Depends on Application & Domain:** This layer implements the Ports defined in the `application` layer and interacts with the `domain`.
- **Messy stuff goes here:** This is the ONLY place where you should import external SDKs, database drivers, or web frameworks.

## What belongs here?
- **Primary Adapters (Driving):** The entry points that trigger our application.
  - *Controllers:* Listeners for Slack events, commands, or interactions using `@slack/bolt`.
- **Secondary Adapters (Driven):** The tools our application uses to reach external systems.
  - *Repositories:* Concrete implementations of database logic (e.g., PostgreSQL, MongoDB).
  - *External Services:* Implementations for external APIs (e.g., JiraApiClient, SlackMessageSender).

*Note: Your `index.ts` file usually bootstraps the app by injecting these infrastructure adapters into the application services.*