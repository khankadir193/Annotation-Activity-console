# DECISIONS.md

## Key decisions and tradeoffs

**RTK Query vs. thunks.** I used a plain `createAsyncThunk` (`loadAllTasks`) instead of RTK
Query. RTK Query is a great fit when you want caching/invalidation/polling for a REST API you
don't otherwise need to touch. Here I needed something RTK Query doesn't give you out of the
box: paging through the mock server's `page`/`pageSize` API *sequentially*, dispatching after
each page so the UI paints incrementally, then merging into an `EntityAdapter` and separately
persisting the merged result to IndexedDB. That's imperative orchestration, which a thunk
expresses directly. If the app grew more endpoints (create/update task, etc.) I'd reach for RTK
Query for those, since the imperative case here is the exception, not the rule.

**Normalization approach.** `normalize.ts` treats every field independently: it never throws,
and it never drops a task unless the `id` itself is unusable (nothing to key state/selectors/React
lists by). Every other defect (bad status casing, unknown type, string count, mixed timestamp
formats, malformed assignee) is coerced to a safe default and the coercion is recorded in
`task.dataIssues` / `task.hadDataIssues`. The UI surfaces that (a small ⚠ in the table, and a
callout in the detail panel) instead of hiding it — "don't silently drop data" cuts both ways:
don't drop the record, but don't hide that you patched it either.

**Typing the messy data.** `RawTaskPayload` types every field as `unknown` (see
`src/types/task.ts`) — that's the one place `unknown` is used, deliberately, at the exact
boundary where we don't yet trust the shape. `normalize.ts` is the only code that's allowed to
narrow it. The internal `Task` type is a discriminated union on `type` (`image | audio | text |
unknown`), so an unrecognized type is a first-class member of the union (`UnknownTypeTask`, which
also keeps `rawType` for debugging) rather than a wildcard case bolted onto the union after the
fact. There are zero uses of `any` in `src/`.

**Real-time merge strategy.** WS events are applied directly onto the matching entity via
`EntityAdapter` when the task is already loaded. If an event references a task we haven't loaded
yet (the mock deliberately does this — see `t{120 + n%17}` in its WS handler, which can be beyond
page 1), the event is stashed in `pendingPatches` keyed by task id and replayed the moment that
task is loaded via `pageLoaded`. This means order-of-loading vs. order-of-events never causes a
dropped update, and it never crashes on an unknown id.

## Streamed markdown: where and how it's sanitized

The stream is rendered incrementally with `react-markdown`. The actual security boundary is one
step in the plugin pipeline, in `SummaryPanel.tsx`:

```
remark (markdown -> mdast)
  -> rehype-raw    (parses any raw HTML embedded in the markdown into a hast tree — this does
                     NOT execute anything, it's still just a tree)
  -> rehype-sanitize(schema)   <-- this is the sanitization boundary
  -> react-markdown's renderer (hast -> React elements; never dangerouslySetInnerHTML)
```

`schema` starts from `rehype-sanitize`'s default (GitHub-flavored) allowlist and explicitly
removes `script`/`style` from `tagNames` and strips any `on*` attribute from the global attribute
list. The default schema already excludes these, but the explicit denylist means this stays
enforced even if the upstream default ever changes, and it documents the intent in one place. I
verified this directly against the mock's actual payload (`<img onerror=...>` and
`<script>alert(...)</script>`): the sanitized output drops the `<script>` tag entirely and keeps
`<img src="x">` but with `onerror` stripped, while safe markdown (headings, bold, code blocks)
passes through untouched.

Because `react-markdown` never uses `dangerouslySetInnerHTML`, the untrusted content can only ever
reach the DOM as sanitized hast → React elements — there's no path for the raw string to be
interpreted as HTML by the browser directly.

Mid-stream task switching and errors: `useTaskSummaryStream` keys an `EventSource` to the current
`taskId` in a `useEffect` whose cleanup closes the connection and nulls out an `activeIdRef`
guard. If the user selects a different task while a stream is in flight, React runs the cleanup
before the next effect, so the old `EventSource`'s any-already-queued `onmessage`/`onerror`
callbacks are also guarded by the ref check and can't append to the new task's state. A
network-level failure sets `status: "error"` with a message, which the panel renders instead of
silently going blank.

## IndexedDB caching approach

`src/lib/indexedDb.ts` wraps `localforage` (IndexedDB-backed) behind two functions,
`saveTaskCache`/`loadTaskCache`, storing the full normalized task array plus a `cachedAt`
timestamp under one key. On boot, `ConsoleApp` dispatches `hydrateFromIndexedDb` first (paints
instantly from whatever was cached, and flags `cache.isStale = true`), then unconditionally
dispatches `loadAllTasks` to revalidate from the server; when that finishes, `isStale` clears and
the freshly-merged set is written back to the cache. The header banner explicitly says "Showing
cached data — revalidating…" while stale, so the user is never left thinking cached data is
current. Writes are fire-and-forget (`void saveTaskCache(...)`) so a large write never blocks
rendering, and all IndexedDB errors are caught and logged rather than propagated, since caching is
a pure optimization — losing it should never break the app.

## What I handled vs. deliberately didn't

Handled: inconsistent status casing/spelling, unknown task types, epoch-ms vs ISO timestamps,
stringified counts, null/malformed assignees, missing/empty titles, WS events for
not-yet-loaded tasks, WS reconnect with capped exponential backoff, mid-stream task switching and
stream errors, and empty/loading/partial/error states everywhere data can be missing.

Deliberately skipped, given the two-day budget (noted here rather than silently omitted): the
optimistic "assign to me" bonus action, list virtualization (137 rows doesn't need it), redux-persist
for filter/UI state (client-side pagination state resets on reload, which is an acceptable UX
tradeoff for this scope), a derived tasks-per-status chart, and caching streamed summaries in
IndexedDB. All are called out as bonus/optional in the prompt.

One scope note: the mock's `/api/tasks` query accepts `type`/`status` params but its handler
comment says it's "server-side paginate only" — filtering isn't actually implemented server-side.
Given that, filters/search/sort in this app operate client-side over the full accumulated set
(loaded page-by-page in the background, merged as it arrives), rather than being sent to the
server. Client-side pagination is then applied on top of the filtered/sorted result for display.

## What I'd do differently with more time

I'd move the WS reconnect/backoff logic and the SSE stream logic into small testable pure
functions (backoff delay calculation, event validation) separated from the `useEffect`
plumbing, so they could be unit tested directly instead of only through integration/manual
testing. I'd also add a proper end-to-end test (Playwright) that drives the real mock server, since
the current tests mock the store directly rather than exercising the real fetch/WS/SSE code paths.
Given more time I'd also implement the "assign to me" optimistic-update bonus, since the pattern
(dispatch optimistic update -> await request -> roll back entity on failure) is a natural
extension of the existing `EntityAdapter` setup.

## AI tool usage and verification

I used AI assistance throughout (the initial architecture pass, boilerplate for the RTK slice,
and the sanitize-schema plumbing). Everything was verified by actually running it, not just
reading it: `tsc --noEmit` in strict mode (clean, zero `any`), the full Jest suite (13 tests
across the normalizer/selectors/component), `next build` (clean production build), and manual
runtime checks against the actual mock server — curling `/api/tasks` and `/api/tasks/:id/summary`
to confirm the real messy payloads matched what the normalizer/sanitizer expect, connecting a raw
WebSocket client to confirm event shapes, and running the exact `rehype-sanitize` schema from
`SummaryPanel.tsx` against the mock's real `<script>`/`onerror` payload to confirm the script tag
is dropped and the event handler attribute is stripped before it ever reaches React.

---

# Part 2: Bug hunt — `buggy/TaskTicker.tsx`

**(A) The "seconds ago" clock never advances past 1.** The interval effect has an empty
dependency array, so its closure captured `tick` at its initial value (`0`) once and reused that
closure on every tick — every call was `setTick(0 + 1)`. Using the functional updater
`setTick(prev => prev + 1)` removes the dependency on any captured value, so each tick reads the
latest state instead of a stale closure.

**(B) Fetching `/api/tasks/null` on mount, and duplicating tasks on re-select.** The refetch
effect had no guard for `selectedId === null`, so it fired on initial mount with a literal `null`
in the URL. Separately, the "add the freshly loaded task" step did `prev.push(t); return prev`,
which mutates the existing array in place and returns the same reference — a state-mutation bug
that also means re-selecting an already-loaded task appends a second, duplicate entry instead of
replacing it. The fix guards on `selectedId` being truthy and returns a new array that removes any
existing entry with the same id before appending, so selecting a task is idempotent and immutable.

**(C) Sorting mutates state during render.** `tasks.sort(...)` was called directly on the state
array during render. `Array.prototype.sort` mutates in place, so this both breaks React's
"don't mutate state" contract and re-sorts on every single render even when `tasks` hasn't
changed. Wrapping a copy (`[...tasks].sort(...)`) in `useMemo` keyed on `tasks` makes the
derivation pure and only recomputes when the underlying data actually changes.

**(D) List items keyed by array index.** `key={i}` was used instead of `key={t.id}`. Because the
list is re-sorted and updated in place (not just appended to), an index-based key tells React the
wrong element identity across reorders — React can reuse/misapply a DOM node (and any of its
local state) for what is actually a different task after a resort. Keying by the task's stable
`id` fixes identity across reorders and updates.
