# Annotation Activity Console

An internal console for annotator task activity: a filterable/sortable task table, a live
WebSocket feed that merges updates in real time, a streamed + sanitized markdown AI summary per
task, and IndexedDB caching for instant reload.

See **DECISIONS.md** for the full write-up (architecture tradeoffs, sanitization details, caching
strategy, and the Part 2 bug-hunt explanations) — that's the doc this was built to be interviewed
from.

## Requirements

- Node.js 18+ (developed/tested on Node 22)

## Running it

You need two things running at once: the mock server, and the Next.js app.

**1. Mock server** (in one terminal):

```bash
cd mock-server
npm install
npm run mock
```

This serves REST + WebSocket + the streaming endpoint on `http://localhost:4000`
(`ws://localhost:4000/ws`). Leave it running.

**2. The app** (in another terminal, from the project root):

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Running tests

```bash
npm test
```

Covers the normalizer (messy-data edge cases), a memoized selector (filter/search/sort), and a
component interaction test (typing in search updates the visible rows, including the empty
state).

## Other scripts

```bash
npm run typecheck   # tsc --noEmit, strict mode
npm run build        # production build
```

## Notes

- The app expects the mock server on `http://localhost:4000` / `ws://localhost:4000/ws` by
  default. Override with `NEXT_PUBLIC_API_BASE` / `NEXT_PUBLIC_WS_URL` env vars if you run the
  mock elsewhere.
- Task list loading, filtering, sorting, and search all happen client-side over the full
  accumulated set (fetched from the mock page-by-page in the background — see DECISIONS.md for
  why). Pagination in the UI is over that filtered/sorted result.
- `npm audit` will flag several Next.js advisories that only apply to specific production
  server-side configurations (middleware, image optimizer, RSC caching) not used in this
  exercise; a project-wide upgrade to Next 16 was judged out of scope for a two-day take-home
  and would be a breaking-change migration.
- `buggy/TaskTicker.tsx` is not wired into the app; it's the fixed version of the Part 2 bug-hunt
  file, included standalone as the assignment describes.
