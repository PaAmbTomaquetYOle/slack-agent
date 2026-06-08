# Application Services (Use Cases)

This directory contains the implementations of the application's use cases. These services act as coordinators or orchestrators that execute specific business processes.

## Characteristics

- **Orchestration:** They do not contain the core business rules themselves (which belong to the Domain layer). Instead, they fetch domain entities, trigger domain logic, and persist or communicate the results.
- **Dependency Inversion:** They interact with external resources (like databases or third-party APIs) strictly through **Outbound Ports** (interfaces).
- **Transaction Boundaries:** Often, an application service defines a single transactional or operational unit of work.

## Lifecycle and Dependency Injection

- **Dependency Injection Singletons:** All application services must behave as singletons.
- **No Classic Singletons:** Do **not** implement the classic Singleton pattern (e.g., using static `getInstance()` methods or private constructors).
- **Single Instantiation:** These services must be instantiated exactly once (calling `new` only once during the application's bootstrapping/initialization phase) and then injected into consumers (such as controllers) via Dependency Injection.

## Examples
- `CreateIncidentService`: Coordinates checking if a user exists, creating a new incident domain entity, saving it via an `IncidentRepository` port, and sending a Slack notification via a `NotificationSender` port.
