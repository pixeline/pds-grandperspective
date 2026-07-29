# atproto-avatar — "Stills & Frames"

A parametric data-portrait generator. It reads **any** atproto repo — every collection,
including lexicons it has never heard of — and draws it as a rotatable stack of tiles.
Viewed head-on the stack collapses into a square: that is the avatar. Rotated, it reveals
that the square was always a sequence, and the thing invisible from the front is the
passage between states.

**Status:** untested HTML prototype in `prototype/`. It has never been run against a real
repo. Assume something is broken.

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
prototype/stills-and-frames.html   working single-file prototype, vanilla JS, CSS 3D
docs/brief.md                      aesthetic + conceptual brief, references
docs/mapping.md                    the parameter system, error taxonomy, risks
```

## First tasks, in order

1. **Run the prototype against a real repo before touching anything else.**
   Open `prototype/stills-and-frames.html`, enter `pixeline.be`, press Draw. Fix what
   breaks. Do not start the port on top of an unverified mapping.
2. **Tune the silence threshold.** It currently auto-derives as median inter-record gap
   × 10, clamped 15 min–12 h. This is a guess, and the whole tiling collapses or shatters
   depending on it. Find out what "a burst" actually means in this data.
3. **Judge the transition marks.** Seven squares stepping between two cell centres. With
   many collections active in one session this may read as spaghetti. Candidate fix:
   only draw transitions crossing a distance threshold, treating short hops as continuous
   dwelling rather than passage.
4. **Then** scaffold SvelteKit and port, splitting out the read layer:

```
src/lib/atproto/tid.js         TID → ms
src/lib/atproto/identity.js    handle → DID → PDS endpoint (did:plc + did:web)
src/lib/atproto/read.js        describeRepo + paginated listRecords
src/lib/atproto/audit.js       error taxonomy
src/lib/portrait/sessionize.js
src/lib/portrait/layout.js     slice-and-dice partition + hue assignment
src/lib/portrait/params.js     parameter defs + adaptive defaults
src/lib/components/            Stack.svelte, Rail.svelte, Legend.svelte
src/routes/+page.svelte
```

Put the full parameter set in the URL hash so any portrait is reproducible and shareable.
That is a requirement, not a nicety — under constraint 7 the parameters *are* the piece.

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
