> **Archived.** This documents the retired *Stills & Frames* stack viewer, kept
> because it records the reasoning behind the fair-reading and scoped-auditing
> decisions that are still live. The code it describes is on the
> `archive/stills-and-frames` branch. The current design is in
> `docs/superpowers/specs/2026-08-02-grandperspective-pds-edition-design.md`.

# The mapping

Under constraint 6, every visual property has a named source. This is that list. If a
property is not here, it should not be visible.

## Marks

| Visual property | Source | Notes |
|---|---|---|
| One tile | One session | Records bounded by silence; threshold is a parameter |
| Tile x/y regions | Collection NSID | Area ∝ *global* share, position constant across every tile |
| Region fill fraction | `sqrt(count in session / session size)` | Constant position, variable fill → veins through depth |
| Hue | Collection | Golden-angle walk (137.507°) over NSIDs sorted lexically |
| Saturation | Recency | `18 + 72 × life` |
| Lightness | Age | `46 + 16 × age` — older drifts pale |
| Tile opacity | Recency | `0.12 + 0.88 × life` |
| Distance between plates | Silence *preceding* that session | `6 + (silence/maxSilence)^0.45 × depthGain` |
| Cumulative rotation | Cadence, records per minute | `twist += (cadence/maxCadence) × twistGain` |
| Dashed square runs | Collection transitions | 7 squares between cell centres, hue alternating between the two collections |
| Square size in runs | Recency | `max(3, 5 × life + 2)` |
| Channel-split tear | Count of validation errors on that record | Offset `2 + errors × 3`, multiply blend |

`life = (1 - age) ^ (1 + decay × 3)`, where `age` is 0 for the newest shown session and 1
for the oldest. `decay` is an exposed parameter.

## Timestamps

**TID first, `createdAt` second.** The TID in the record key is server-assigned at write
time; `createdAt` is claimed by the client and can be anything. For a portrait of when
someone was actually active, the TID is the honest source.

TID format: 13 characters of base32-sortable (`234567abcdefghijklmnopqrstuvwxyz`), 64 bits,
top bit always 0, then 53 bits of microseconds since the Unix epoch, then 10 bits of clock
identifier. Decode, shift right 10, divide by 1000. Sanity-bound the result to
[2005, now + 1 day] and reject anything outside.

Records with no usable timestamp from either source are skipped entirely rather than
guessed at.

## Error taxonomy

The only source of glitch. All of these are computable without extra network calls.

| Error | Test |
|---|---|
| `$type` ≠ collection | Record's own `$type` disagrees with the collection it lives in |
| unparseable `createdAt` | `Date.parse` returns NaN |
| `createdAt` in the future | More than 1 h ahead of now |
| clock skew > 24h | TID timestamp and `createdAt` disagree by more than a day |
| no `createdAt` | Absent, and rkey is not the literal `self` |
| text over 300 graphemes | Exceeds the protocol maximum for posts |
| facet byte range outside text | `byteStart`/`byteEnd` outside the UTF-8 length, or inverted |
| blob without mimeType | An embedded image lacking `image.mimeType` |
| reply missing root or parent | A `reply` object without both refs |

Deliberately **not** included: anything requiring a second fetch to verify, such as
resolving whether a reply parent still exists or whether a referenced DID is live. Those
are real errors and would be good marks, but they multiply request count by the size of the
repo. Revisit only with a batching strategy.

## Adaptive defaults

The system must handle any repo, not be tuned to one. So the defaults derive from the data:

- **Silence threshold** = median inter-record gap × 10, clamped to [15 min, 12 h], rounded
  to 5 min. Exposed as a slider afterwards. **This is the weakest link in the whole
  system** — the tiling collapses into one slab or shatters into hundreds of thin plates
  depending on it.
- **Cadence normalisation** = per-session records-per-minute divided by the maximum across
  shown sessions. Relative, so a slow repo still reads as having fast and slow passages.
- **Silence normalisation** = same approach, against the longest shown silence, with a 0.45
  exponent so one nine-month absence does not flatten every ordinary overnight gap to zero.
- **Region partition** = recursive slice-and-dice, alternating axis, splitting the sorted
  collection list at the half-mass point. Deterministic, so positions are stable between
  runs and between repos of the same shape.

## Open problems

1. **Transition marks may read as spaghetti** when many collections are active in one
   session. Candidate fix: only draw transitions crossing a distance threshold, treating
   short hops as continuous dwelling rather than passage. Untested.
2. **Sessions are defined by silence, but silence is invisible in the frontal view.** The
   frontal projection therefore throws away the axis that defines the tiling. This is
   intentional — frontal is meant to be lossy, that is what makes it an avatar rather than
   a chart — but it is worth checking whether the frontal view is still *interesting* once
   history collapses, or just mud. If mud, the fix is probably fewer tiles, not more colour.
3. **Cadence and silence are correlated.** Fast bursts tend to follow long silences. If the
   twist and the plate spacing end up encoding roughly the same thing, one of them is
   wasted and should be reassigned — the create-versus-react ratio is the obvious
   substitute for twist.
4. **No export.** CSS 3D cannot be rasterised easily, so there is no PNG out. The URL-hash
   parameter state is the intended substitute for sharing, but if an actual image file is
   wanted, that forces the canvas renderer.
