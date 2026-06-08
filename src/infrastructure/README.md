# Infrastructure Layer

This directory contains all the **Adapters** that connect our core application to the external world. It is the outermost layer in the Hexagonal Architecture.

## Rules
- **Depends on Application & Domain:** This layer implements the Ports defined in the `application` layer and interacts with the `domain`.
- **Messy stuff goes here:** This is the ONLY place where you should import external SDKs, database drivers, or web frameworks.

## Subdirectories

- **[adapters/](./adapters/README.md)**: Concrete implementations of outbound ports, wrapping external libraries, SDKs, and APIs (e.g., Jira API client, LLM wrapper).
- **[controllers/](./controllers/README.md)**: Primary adapters that listen for and handle Slack events, interactions, and commands using `@slack/bolt`.
- **[repositories/](./repositories/README.md)**: Database adapters that implement application repository interfaces using concrete ORMs or storage mechanisms.
- **[settings/](./settings/README.md)**: Handles environmental configuration, initialization logic, and framework setup.