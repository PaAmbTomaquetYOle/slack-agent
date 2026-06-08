# Infrastructure Controllers (Primary / Driving Adapters)

This directory contains the entry points that trigger our application. These controllers receive inputs from the outside world (in this case, Slack) and map them into instructions for our application services.

## Role in the Architecture

- **Slack Integration:** Implements listeners for Slack actions, slash commands, events, and shortcuts using `@slack/bolt`.
- **Request Validation & Parsing:** Extracts and validates variables from incoming Slack requests.
- **Orchestration Delegation:** Calls the appropriate Application Service (use case) and formats the return values into Slack-compatible block payloads.

## Examples
- `SlackCommandController`: Listens for `/incident` commands and triggers the incident creation flow.
- `SlackEventController`: Listens for app mentions or message events to coordinate thread responses.
