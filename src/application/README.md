# Application Layer

This directory acts as the orchestrator of the application. It contains the **Use Cases** (or Application Services) and the **Ports** (Interfaces) that define how the outside world communicates with the domain and vice versa.

## Rules
- **Depends only on Domain:** This layer can import from `domain/`, but it **must never** import from `infrastructure/`.
- **Framework-agnostic:** Like the Domain, keep this layer free from Slack-specific logic or database implementations.

## What belongs here?
- **Use Cases / Services:** Classes or functions that orchestrate a specific business feature (e.g., `CreateIncidentUseCase`, `RegisterUserUseCase`). They fetch data, call domain logic, and save results.
- **Ports (Interfaces):**
  - *Inbound Ports:* Interfaces defining how external controllers can interact with our use cases.
  - *Outbound Ports:* Interfaces defining what our use cases need from the outside world (e.g., `IncidentRepository` or `MessageSenderPort`).