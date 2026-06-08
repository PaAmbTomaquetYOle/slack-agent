# Source Directory (`src`)

This directory contains the entire source code of the Slack Agent, organized using **Hexagonal Architecture** (also known as Ports and Adapters). The main goal of this architecture is to separate the core business logic from external technologies, frameworks, and databases.

## Architecture Layers

The code is divided into three main layers, ordered from the core outward:

1. **[Domain](./domain/README.md)**: Contains the core business logic (entities, value objects, domain errors) and is completely isolated from external frameworks or libraries.
2. **[Application](./application/README.md)**: Orchestrates business use cases and defines interfaces (Ports) for inputs and outputs.
3. **[Infrastructure](./infrastructure/README.md)**: Houses the physical implementations (Adapters) of the ports, such as database repositories, Slack event controllers, and external API clients.

## Directory Structure

```text
src/
├── domain/            # Core business models and logic (isolated)
├── application/       # Use cases and port interfaces (orchestration)
│   ├── ports/         # Input (driving) and output (driven) interfaces
│   └── services/      # Application services / Use Cases
├── infrastructure/    # External delivery, tools, and configurations (adapters)
│   ├── adapters/      # Implementations of outbound ports (APIs, tools)
│   ├── controllers/   # Primary adapters handling Slack events and commands
│   ├── repositories/  # Database and persistence implementations
│   └── settings/      # Configuration, env vars, and setup utilities
└── index.ts           # Bootstrapper / Entry point of the application
```
