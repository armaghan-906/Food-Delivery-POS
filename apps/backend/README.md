# @pos/backend

NestJS cloud API. Receives order events from tills, replays them into MySQL 8 via Prisma, and serves reference data downward.

Must be idempotent on the client-generated entity UUID — see docs/decisions.md ADR-004.

**Status:** not yet implemented — Phase 1 sync skeleton is next.
