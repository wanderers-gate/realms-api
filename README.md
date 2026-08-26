# Realms API

> **Archived.** This was the standalone backend for the project now called
> **Waystation**, a self-hosted virtual tabletop. Development continues in a
> private repo where the API and the React client live together, so the whole
> app can be built, versioned, and packaged as a single self-hosted deployment.
>
> This repo stays public as a record of the API and real-time architecture. The
> code here works and most of the core functionality is present.

A Node.js + TypeScript service backing a real-time collaborative virtual
tabletop. Multiple clients join a room and stay in sync over WebSockets:
canvas drawing, cursor positions, map and token state, character sheets,
initiative order, dice rolls, and chat. Several rooms run concurrently on one
server instance, and room state persists across restarts.

**Stack:** Node.js, TypeScript, Express, Socket.IO, Drizzle ORM, SQLite
(better-sqlite3), JWT, Argon2, Docker, CircleCI, Jest.

## Architecture

**Two interfaces over one domain.** `src/routes` and `src/controllers` handle
the REST side — auth, rooms, players, canvases, character sheets, file
uploads — serialized as JSON:API through `src/serializers`. `src/sockets`
handles everything that has to be live. Both share the same Drizzle schema in
`src/db/schema.ts`.

**Real-time layer** — [`src/sockets/`](src/sockets). One handler module per
concern, each registered against the connection in
[`src/server.ts`](src/server.ts):

| Handler | Responsibility |
|---|---|
| [`canvas.handlers.ts`](src/sockets/canvas.handlers.ts) | Drawing operations, undo/redo, canvas persistence |
| [`token.handlers.ts`](src/sockets/token.handlers.ts) | Token placement and movement on the map |
| [`cursor.handlers.ts`](src/sockets/cursor.handlers.ts) | Live cursor positions |
| [`sheet.handlers.ts`](src/sockets/sheet.handlers.ts) | Character sheet updates |
| [`initiative.handlers.ts`](src/sockets/initiative.handlers.ts) | Turn order |
| [`chat.handlers.ts`](src/sockets/chat.handlers.ts) | Room chat and dice rolls ([`helpers/dice.ts`](src/sockets/helpers/dice.ts)) |
| [`handout.handlers.ts`](src/sockets/handout.handlers.ts) | Shared handouts |
| [`ping.handlers.ts`](src/sockets/ping.handlers.ts) | Map pings |

**Write batching.** Canvas drawing produces a high volume of small events.
Rather than writing each one, `canvas.handlers.ts` broadcasts immediately and
buffers operations in memory, flushing to SQLite on a timer and on room
teardown. Clients see strokes at once; the database sees batches.

**Authentication** runs across both interfaces. JWTs are issued into httpOnly
cookies, verified by
[`src/middleware/auth.middleware.ts`](src/middleware/auth.middleware.ts) for
REST and re-read from the handshake cookie on socket connect in `server.ts`,
so a socket connection carries the same identity as the request that opened
the page. Tokens carry a `tokenVersion` checked against the user record, which
invalidates outstanding tokens on password change. Passwords are hashed with
Argon2.

**Permissions** are per-room and checked inside the socket handlers, not just
at connect: the room creator is GM, and other users have explicit modify
permissions. A read-only participant can receive canvas broadcasts without
being able to write to them.

**Storage.** SQLite via Drizzle, chosen deliberately — a self-hosted VTT should
run on a box in someone's house without provisioning a database server.
Migrations live in [`drizzle/`](drizzle). Uploaded maps, tokens, and audio go
to a per-room directory tree on disk ([`src/helpers/storage.ts`](src/helpers/storage.ts))
rather than into the database.

## Testing

Jest, with tests alongside the code they cover — controllers, serializers,
middleware, JWT handling, dice normalization, and a socket integration test
([`src/sockets/test/socket-canvas.test.ts`](src/sockets/test/socket-canvas.test.ts))
that drives real client connections against a running server. `npm run ci`
runs Biome lint, typecheck, and the suite.

## Running it

```bash
npm install
npm run db:migrate
npm run dev          # ts-node-dev, watch mode
npm test
npm run build        # esbuild bundle
```

Docker:

```bash
docker build -t realms-api .
docker run -p 3000:3000 realms-api
```

See [ROOM_API_DOCUMENTATION.md](ROOM_API_DOCUMENTATION.md) for the room
endpoints.
