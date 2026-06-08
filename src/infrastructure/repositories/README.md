# Infrastructure Repositories

This directory contains the concrete implementations of data access and persistence logic, implementing the repository interfaces defined in the application or domain layers.

## Purpose

- **Database Separation:** The core domain is not aware of whether data is stored in PostgreSQL, MongoDB, a simple file, or memory.
- **ORM / Driver Isolation:** All database-specific libraries (e.g., Prisma, Mongoose, TypeORM) are restricted to this directory.

## Examples
- `InMemoryIncidentRepository`: Useful for tests or local development without a database.
- `PrismaIncidentRepository`: A database repository adapter utilizing Prisma ORM.
