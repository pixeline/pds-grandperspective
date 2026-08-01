# atproto-avatar — "Stills & Frames"

A parametric data-portrait generator. It reads **any** atproto repo — every collection,
including lexicons it has never heard of — and draws it as a rotatable stack of tiles.
Viewed head-on the stack collapses into a square: that is the avatar. Rotated, it reveals
that the square was always a sequence, and the thing invisible from the front is the
passage between states.

**Status:** SvelteKit app in `src/`, verified against `pixeline.be` (195 collections,
~4k records, PDS `eurosky.social`). The original single-file prototype is kept in
`prototype/` as a reference, but it is no longer the thing being developed.

Two viewers over one read:
- **Stills & Frames** (`#v=stack`) — sessions as a stack in time, flown through.
- **GrandPerspective** (`#v=map`) — the repo as occupied space, one cell per record,
  **sized by stored bytes** so "disk usage" is literally what it measures.

---

## Hard constraints

These are decisions, not preferences. Overturning one needs a reason, not a hunch.

1. **Never React. Use SvelteKit.** Standing preference, applies to this and every project.
2. **All repo reading happens client-side, in the browser.** No server, no proxy, no
   credentials. The tool has to work for anyone on their own handle, and public XRPC reads
   need no auth. This also means the browser's CORS rules are a real constraint (see
   Known risks).
3. **Glitch comes only from real errors.** Invalid records, clock skew, out-of-range
   facets. Never a decorative glitch filter. A clean repo draws a clean plate, and that is
   the honest output — not a bug to design around.
4. **No lighting, no shading, no gradients in the 3D.** Unlit flat planes only. Light is
   not a parameter present in the data, so it gets no vote in the image.
5. **Asymmetric. No mirroring, no radial symmetry.** Symmetry repeats a quadrant instead
   of showing a passage — it is a machine for hiding exactly what this piece is about.
6. **Every visual property traces to a number in the repo.** If you cannot name the
   source of a mark, do not draw it. Hash-seeded noise presented as portraiture is the
   failure mode this project exists to avoid.
7. **The parameter panel is part of the work, not documentation of it.** After LAb[au]'s
   metadesign: the system is the artifact, the image is one instantiation. Exposed
   parameters, visible measurements, and a legend are load-bearing.

## Design lineage

Mondrian's *Broadway Boogie Woogie* (syncopated grid, dashed runs of small colour blocks),
generative art, glitch art as the aesthetics of genuine error, LAb[au]'s metadesign
(design the system, not the form), and Marin Kasimir's *Stills & Frames* / *From here to
there* — the in-between state as the subject rather than the endpoints. Full brief in
`docs/brief.md`.

The governing idea, in the owner's words: lexicon is *the space where I dwell*; time is
*what defines me, now being who I am, and every passing second less and less
representative of who I am, for I have changed*. Hence: collections hold fixed positions,
and the past stays visible but desaturates rather than being dropped.

## The mapping

Full table, error taxonomy, and adaptive-default rules in `docs/mapping.md`. Summary:

| Property | Source |
|---|---|
| One tile | One session — records bounded by silence |
| Tile x/y regions | Collection NSID, area ∝ global share, constant across all tiles |
| Region fill | That collection's share within this session |
| Hue | Collection, golden-angle walk over sorted NSIDs |
| Saturation, opacity | Recency, with an exposed decay exponent |
| Distance between plates | Length of the silence preceding that session |
| Cumulative rotation | Cadence (records/min), accumulating → helix |
| Dashed square runs | Collection *transitions* — the in-between as subject |
| Channel-split tear | Real invalid records only |

Timestamps come from **TID decoding first**, `createdAt` second. The TID is server-assigned
and the `createdAt` is user-claimed; their disagreement is itself one of the glitch sources.

## Layout

```
src/lib/atproto/tid.js            TID → ms (server clock, preferred over createdAt)
src/lib/atproto/identity.js       handle → DID → PDS endpoint (did:plc + did:web)
src/lib/atproto/read.js           describeRepo + FAIR paginated listRecords
src/lib/atproto/audit.js          error taxonomy, scoped per lexicon
src/lib/atproto/typeahead.js      actor search (typeahead.waow.tech)
src/lib/portrait/sessionize.js    silence → sessions + adaptive threshold
src/lib/portrait/layout.js        partition, hues, buildStack → plain mark arrays
src/lib/portrait/treemap.js       nsid nesting + squarified layout
src/lib/portrait/params.js        parameter defs, formatters, hash round-trip
src/lib/portrait/portrait.spec.js unit tests over the whole pure core
src/lib/components/               Gate, Rail, Stack, Treemap, Tip, Typeahead
src/routes/+page.svelte           orchestration only
prototype/stills-and-frames.html  original single-file prototype, reference only
docs/brief.md, docs/mapping.md    brief, parameter system, error taxonomy, risks
```

`npm run dev` · `npm test` · `npm run build` (static, relative paths — the `build/`
folder can be dropped into any subfolder of pixeline.be).

**The seam that matters:** `layout.js` and `treemap.js` emit plain data — a plate is
numbers plus a list of marks, with no DOM and no CSS. Components render that. This is
what keeps the mapping testable and makes swapping CSS 3D for WebGL a leaf change
rather than a rewrite.

## Findings that are now load-bearing

- **Read fairly or the portrait lies.** Reading collections alphabetically to
  exhaustion let `app.bsky.feed.like` eat the whole 4000 ceiling, leaving 181 of 195
  collections unread and drawing a monochrome fog. `read.js` samples every collection
  first, then round-robins. Never reintroduce a sequential scan.
- **Audit only what a lexicon actually promises.** All 304 "invalid records" on
  pixeline.be were non-Bluesky lexicons judged by `app.bsky`'s schema — long documents
  flagged for exceeding a 300-grapheme post limit, records flagged for lacking a
  top-level `createdAt` they never declared. Scoping the rules dropped it to 64 real
  errors. Constraint 3 is about the auditor being right, not just the data.
- **Depth runs backwards from now.** The newest session sits where the viewer stands;
  the past recedes. An earlier build had this inverted, so travel ran into the future.
- **Pointer capture eats clicks.** A drag handler that captures on every `pointerdown`
  swallows clicks on any child control, and retargets `click` to the container. Guard
  the press, and detect taps on `pointerup` with a movement threshold.
- **`window.open` with a features string is a popup**, and pop-up blockers kill it
  silently. Use a synthetic `<a target="_blank">`.

## Remaining tasks, in order

1. **Judge the transition marks.** Seven squares stepping between two cell centres.
   At twist 16° with many collections active in one session this can read as
   spaghetti. Candidate fix: only draw transitions crossing a distance threshold,
   treating short hops as continuous dwelling rather than passage.
2. **Decide what `clock skew > 24h` means.** It is now the dominant glitch source
   (62 records, all non-Bluesky). Some of it is likely legitimate backdating of
   imported content, not error — in which case it should not tear the plate.
3. **Per-viewer routes.** Both viewers currently live on `/` behind `#v=`. For
   presentation they probably want `/stills-and-frames` and `/grandperspective`
   with their own titles and OG images.
4. **Link the two viewers.** GrandPerspective is a census of the whole repo while
   the stack is a biography; letting the flight position filter the treemap would
   connect them.
5. **Large repos.** The ceiling is 12000 records. Hundreds of thousands needs a
   different strategy than "read everything", and the DOM renderer will be the
   first thing to break — see the seam note above.

The full parameter set round-trips through the URL hash (`params.js`), so any portrait
is reproducible and shareable. That is a requirement, not a nicety — under constraint 7
the parameters *are* the piece.

## Known risks

- **CORS.** Self-hosted PDSs may not send `Access-Control-Allow-Origin` on `/xrpc/`.
  Relevant here: there is a `pds-on-synology` repo on tangled, so the owner may be their
  own failing case. Decide whether to fall back to reading via a public AppView (loses the
  unknown-lexicon coverage that motivates the whole project) or to document the header
  requirement and fail loudly. Prefer failing loudly.
- **DOM node count.** CSS 3D with one div per mark. Currently capped at 140 tiles and 48
  transitions per tile. If it drags, consider a canvas renderer with a hand-rolled painter's
  algorithm — but keep the flat unlit look exactly.
- **Large repos.** Record ceiling defaults to 4000 with a slider to 12000. Pagination is
  80 pages per collection maximum. Repos in the hundreds of thousands will need a different
  strategy than "read everything".
- **`did:web` resolution** is written but completely untested.
