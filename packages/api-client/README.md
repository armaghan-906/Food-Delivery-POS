# @pos/api-client

Typed client for the NestJS backend, consumed by the admin dashboard and the
online-ordering app.

```ts
const api = new ApiClient({ baseUrl: 'https://api.example.com', getToken: () => session.jwt });
await api.health();
```

**Not for the till.** `apps/terminal` reaches the cloud only through the outbox
transport in [`@pos/sync`](../sync) — the one write path that tolerates being offline.
This client is for the always-online back-office surfaces.

Phase-0 skeleton: `health` and `syncPush` exist today; endpoints are added as their
backend modules land.
