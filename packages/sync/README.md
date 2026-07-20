# @pos/sync

Sync engine: outbox worker that drains sync_queue upward, and the puller that brings menu/staff/config down. Retry with exponential backoff; the cloud dedupes on entity UUID.

**Status:** not yet implemented — Phase 1 placeholder.
