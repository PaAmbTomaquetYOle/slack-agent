# Application Services (Use Cases)

This directory contains the implementations of the application's use cases. These services act as coordinators or orchestrators that execute specific business processes.

## Characteristics

- **Orchestration:** They do not contain the core business rules themselves (which belong to the Domain layer). Instead, they fetch domain entities, trigger domain logic, and persist or communicate the results.
- **Dependency Inversion:** They interact with external resources (like databases or third-party APIs) strictly through **Outbound Ports** (interfaces).
- **Transaction Boundaries:** Often, an application service defines a single transactional or operational unit of work.

## Examples
- `CreateIncidentService`: Coordinates checking if a user exists, creating a new incident domain entity, saving it via an `IncidentRepository` port, and sending a Slack notification via a `NotificationSender` port.
