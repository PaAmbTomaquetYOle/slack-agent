# Domain Layer

This directory contains the **Core Business Logic** of the Slack Agent. Following the principles of Hexagonal Architecture, this layer is completely isolated and framework-agnostic.

## Rules
- **No external dependencies:** Do not import any external libraries here (e.g., no `@slack/bolt`, no database ORMs, no HTTP clients).
- **Inward dependency only:** This layer does not depend on `application` or `infrastructure`. It stands alone.

## What belongs here?
- **Entities / Models:** Pure TypeScript classes or types representing the core concepts of the business.
- **Domain Errors:** Custom error classes specific to business rule violations.
- **Value Objects:** Small objects that represent a simple entity whose equality is not based on identity.

*Remember: If you change your chat platform from Slack to MS Teams tomorrow, nothing in this folder should change.*