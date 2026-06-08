# Infrastructure Settings

This directory manages global application configurations, environment variables, validation of settings, and application-wide constants.

## Purpose

- **Environment Validation:** Safely parses and validates required environment variables (e.g., using `zod` or simple validators) upon startup, throwing clear errors if configuration is missing.
- **Centralized Constants:** Centralized storage for system-wide configuration limits, URLs, and feature flags.
- **Bootstrapping Config:** Prepares configuration structures needed to initialize adapters (e.g., database connection configs).
