# Application Service Interfaces

This directory contains the interfaces that application services must implement. They define the contracts that the application layer exposes so the infrastructure layer can depend on abstractions, not on concrete implementations.

## Characteristics

- **Abstractions First:** These interfaces describe what a service does, not how it does it.
- **Dependency Inversion:** Infrastructure components should depend on these interfaces instead of depending directly on concrete service classes.
- **Implementation Contract:** Each service in `src/application/services` should implement one of these interfaces.

## Examples
- `CreateIncidentServiceInterface`: Defines the contract for creating an incident from the application layer.
- `SendNotificationServiceInterface`: Defines the contract for sending notifications through an application service.
