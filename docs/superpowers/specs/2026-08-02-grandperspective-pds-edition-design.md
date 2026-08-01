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

- Read any repo by handle or DID, unauthenticated.
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
  - The `PARAMS` array is deleted. Five of six entries were stack parameters
    (`gap`, `twist`, `depth`, `decay`, `tiles`); only `cap` survives, and it becomes a
    plain number field rather than a slider.
- `portrait/portrait.spec.js` splits into `repo/treemap.spec.js`, `repo/hues.spec.js`,
  `repo/filter.spec.js`, `atproto/tid.spec.js`, `atproto/audit.spec.js`. Stack assertions
  are dropped. The suite stays green at every step of the strip.

### 2.5 Documentation

- `docs/brief.md` and `docs/mapping.md` → `docs/archive/`. They describe the stack, but
  they also record the reasoning behind decisions still live in `read.js` and `audit.js`.
  Deleting them would lose that.
- `CLAUDE.md` is rewritten to describe this app.
- A `README.md` credits GrandPerspective by Erwin Bonsma as the influence the name and
  the treemap interaction come from.

### 2.6 Layout after the strip

```
src/lib/atproto/tid.js          TID → ms (server clock, preferred over createdAt)
src/lib/atproto/identity.js     handle → DID → PDS endpoint (did:plc + did:web)
src/lib/atproto/read.js         describeRepo + FAIR paginated listRecords
src/lib/atproto/audit.js        error taxonomy, scoped per lexicon
src/lib/atproto/typeahead.js    actor search (typeahead.waow.tech)
src/lib/atproto/session.js      NEW — OAuth client, sign in/out, granted scopes
src/lib/atproto/write.js        NEW — putRecord / deleteRecord
src/lib/repo/hues.js            NEW — collection → hue and share (extracted)
src/lib/repo/filter.js          NEW — collection / timeframe / query filtering
src/lib/repo/treemap.js         nsid nesting + squarified layout
src/lib/repo/format.js          formatters
src/lib/repo/urlstate.js        hash round-trip
src/lib/components/             Gate, Rail, Treemap, Tip, Typeahead, RecordModal, SignIn
src/routes/+page.svelte         orchestration only
static/oauth-client-metadata.json
```

**The seam that matters, unchanged:** `treemap.js` and `filter.js` emit plain data — no
DOM, no CSS. Components render that. This is what keeps the mapping testable and makes a
future canvas or WebGL renderer a leaf change rather than a rewrite.

---

## 3. Read path

One change to `src/lib/atproto/read.js`: retain `r.value` on each record rather than
measuring its byte length and discarding it.

```js
records.push({
  col: st.col, ts, rkey,
  errs: errNames.length, errNames,
  bytes: JSON.stringify(r.value ?? null).length,
  value: r.value          // NEW — search needs something to search
});
```

**Why.** Full-content search is the agreed behaviour (§5), and it is the only version that
works for lexicons the app has never seen. The modal then also has the record JSON without
a second fetch.

**Cost.** Retained bytes are approximately the `bytes` total already computed and displayed
— a few MB at the 4000-record default, well within a browser tab. At the 12000 ceiling it
grows proportionally; the stats line already surfaces stored size, so the cost is visible
to the user rather than hidden.

**Unchanged, and load-bearing.** Both findings that produced the current read path stay:

- **Fair reading.** Pass 1 samples every collection with a small page; pass 2 round-robins
  full pages among the unfinished. A sequential alphabetical scan let `app.bsky.feed.like`
  consume the entire 4000 ceiling and leave 181 of 195 collections unread. Never
  reintroduce a sequential scan.
- **Scoped auditing.** Rules apply only to what a lexicon actually promises. Judging
  non-Bluesky lexicons by `app.bsky`'s schema produced 304 false "invalid records"; scoping
  dropped it to 64 real ones.

**Reads stay unauthenticated even when signed in.** `describeRepo` and `listRecords` are
public. Routing them through an OAuth-bound agent would send them via the user's PDS acting
as an AppView proxy — a contract non-`bsky.social` deployments (eurosky.social, self-hosted,
Cocoon) do not reliably implement, and a common source of `401` after an otherwise successful
OAuth. The signed-in state changes writes only.

---

## 4. Treemap

Unchanged from the current `treemap.js` and `Treemap.svelte`, which are kept as they are:
NSID-nested squarified layout, one cell per record, sized by stored bytes or by record
count, with blocks too small to resolve shown whole and labelled as aggregated rather than
faked.

The only change is the input: it receives the filtered record set (§5) rather than all
records.

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
| `cap` | record ceiling, omitted when default |
| `c` | comma-separated collection/prefix filter, omitted when empty |
| `from`, `to` | timeframe bounds as ISO dates, omitted when unset |
| `q` | search query, omitted when empty |

The `v` (viewer) key is removed — there is one viewer. Stack keys (`gap`, `twist`, `depth`,
`decay`, `tiles`, `cam`, `ax`, `ay`) are removed.

The hash is read once on mount, not in a reactive effect. An effect that both reads and
writes `params` makes itself its own dependency and Svelte rejects it — this was learned
the hard way and the fix must be preserved.

---

## 8. Authentication

### 8.1 Client type and library

A **public client** — browser SPA, no server, no client secret, per the skill's app-pattern
decision. `token_endpoint_auth_method: "none"`.

Library: **`@atproto/oauth-client-browser`**. This is the project's first runtime dependency
(`package.json` currently has none). The trade is deliberate: the library owns PAR, PKCE
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
4. **Record ceiling** — number field, the one surviving parameter.
5. **Measured** — PDS host, collections, records read, stored size, first record, whether
   the ceiling was hit.
6. **Legend** — hue per collection, clickable to filter.
7. **Errors** — the audit tally.

The rail has no drag interaction, so nothing here captures the pointer.

---

## 11. Error handling

| Failure | Behaviour |
|---|---|
| Handle does not resolve | Loud message naming the handle. |
| PDS sends no CORS headers on `/xrpc/` | Keep the current explicit message naming `Access-Control-Allow-Origin`. Fail loudly; do not silently fall back to a public AppView, which would lose the unknown-lexicon coverage that motivates the tool. |
| Repo is empty | Stated plainly, not drawn as a blank map. |
| Record ceiling hit | Stats line says so and points at the ceiling field. |
| OAuth callback state expired or invalid | "Login session expired or invalid. Please retry." — a clear client-side error, not a blank or a generic failure. |
| Write scope not granted | Persistent banner; app runs read-only. |
| `putRecord` / `deleteRecord` fails | Surface the XRPC error verbatim. Leave local state untouched — never optimistically patch a write that failed. |

---

## 12. Testing

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

## 13. Known risks

- **CORS.** Self-hosted PDSs may not send `Access-Control-Allow-Origin` on `/xrpc/`. There
  is a `pds-on-synology` repo on tangled, so the owner may be their own failing case.
  Decision stands: fail loudly rather than fall back to an AppView.
- **`repo:*` scope support.** Recent addition; an older auth server may reject or narrow it.
  Mitigated by scope gating, not by requesting something broader.
- **DOM node count.** One `div` per record. The stack's 140-tile cap is gone, so the treemap
  is now the only consumer — and filtering reduces rather than increases node count. If it
  drags, a canvas renderer is a leaf change behind the data seam.
- **Large repos.** Ceiling defaults to 4000, accepts up to 12000, 80 pages per collection.
  Repos in the hundreds of thousands need a different strategy than "read everything", and
  retaining `value` raises the memory cost of that ceiling.
- **`did:web` resolution** is written but still untested.
- **Deployment path is permanent.** `client_id` is a URL. Moving the app invalidates every
  existing OAuth session.
- **Borrowed name.** GrandPerspective is an existing GPL'd macOS application by Erwin
  Bonsma. The concept is not ownable and the homage is deliberate, but the name is credited
  in the README rather than presented as original.

---

## 14. Deferred, with reasons

| Item | Why deferred |
|---|---|
| Bulk selection and bulk delete | The strongest feature for actual repo cleanup, and irreversible at scale. Needs a confirmation design of its own. It is the reason a right-hand panel might later exist. |
| Resolving `clock skew > 24h` | No longer blocks anything now that the stack is gone. Reported, not acted on. |
| Granular per-collection scopes | Cannot be enumerated in static metadata for unknown lexicons. Revisit if permission sets make dynamic narrowing practical. |
| Canvas / WebGL renderer | Only if DOM node count actually drags. The data seam makes it a leaf change. |
