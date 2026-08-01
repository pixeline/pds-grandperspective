# GrandPerspective — PDS edition

**Date:** 2026-08-02
**Status:** approved design, ready for implementation planning

A browser tool that draws any atproto repo as a treemap sized by stored bytes, and
lets a signed-in user edit or delete records in their own repo.

This spec reorients the project. The `Stills & Frames` viewer — a rotatable stack of
sessions in time — is retired to an archive branch and stripped from the codebase.
The treemap, previously the second of two viewers behind `#v=map`, becomes the product.

---

## 1. Purpose and scope

**Purpose.** GrandPerspective for atproto: see where a repo's bytes actually go, then
act on what you find. Anyone can inspect any public repo. A signed-in user gets edit
and delete on their own.

**In scope for this release**

- Read any repo by handle or DID, unauthenticated, **in full — there is no record ceiling**.
- Treemap sized by stored bytes or record count, one cell per record.
- Filter by collection/namespace, by timeframe, and by full-text search over record content.
- Sign in with atproto OAuth.
- Inspect one record in a modal; edit its JSON or delete it, when it is your own.

**Explicitly out of scope**

- Bulk selection and bulk delete. Deferred; it is the reason a right-hand panel might
  later exist, and it needs a confirmation design this release does not attempt.
- Creating records. The app never calls `createRecord`, which is why `create` is absent
  from the requested scope.
- The `Stills & Frames` stack viewer, in any form.

**Framing.** This is a utility with taste, not an art piece. Of the seven hard constraints
in the previous `CLAUDE.md`, five were about the 3D stack and are retired along with it
(no lighting/shading/gradients, asymmetry, glitch-only-from-real-error as an *aesthetic*,
the metadesign parameter panel, and the Mondrian/Kasimir lineage). Two are kept because
they are good engineering rather than art doctrine:

- Every visual property traces to a real number in the repo. No hash-seeded decoration.
- Errors are reported, never decorated. A clean repo reports zero errors, and that is the
  honest output.

Constraints 1 (never React, use SvelteKit) and 2 (all repo reading happens client-side,
no server, no proxy, no credentials) remain in force and are unaffected by adding OAuth —
`@atproto/oauth-client-browser` is browser-only by design.

**Deployment.** `https://pixeline.be/pds-grandperspective/`. This URL is load-bearing:
it contains the OAuth `client_id`, and moving the app later invalidates every existing
OAuth session.

---

## 2. Archive and strip

### 2.1 Archive branch

Create `archive/stills-and-frames` at the current HEAD before deleting anything, so the
stack viewer, its prototype, and its documentation stay recoverable in full.

No git remote is configured in this worktree. The branch is local-only until pushed;
that is accepted and noted rather than fixed here.

### 2.2 Deletions

| Path | Reason |
|---|---|
| `src/lib/portrait/layout.js` | Session→plate mapping, twist, decay. Stack-only. **Extract `hueOf` first — see 2.3.** |
| `src/lib/portrait/sessionize.js` | Silence-bounded sessions and adaptive gap threshold. Stack-only. |
| `src/lib/components/Stack.svelte` | The CSS-3D renderer. |
| `prototype/` | The original single-file prototype of the stack. |

### 2.3 Extraction, before deletion

`globalLayout()` in `layout.js` produces two things the treemap needs: `hueOf` (a
golden-angle walk over sorted NSIDs assigning one hue per collection) and `shares` (each
collection's fraction of the whole, used by the legend). Deleting `layout.js` without
lifting these out breaks the treemap.

New module `src/lib/repo/hues.js`:

```
collectionHues(records) → { hueOf: Map<nsid, number>, shares: Map<nsid, number> }
```

Pure, no DOM. Sorting NSIDs before the golden-angle walk is what makes a collection's
hue stable across reads, so it must be preserved exactly.

### 2.4 Renames and splits

- `src/lib/portrait/` → `src/lib/repo/`. "Portrait" no longer describes the contents.
- `portrait/params.js` splits:
  - `repo/format.js` — `fmtNum`, `fmtBytes`, `fmtDur`, `fmtDate`. All still used.
  - `repo/urlstate.js` — hash round-trip, rewritten for the new state shape (§7).
  - The `PARAMS` array is deleted outright, and with it the whole slider rail. Five of the
    six entries were stack parameters (`gap`, `twist`, `depth`, `decay`, `tiles`); the
    sixth, `cap`, is removed by §3 — the repo is now read in full, so there is no ceiling
    to expose.
- `portrait/portrait.spec.js` splits into `repo/treemap.spec.js`, `repo/hues.spec.js`,
  `repo/filter.spec.js`, `atproto/tid.spec.js`, `atproto/audit.spec.js`. Stack assertions
  are dropped. The suite stays green at every step of the strip.

### 2.5 Documentation

- `docs/brief.md` and `docs/mapping.md` → `docs/archive/`. They describe the stack, but
  they also record the reasoning behind decisions still live in `read.js` and `audit.js`.
  Deleting them would lose that.
- `CLAUDE.md` is rewritten to describe this app.
- A `README.md` states authorship (Alexandre Plennevaux) and credits *GrandPerspective* by
  Erwin Bonsma as the source of the name and the treemap interaction, noting that the
  original is GPL-licensed and that this is an independent work rather than a port or an
  affiliated project. The same credit appears in the interface footer (§13).

### 2.6 Layout after the strip

```
src/lib/atproto/tid.js          TID → ms (server clock, preferred over createdAt)
src/lib/atproto/identity.js     handle → DID → PDS endpoint (did:plc + did:web)
src/lib/atproto/read.js         orchestrates: CAR first, listRecords fallback, size gate
src/lib/atproto/car.js          NEW — getRepo CAR fetch + parse, true stored byte sizes
src/lib/atproto/audit.js        error taxonomy, scoped per lexicon
src/lib/atproto/typeahead.js    actor search (typeahead.waow.tech)
src/lib/atproto/session.js      NEW — OAuth client, sign in/out, granted scopes
src/lib/atproto/write.js        NEW — putRecord / deleteRecord
src/lib/repo/hues.js            NEW — collection → hue and share (extracted)
src/lib/repo/filter.js          NEW — collection / timeframe / query filtering
src/lib/repo/treemap.js         nsid nesting + squarified layout
src/lib/repo/format.js          formatters
src/lib/repo/urlstate.js        hash round-trip
src/lib/repo/hittest.js         NEW — grid spatial index, pointer → record (§4.2)
src/lib/components/             Gate, Rail, Tip, Typeahead, SignIn
src/lib/components/Treemap.svelte   canvas renderer, replacing one div per record (§4.2)
src/lib/components/Firehose.svelte  NEW — the read, streaming (§12)
src/lib/components/RecordModal.svelte NEW — inspect / edit / delete (§9)
src/lib/components/Footer.svelte    NEW — credits (§13)
src/routes/+page.svelte         orchestration only
static/oauth-client-metadata.json
```

**The seam that matters, unchanged:** `treemap.js` and `filter.js` emit plain data — no
DOM, no CSS. Components render that. It is what makes swapping the DOM renderer for canvas
(§4.2) a leaf change rather than a rewrite, and it will make a later swap to WebGL the same.

---

## 3. Read path

The read path is **replaced**, not adjusted. This is the largest change in the spec, and it
is driven by a correctness defect in the current reader rather than by the new features.

### 3.1 The defect: truncation falsifies proportion

`read.js` reads breadth-first under a record ceiling. At the defaults — `cap` 4000 across
195 collections — pass 1's page size is `ceil(4000/195)` = **21 records per collection**.
195 × 21 exceeds 4000, so the ceiling is reached at roughly collection 191, **pass 2 never
runs**, and the last few collections are never read at all.

The result: every collection holding more than 21 records is truncated to exactly 21.
`app.bsky.feed.like` with tens of thousands of records and an obscure lexicon with 22 both
render as equal-area blocks. Collections *under* 21 records are read completely, so they
render smaller than the giants they may dwarf.

A treemap's single claim is that area is proportional to size. Equalized sampling breaks
exactly that claim, so the current reader cannot feed this viewer.

**Why the previous finding does not generalize.** Fair round-robin reading was the correct
fix *for the stack*, whose requirement was only that every collection be *present* — a
sequential alphabetical scan let `app.bsky.feed.like` eat the whole ceiling and leave 181
of 195 collections invisible. Presence was the goal; proportion was not. It was always a
mitigation for truncation, so removing truncation removes the need for it. This is recorded
here so the round-robin is not "restored" later as a lost improvement.

### 3.2 Primary path: `com.atproto.sync.getRepo`

One request returns the complete repo — all records, MST nodes, and the signed commit — as
a CAR file. The endpoint is [deliberately unauthenticated](https://atproto.com/specs/sync);
repo content is public.

New module `src/lib/atproto/car.js`, wrapping `readCar` and `cborToLexRecord` from
`@atproto/repo`:

```
readRepoCar(pds, did, signal, onProgress) → { records, collections, rev }
```

Two advantages beyond completeness:

- **Byte sizes become measurements.** Today `bytes` is `JSON.stringify(value).length` — a
  re-serialization into a format the PDS does not use. The CAR carries each record as a
  DAG-CBOR block, so its length is what the repo actually stores. For a tool whose premise
  is disk usage, that is the difference between an estimate and a measurement.
- **One round trip** instead of hundreds, with byte-level progress from the response stream.

### 3.3 Fallback path: exhaustive `listRecords`

When `getRepo` is unavailable — the PDS blocks the sync endpoint, or omits CORS headers on
it specifically — fall back to `describeRepo` plus `listRecords`, paged to exhaustion on
every collection, with no ceiling.

Two rules for the fallback:

- **Read order no longer matters,** because every collection is read to exhaustion either
  way. Sequential is fine; the round-robin is not reintroduced.
- **The map renders only when the read completes.** A partially-read treemap misstates
  proportion in exactly the way §3.1 describes, so progress is shown as progress rather
  than as a map that is quietly wrong.

`bytes` on this path remains the JSON-length estimate. The stats line states which
measurement is in use, so an estimate is never presented as a measurement.

### 3.4 Record shape

```js
{
  col, ts, rkey,
  errs, errNames,
  bytes,        // DAG-CBOR block length (CAR) or JSON length (fallback)
  exact,        // true on the CAR path, false on the fallback
  value         // retained — search needs something to search
}
```

Retaining `value` serves both full-content search (§5) and the record modal (§9), which
then needs no second fetch and cannot disagree with what the map measured.

### 3.5 Size warning

No silent truncation, ever. Before committing to a large read, establish the size —
`Content-Length` on the CAR response, or a `describeRepo` probe on the fallback — and if it
exceeds a threshold, state the real figures and let the user choose:

> `≈240 MB · ~180,000 records. Reading this fully will use roughly that much memory.
> Read it all / Cancel`

If they decline, they have still learned the repo's true size, which is a legitimate answer
from a disk-usage tool. What they are never given is a map that looks complete and is not.

### 3.6 Unchanged

**Scoped auditing** stays exactly as it is: rules apply only to what a lexicon actually
promises. Judging non-Bluesky lexicons by `app.bsky`'s schema produced 304 false "invalid
records"; scoping dropped it to 64 real ones.

**Reads stay unauthenticated even when signed in.** `getRepo`, `describeRepo` and
`listRecords` are all public. Routing them through an OAuth-bound agent would send them via
the user's PDS acting as an AppView proxy — a contract non-`bsky.social` deployments
(eurosky.social, self-hosted, Cocoon) do not reliably implement, and a common source of
`401` after an otherwise successful OAuth. The signed-in state changes writes only.

---

## 4. Treemap and renderer

### 4.1 Layout — unchanged

`treemap.js` is kept as it is: NSID-nested squarified layout, one cell per record, sized by
stored bytes or by record count, with blocks too small to resolve shown whole and labelled
as aggregated rather than faked. Its input changes — it receives the filtered record set
(§5) rather than all records — but the algorithm does not.

### 4.2 Renderer — canvas 2D, replacing one `div` per record

`Treemap.svelte` currently renders one `<div>` per block and one `<button>` per record.
With the ceiling removed (§3) that count is set by the repo rather than by us, so the DOM
renderer has to go.

**Drawn cells are bounded by screen area, not repo size.** This is the fact that decides
the technology. `treemap.js` only emits per-record cells when they are at least 2.5×2.5 px,
aggregating anything smaller into one labelled block. So the ceiling on drawn cells is
viewport area ÷ 6.25 px² — about 150k at 1200×800, 200k at 1400×900 — no matter whether the
repo holds 4,000 records or 400,000. Past that point extra records make blocks aggregate
rather than making cells multiply.

**Decision: canvas 2D**, with WebGL held in reserve.

- The content is axis-aligned, flat-filled rectangles with no transform, no lighting, no
  per-frame animation. The map is static between interactions and redraws only on filter,
  resize, or hover — so WebGL's advantage, millions of primitives at 60 fps, buys nothing
  here.
- ~200k `fillRect` calls is a one-off cost in the tens of milliseconds, and it drops sharply
  when cells are batched by fill colour: set `fillStyle` once per (collection hue × age
  bucket) group rather than once per record, turning ~200k state changes into a few thousand.
- **three.js is categorically wrong for this** — a 3D scene graph and several hundred KB to
  draw 2D rectangles, in a project that has no 3D left in it.
- The data seam holds: `treemap.js` emits plain `{x, y, w, h, color}`, so swapping canvas
  for WebGL later remains a leaf change, exactly as it was for swapping DOM for canvas.

**What canvas costs, stated honestly:**

- **Hit testing must be hand-rolled.** A uniform grid spatial index over blocks and cells,
  built once per layout, resolves pointer position to a record in constant time.
- **Accessibility changes shape.** Today each cell is a `<button aria-label>`. Canvas has no
  DOM, so per-record screen-reader enumeration is lost — though 200k focusable buttons was
  never navigable in practice either. Replacement: keyboard traversal across blocks and
  within a block, the focused cell announced via an `aria-live` region, and the record modal
  (§9) remains ordinary accessible DOM. This is a real trade, not a free win.
- **Device pixel ratio must be handled explicitly.** Scale the backing store by `devicePixelRatio`
  and draw on half-pixel offsets, or every hairline rule blurs — which would undo the visual
  language in §11 immediately.

**Caution for any later pan/zoom.** There is no drag interaction on the treemap today, so
this does not bite yet — but a drag handler that captures on every `pointerdown` swallows
clicks on child controls and retargets `click` to the container. Every cell here is a
button, so adding pan without guarding the press would break record selection entirely.
Guard the press, and detect taps on `pointerup` with a movement threshold.

---

## 5. Filters and search

New pure module `src/lib/repo/filter.js`:

```
applyFilters(records, { collections, from, to, query })
  → { records, matched, total, bytes, totalBytes }
```

No DOM, no dependency on the renderer. Fully unit-testable.

**collections** — a `Set` of NSIDs *or* namespace prefixes. `app.bsky` selects the whole
branch; `app.bsky.feed.like` selects one collection. Prefix matching is on dot-segment
boundaries, so `app.bsky` must not match a hypothetical `app.bskyfoo.*`. An empty set means
no collection filter, not "match nothing".

**from / to** — inclusive millisecond bounds against the record's resolved timestamp (TID
first, `createdAt` second — see §6). Either may be null.

**query** — case-insensitive substring, matched against `JSON.stringify(value)` plus `col`
plus `rkey`. An empty or whitespace-only query means no filter.

All four are ANDed. Filters are applied once per change and the result memoised, because
the treemap re-derives from it.

**Effect on the map.** Filtered-out records leave entirely and the survivors are
re-squarified to fill the space. This is what makes small collections readable once the
giants are excluded, which is the reason to filter at all. The info line reports
`showing X of Y records · N of M` so a filtered view is never mistaken for the whole.

**Legend interaction.** Legend rows toggle their collection's membership in the filter, so
the legend is a control as well as a key.

---

## 6. Timestamps

Unchanged: TID decoding first, `createdAt` second. The TID is server-assigned; `createdAt`
is user-claimed. Their disagreement is real information and is surfaced in the record modal
(§9) rather than silently resolved.

The open question inherited from the previous design — whether `clock skew > 24h` indicates
error or legitimate backdating of imported content — is **not** resolved by this spec. It
was load-bearing because skew tore a plate in the stack. With the stack gone, skew is
reported in the error tally and shown in the modal, and nothing about the drawing depends
on the answer. It can be settled later without blocking this release.

---

## 7. URL state

`repo/urlstate.js` round-trips the viewable state through the hash, so a filtered view is
shareable:

| Key | Meaning |
|---|---|
| `h` | handle or DID being viewed |
| `w` | weigh mode — `bytes` (default) or `records` |
| `c` | comma-separated collection/prefix filter, omitted when empty |
| `from`, `to` | timeframe bounds as ISO dates, omitted when unset |
| `q` | search query, omitted when empty |

The `v` (viewer) key is removed — there is one viewer. Stack keys (`gap`, `twist`, `depth`,
`decay`, `tiles`, `cam`, `ax`, `ay`) are removed, and `cap` with them (§3).

The hash is read once on mount, not in a reactive effect. An effect that both reads and
writes `params` makes itself its own dependency and Svelte rejects it — this was learned
the hard way and the fix must be preserved.

---

## 8. Authentication

### 8.1 Client type and library

A **public client** — browser SPA, no server, no client secret, per the skill's app-pattern
decision. `token_endpoint_auth_method: "none"`.

Library: **`@atproto/oauth-client-browser`**. Together with `@atproto/repo` (§3.2) it is one
of the project's first two runtime dependencies — `package.json` currently has none. The
trade is deliberate: the library owns PAR, PKCE
S256, per-session DPoP keypair generation, the DPoP nonce retry protocol, per-server nonce
rotation, auth-server discovery, `state` generation and single-use consumption, callback
`iss` verification, token `sub` verification, bidirectional handle verification, and session
persistence. Hand-rolling that is several hundred lines of security-critical code whose
failure modes are silent and whose bugs surface only against someone else's PDS.

### 8.2 Client metadata

Served as a static file at `static/oauth-client-metadata.json`, reachable at
`https://pixeline.be/pds-grandperspective/oauth-client-metadata.json`. The filename follows
the skill's recommendation for cleaner domain display in Authorization Server consent UI.

```json
{
  "client_id": "https://pixeline.be/pds-grandperspective/oauth-client-metadata.json",
  "client_name": "GrandPerspective — PDS edition",
  "client_uri": "https://pixeline.be/pds-grandperspective/",
  "redirect_uris": ["https://pixeline.be/pds-grandperspective/"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "scope": "atproto repo:*?action=update&action=delete",
  "token_endpoint_auth_method": "none",
  "application_type": "web",
  "dpop_bound_access_tokens": true
}
```

`client_id` must exactly equal the URL the metadata is fetched from. Every redirect URI
must sit on that same origin.

### 8.3 Scope inventory

Per-operation, as the skill requires:

| Operation | Classification | Route | Scope needed |
|---|---|---|---|
| `com.atproto.identity.resolveHandle` | read | public AppView | none |
| `plc.directory` / `.well-known/did.json` | read | direct | none |
| `com.atproto.repo.describeRepo` | read | target PDS, unauthenticated | none |
| `com.atproto.repo.listRecords` | read | target PDS, unauthenticated | none |
| `app.bsky.actor.searchActorsTypeahead` | read | `typeahead.waow.tech` | none |
| `com.atproto.repo.putRecord` | write | OAuth agent, own PDS | `repo:*?action=update` |
| `com.atproto.repo.deleteRecord` | write | OAuth agent, own PDS | `repo:*?action=delete` |

**Resulting scope string:** `atproto repo:*?action=update&action=delete`

**Why the wildcard collection.** Granular `repo:<nsid>` scopes must name collections in
static client metadata. This app's premise is acting on lexicons it has never seen — 195
collections on one test repo, a different set for every user — so the NSID set is unknowable
at metadata-authoring time. The [permission spec](https://atproto.com/specs/permission)
permits the full wildcard and lists `repo:*?action=delete` as a literal example. Partial
wildcards (`repo:app.bsky.*`) are prohibited; full ones are not.

**Why not `transition:generic`.** The skill classes it as a legacy escape hatch. It grants
create/update/delete on any record type *plus* blob upload, read and write of personal
preferences, service proxying for most Lexicon endpoints, and service-auth-token generation.
`repo:*?action=update&action=delete` grants none of that, and omits `create` because the app
never creates records. The consent screen reads "update and delete records" rather than
"full account access".

**Risk.** `repo:*` is recent. An older auth server may reject it or narrow it silently.
Handled by scope gating (§8.5) rather than by falling back to a broader scope.

### 8.4 Development

The loopback `client_id` form, with the redirect URI on the **literal IP `127.0.0.1`** —
the spec rejects the hostname `localhost` for this special client, and using it produces a
rejection that is confusing to diagnose. Vite's dev server must therefore bind `127.0.0.1`.

### 8.5 Two things the app owns

**Callback ordering.** The OAuth callback arrives as `?code=…&state=…` on the same `/` that
restores view state from the hash. The callback must be resolved *before* `urlstate` is
read, or the redirect races the state restore. This is an explicit sequencing requirement
in `+page.svelte`'s mount, not an incidental detail.

**Granted-scope gating.** On callback, compare granted scopes against requested. Write
affordances are enabled only if repo update/delete was actually granted. If it was not, the
app runs read-only and displays the reason — rather than showing Edit and Delete buttons
that fail at click time.

Read the granted scopes from the SDK's own token-info accessor, not from a guessed field.
`client.callback()` returns a session object, and `session.scope` / `session.tokenSet.scope`
do not exist on every session type — reading them produces `undefined`, which silently
gates every write off (or, if the check is written the other way round, silently gates them
all on). Gate on the parsed granted set only.

### 8.6 Identity matching

Write affordances require the signed-in DID to equal the DID currently being viewed.
Browsing another repo while signed in is read-only, and the UI says so rather than hiding
the controls without explanation.

### 8.7 Discovery hardening

Identity resolution for *reading* (`identity.js`) is separate from the library's OAuth
discovery and stays unauthenticated. It fetches untrusted third-party documents, so it
keeps to documented fields only, requires `https` for a resolved `serviceEndpoint`, and
rejects a DID document that lists no PDS service. It already reads only documented fields;
the `https` requirement is the addition.

---

## 9. Record modal

Clicking a cell opens a modal — chosen over a right-hand panel, which is deferred until
bulk delete makes one worthwhile.

**Always shown:** NSID, rkey, resolved timestamp *and* the claimed `createdAt` when they
differ, stored byte size, any audit errors for that record, and the pretty-printed JSON.

**Read-only mode** — signed out, or viewing someone else's repo, or write scope not granted.
Shows the JSON plus the existing "open on pdsls.dev" link. The reason for read-only is
stated.

**Editable mode** — own repo, write scope granted:

- **Edit** — JSON in a textarea. Save stays disabled until the text parses *and* its
  `$type` still matches the original's — including the case where the original carries no
  `$type`, in which case the edited value must not introduce one. Changing `$type` would
  make the record a different kind of thing at the same key, which is a move this tool
  does not offer. Saving calls `com.atproto.repo.putRecord`.
- **Delete** — two-step. The button becomes "Confirm delete" on first press. No typed
  confirmation; that is reserved for bulk delete, when it exists.

**After a successful write**, patch the record in memory and re-derive. No full re-read.
A `putRecord` that changes the record's size visibly changes its cell, which is the honest
result. A delete removes the cell.

**Opening a record** keeps the existing synthetic-anchor technique rather than
`window.open` with a features string, which pop-up blockers kill silently.

---

## 10. Left rail

Repo-scope controls only; per-record content lives in the modal.

1. **Target** — handle/DID typeahead, switchable at any time, pointed at
   `typeahead.waow.tech`. Draw and Stop.
2. **Session** — signed out: "Sign in to edit your own repo". Signed in: handle, and sign
   out. When signed in but viewing another repo, states that writes are disabled.
3. **Filters** — collection tree with namespace-level checkboxes; timeframe as two date
   inputs plus quick ranges; search box.
4. **Measured** — PDS host, collections, records, stored size, first record, the repo
   revision, and which read path produced it: `measured (CAR)` or `estimated (listRecords)`.
   No ceiling row; there is no ceiling.
5. **Legend** — hue per collection, clickable to filter.
6. **Errors** — the audit tally.

There are no sliders. The rail carries a target, a session, filters, and readouts.

The rail has no drag interaction, so nothing here captures the pointer.

---

## 11. Visual language

International Style applied to data: neutral, gridded, unornamented. The image carries
information or it does not appear.

### 11.1 Prohibited

- **No rounded corners.** `border-radius: 0` everywhere, enforced by a global reset rather
  than by remembering. The codebase is already almost compliant — the single existing
  `border-radius` declaration is itself a reset to `0`.
- **No drop shadows**, no `box-shadow`, no `filter: drop-shadow`. Depth is not a variable in
  this data.
- **No gradients.** Flat fills only. A cell's colour encodes collection and age; a gradient
  would encode nothing while implying something.
- **No decorative motion.** Transitions may clarify a state change; nothing eases for
  flourish.

### 11.2 Positive rules

- **Hairlines at device resolution.** 1 px rules that are actually 1 device pixel — hence
  the DPR handling in §4.2. A blurred rule is the fastest way to make this look accidental.
- **Grid and alignment.** Left-aligned, consistent baseline, generous whitespace as the
  separator instead of boxes and borders. Separate with space first, a rule second, a
  container never.
- **Typography stays as it is.** Archivo (neo-grotesque, Helvetica/Univers lineage) for
  labels, IBM Plex Mono for every number. The existing pairing is already correct for this
  idiom. All measured values are monospace so digits align in columns.
- **Colour discipline.** Chroma belongs to the data alone — hue identifies a collection,
  saturation carries recency. All chrome is neutral: paper, ink, rule, ground. No accent
  colour, no brand colour, no state colour beyond what an error genuinely requires.

### 11.3 One change to the existing palette

`--ground: #f6f8f7` and `--rule: #e2e7e4` are very slightly green — deliberate under the
old framing, which wanted the portrait "suspended in air". That atmosphere is retired with
the stack. Move the neutrals to true greys so the only hue on screen comes from the repo.

---

## 12. Loading state — the read, at speed

The read is the longest moment in the app and currently shows a one-line status string.
Instead it becomes the most data-dense screen in the tool: the records themselves,
streaming past as they resolve.

**Not an animation of a loading process — the loading process, displayed.** Every line is a
record that actually arrived. This is the same principle as the map: nothing is drawn that
does not trace to a number in the repo.

**Composition**

- A monospace column, streaming bottom-up at read speed, one line per record:
  `14:22:07 · app.bsky.feed.like · 3lkq2v… · 412 B`
- A live readout beside it: records resolved, bytes read, throughput in records/sec and
  KB/sec, elapsed time, collections seen.
- Nothing else. No spinner, no progress bar chrome, no percentage — on the CAR path the
  byte total is known, so show real bytes against real total rather than an abstraction.

**Per path**

- **CAR (§3.2).** Bytes stream first from the response, so throughput is live from the first
  chunk. Records begin streaming as the CAR is parsed. Both phases are labelled for what
  they are: `receiving` then `parsing`.
- **`listRecords` fallback (§3.3).** Records genuinely arrive page by page, so the column
  streams naturally. The map still renders only on completion (§3.3) — the firehose is what
  fills the wait, precisely so that a half-read map never has to be shown.

**Implementation notes**

- Keep at most ~40 lines in the DOM, discarding from the top. The firehose is text and
  short-lived, so DOM is fine here; it is not the thing §4.2 is about.
- Throttle to animation frames, not per record. At full speed a CAR parse can resolve
  thousands of records per frame — render a sampled subset of lines and keep the *counters*
  exact. The rate readout must be true even when the visible lines are sampled.
- Respect `prefers-reduced-motion`: hold the counters and the final lines, drop the scroll.

---

## 13. Credits

A single-line footer, always present, in the same neutral register as the rest:

> **GrandPerspective — PDS edition.** Made by Alexandre Plennevaux.
> Treemap concept and name after *GrandPerspective* by Erwin Bonsma.

Linked to the original project. This is the mitigation for the borrowed-name risk in §15:
the debt is stated in the interface, not only in a README nobody opens. The README carries
the same credit at more length, including that GrandPerspective is GPL-licensed and that
this is an independent work, not a port or an affiliate.

---

## 14. Error handling

| Failure | Behaviour |
|---|---|
| Handle does not resolve | Loud message naming the handle. |
| PDS sends no CORS headers on `/xrpc/` | Keep the current explicit message naming `Access-Control-Allow-Origin`. Fail loudly; do not silently fall back to a public AppView, which would lose the unknown-lexicon coverage that motivates the tool. |
| Repo is empty | Stated plainly, not drawn as a blank map. |
| `getRepo` unavailable or CORS-blocked | Fall back to exhaustive `listRecords` automatically, and say in the stats line that sizes are now estimated rather than measured. |
| CAR parse failure | Do not silently fall back to a partial result. Report that the CAR was unreadable, then offer the `listRecords` path explicitly. |
| Repo exceeds the size threshold | Show real figures and let the user choose (§3.5). Declining is a valid outcome, not an error. |
| OAuth callback state expired or invalid | "Login session expired or invalid. Please retry." — a clear client-side error, not a blank or a generic failure. |
| Write scope not granted | Persistent banner; app runs read-only. |
| `putRecord` / `deleteRecord` fails | Surface the XRPC error verbatim. Leave local state untouched — never optimistically patch a write that failed. |

---

## 15. Testing

**Unit tests over the pure core**, which is the whole point of the data/render seam:

- `repo/filter.spec.js` — the most new coverage. Date bounds inclusive at both edges,
  namespace prefix matching on dot boundaries (`app.bsky` matches `app.bsky.feed.like`,
  not `app.bskyfoo.x`), empty filter means all, query matching inside nested record values,
  filters ANDing correctly.
- `repo/hues.spec.js` — hue stability: the same collection gets the same hue regardless of
  read order; shares sum to 1.
- `repo/treemap.spec.js` — existing coverage retained; aggregation flagged rather than faked
  when cells fall below the resolvable size.
- `atproto/tid.spec.js`, `atproto/audit.spec.js` — existing coverage retained, including
  that scoped auditing does not judge non-Bluesky lexicons by `app.bsky` rules.
- `atproto/car.spec.js` — parse a small fixture CAR: every record recovered, `bytes` equals
  the DAG-CBOR block length rather than a JSON re-serialization, `exact` is true, and a
  truncated or corrupt CAR raises rather than returning a partial repo.

- `repo/hittest.spec.js` — pointer coordinates resolve to the correct record, including on
  cell boundaries and inside aggregated blocks; a point in dead space resolves to nothing.
  This replaces what the DOM gave for free, so it needs real coverage.

**One regression test worth naming**, because it is the defect that motivated §3: given a
repo with one collection of 5,000 records and one of 22, the resulting records must reflect
that ratio. A reader that returns a similar count for both is the bug this spec exists to
remove.

**Visual rules are checked, not trusted.** A grep-level test asserting no `border-radius`
other than `0`, no `box-shadow`, and no `gradient` anywhere in `src/` — §11 is a standing
constraint, and standing constraints decay without a check.

**Auth is not unit tested.** It is crypto plus redirects plus a third-party server. It gets
the skill's operational smoke-test checklist, run against production after any auth-related
deploy:

1. `oauth-client-metadata.json` returns the expected `client_id`, `redirect_uris`, `scope`.
2. Sign-in reaches the Authorization Server with a PAR `request_uri`.
3. A fresh callback creates a session and the handle appears in the rail.
4. A stale or replayed callback fails with the controlled message, not a blank page.
5. Granted scopes include repo update/delete; write affordances appear.
6. A `putRecord` round-trips and the cell resizes; a `deleteRecord` removes the cell.

---

## 16. Known risks

- **CORS.** Self-hosted PDSs may not send `Access-Control-Allow-Origin` on `/xrpc/`. There
  is a `pds-on-synology` repo on tangled, so the owner may be their own failing case.
  Decision stands: fail loudly rather than fall back to an AppView.
- **`repo:*` scope support.** Recent addition; an older auth server may reject or narrow it.
  Mitigated by scope gating, not by requesting something broader.
- **Render cost at scale.** Addressed by canvas (§4.2) rather than left open. What remains
  unverified is the premise underneath it: that `treemap.js`'s 2.5 px aggregation threshold
  really does bound drawn cells to viewport area ÷ 6.25 px². That arithmetic is sound but
  has not been measured against a real large repo, and it is now load-bearing for the
  renderer choice. Measure it early; if it does not hold, WebGL is the escalation and the
  data seam keeps it cheap.
- **Hit testing is now ours.** The DOM gave pointer-to-record resolution for free; canvas
  does not. A bug in `hittest.js` means clicking a cell opens the wrong record — and with a
  delete button in that modal, wrong-record is not a cosmetic failure. Hence dedicated
  coverage in §15.
- **Memory on large repos.** Reading in full and retaining `value` means a large account's
  records live in the tab. Mitigated by the up-front size warning (§3.5), not by silent
  truncation. The threshold needs calibrating against a real large repo, not guessed.
- **CAR endpoint availability.** `getRepo` may be blocked, rate-limited, or CORS-restricted
  even where `listRecords` works. Hence the fallback — but the fallback yields estimated
  rather than measured byte sizes, and says so.
- **`did:web` resolution** is written but still untested.
- **Deployment path is permanent.** `client_id` is a URL. Moving the app invalidates every
  existing OAuth session.
- **Borrowed name.** GrandPerspective is an existing GPL'd macOS application by Erwin
  Bonsma. The concept is not ownable and the homage is deliberate. Mitigated by §13: the
  credit sits in the interface footer on every screen, not only in a README, and names the
  work as independent rather than affiliated. If Bonsma ever objects, the fallback is a
  rename — which is why §13 keeps the credit textual and the slug decision (§1) reversible
  at the cost of OAuth sessions only.

---

## 17. Deferred, with reasons

| Item | Why deferred |
|---|---|
| Bulk selection and bulk delete | The strongest feature for actual repo cleanup, and irreversible at scale. Needs a confirmation design of its own. It is the reason a right-hand panel might later exist. |
| Resolving `clock skew > 24h` | No longer blocks anything now that the stack is gone. Reported, not acted on. |
| Granular per-collection scopes | Cannot be enumerated in static metadata for unknown lexicons. Revisit if permission sets make dynamic narrowing practical. |
| Canvas / WebGL renderer | Deferred, but now the likeliest thing to be forced: removing the ceiling puts node count under the repo's control, not ours. Verify the existing area-based aggregation against a large repo before assuming it holds. The data seam makes the swap a leaf change. |
| Incremental re-read via `getRepo?since=<rev>` | The CAR endpoint accepts a revision and returns only a diff, so a re-read after edits could be cheap. Not needed while writes patch local state in place (§9). |
