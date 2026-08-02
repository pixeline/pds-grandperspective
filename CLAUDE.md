# atproto-avatar — "GrandPerspective, PDS edition"

A browser tool that draws any atproto repo as a treemap sized by stored bytes,
and lets a signed-in user edit or delete records in their own repo. Reads work
for anyone, unauthenticated; writes require atproto OAuth.

Design spec: `docs/superpowers/specs/2026-08-02-grandperspective-pds-edition-design.md`

**Status:** SvelteKit app in `src/`. Verified against `pixeline.be` — 186,958
records across 195 collections, PDS `eurosky.social`. The retired *Stills &
Frames* stack viewer lives on the `archive/stills-and-frames` branch.

## Hard constraints

1. **Never React. Use SvelteKit.** Applies to this and every project.
2. **All repo reading happens client-side.** No server, no proxy, no credentials.
   Browser CORS rules are therefore a real constraint.
3. **Every visual property traces to a number in the repo.** If you cannot name
   the source of a mark, do not draw it.
4. **Errors are reported, never decorated.** A clean repo reports zero errors,
   and that is the honest output.
5. **No rounded corners, no drop shadows, no gradients, no decorative motion.**
   International Style applied to data. Enforced by a test.
6. **Chroma belongs to the data.** Hue identifies a collection, saturation
   carries recency. All chrome is neutral.

## Layout

    src/lib/atproto/tid.js        TID → ms (server clock, preferred over createdAt)
    src/lib/atproto/identity.js   handle → DID → PDS endpoint
    src/lib/atproto/car.js        getRepo CAR fetch + parse, true stored byte sizes
    src/lib/atproto/read.js       orchestrates CAR-first with listRecords fallback
    src/lib/atproto/audit.js      error taxonomy, scoped per lexicon
    src/lib/atproto/session.svelte.js    OAuth client, sign in/out, granted scopes
    src/lib/atproto/write.js      putRecord / deleteRecord
    src/lib/atproto/typeahead.js  actor search (typeahead.waow.tech)
    src/lib/repo/hues.js          collection → hue and share
    src/lib/repo/treemap.js       nsid nesting + squarified layout
    src/lib/repo/filter.js        collection / timeframe / query filtering
    src/lib/repo/hittest.js       grid spatial index, pointer → record
    src/lib/repo/format.js        formatters
    src/lib/repo/urlstate.js      hash round-trip
    src/lib/components/           Rail, Treemap, Firehose, RecordModal, Footer, …
    src/routes/+page.svelte       orchestration only

`npm run dev` · `npm test` · `npm run build`

**The seam that matters:** `treemap.js`, `filter.js`, `hittest.js` and `hues.js`
emit plain data — no DOM, no CSS. Components render that. It is what made
swapping the DOM renderer for canvas a leaf change, and what would make a
later swap to WebGL the same.

## Findings that are load-bearing

- **Read the whole repo or the treemap lies.** The old reader sampled ~21
  records per collection under a 4000-record ceiling — 2.1% of a 186,958-record
  repo. `app.bsky.feed.like` is 93% of that repo's records and 89% of its bytes,
  and was drawn from 21 of them. A treemap's only claim is that area is
  proportional to size; equalized sampling breaks exactly that claim. Never
  reintroduce a ceiling.
- **The fair round-robin read is retired, deliberately.** It existed to make
  every collection *present* under truncation. With no truncation there is
  nothing to mitigate. Do not restore it as a lost improvement.
- **`ReadableRepo` is not exported from `@atproto/repo`.** Use `Repo`, which
  extends it and inherits the static `load`.
- **`getRepo` sends no `Content-Length`** — the body is chunked. Size must be
  counted while streaming, never read ahead.
- **Audit only what a lexicon actually promises.** All 304 "invalid records" on
  pixeline.be were non-Bluesky lexicons judged by `app.bsky`'s schema. Scoping
  the rules dropped it to 64 real errors.
- **`window.open` with a features string is a popup**, and blockers kill it
  silently. Use a synthetic `<a target="_blank">`.
- **Canvas hit testing is ours now.** A bug in `hittest.js` opens the wrong
  record — and that modal has a delete button.

## Known risks

- **CORS.** Self-hosted PDSs may not send `Access-Control-Allow-Origin` on
  `/xrpc/`. `eurosky.social` does send `*`, so the motivating case works. Prefer
  failing loudly over falling back to an AppView, which would lose the
  unknown-lexicon coverage that motivates the tool.
- **Memory.** 226 MB heap for a 187k-record repo with values retained. Gated by
  a streaming size check at 150 MB of CAR, not by silent truncation.
- **`did:web` resolution** is written but untested.
- **Deployment path is permanent.** The OAuth `client_id` is a URL.
