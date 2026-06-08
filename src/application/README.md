# Application Layer

This directory acts as the orchestrator of the application. It contains the **Use Cases** (or Application Services) and the **Ports** (Interfaces) that define how the outside world communicates with the domain and vice versa.

## Rules
- **Depends only on Domain:** This layer can import from `domain/`, but it **must never** import from `infrastructure/`.
- **Framework-agnostic:** Like the Domain, keep this layer free from Slack-specific logic or database implementations.

## Subdirectories

- **[ports/](./ports/README.md)**: Defines boundary interfaces (both inbound/driving and outbound/driven) that isolate our core logic from the outside world.
- **[services/](./services/README.md)**: Implements application use cases and orchestrates the flow of data using domain entities and ports.