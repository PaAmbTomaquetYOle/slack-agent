# Application Ports

Ports are boundary interfaces that define the inputs and outputs of the application layer. They ensure that the application layer is decoupled from concrete technological choices (such as Slack, databases, or third-party APIs).

## Types of Ports

1. **Inbound Ports (Driving Ports / Primary Ports)**:
   - Define the API that the application exposes to the outer layers.
   - Typically implemented by Application Services (use cases).
   - Called by Primary Adapters (such as Controllers in the infrastructure layer).
   - *Example:* `CreateIncidentUseCase` interface or handler.

2. **Outbound Ports (Driven Ports / Secondary Ports)**:
   - Define what the application needs from external systems to fulfill its tasks.
   - Typically implemented by Secondary Adapters (such as Repositories or HTTP clients in the infrastructure layer).
   - Called by Application Services.
   - *Example:* `IncidentRepository` or `SlackNotificationSender`.
