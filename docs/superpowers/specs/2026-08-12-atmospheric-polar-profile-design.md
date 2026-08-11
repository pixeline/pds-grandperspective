# Atmospheric Polar Profile — design

**Date:** 2026-08-12
**Status:** Approved, ready for implementation plan
**Scope:** A sidebar panel that draws the loaded repo as a 7-ray polar
(radar) chart of *behavioural* activity. Reuses the existing read; adds no
network. The wider "3D atmosphere map of all users" is explicitly a **separate
future spec (#2)** and is out of scope here.

## Why this shape

A repo already tells us *how much* space each collection occupies (the
treemap). This panel answers a different question: *what kind of participant is
this account?* — Broadcaster, Listener, Repeater, Host, Curator, Connector.

The rays are behavioural modes, anchored in Forrester's **Social
Technographics** ladder (Li & Bernoff, *Groundswell*, 2008) but renamed to map
onto real atproto record types. Forrester's "Spectators" and "Inactives" are
deliberately absent: **an atproto repo records only what an account *emits*.**
Reading and lurking leave no record, so they cannot be measured or drawn.
Likes are the measurable proxy for the lightweight, receptive mode.

## Load-bearing constraints (from CLAUDE.md)

- **Every visual property traces to a number in the repo.** Each ray's radius,
  hue and saturation must name its source.
- **All reading is client-side, one repo.** This feature adds no fetch: it is a
  pure function of the records already in memory after a read.
- **Hue identifies a category; saturation carries recency; chrome is neutral.**
  Applied here: ray hue = behaviour identity, ray saturation = recency of that
  behaviour, grid/labels/polygon = neutral ink.
- **No gradient, shadow, rounded corner, or decorative motion.** Enforced by a
  style test, as elsewhere.
- **Errors and gaps are reported, never decorated.** An empty repo draws
  nothing and says so; unmatched records are surfaced, not silently absorbed.

## The seam

Same discipline as `treemap.js` → `paint.js`: pure functions emit plain data,
a painter turns data into pixels, a component hosts the painter. This is what
keeps a later WebGL/PNG swap a leaf change.

    behavior.js   records            -> behavioural counts   (pure, no DOM)
    polar.js      counts             -> ring/axis/polygon geometry  (pure, no DOM)
    polarpaint.js geometry + context -> 2D drawing            (context in, nothing out)
    PolarProfile.svelte              hosts a canvas, hover, the ⓘ popover

Because `polarpaint.js` takes any 2D context, a future avatar PNG is the same
few lines as the treemap PNG: hand the painter a 512×512 offscreen context.
That PNG export is a **stretch, not v1.**

## A. `src/lib/repo/behavior.js` — `behaviorVector(records)`

Pure function. One pass over the already-read records. Returns raw integer
counts (no scaling — scaling is `polar.js`'s job):

    {
      create, converse, amplify, react,
      curate, connect, identity,
      unclassified,           // counted, shown only behind the ⓘ popover
      lastActive: {           // ms since epoch of the most recent record per ray,
        create, converse, ...  // or null if the ray has no records. Feeds saturation.
      }
    }

Timestamps come from `tid.js` (server clock, preferred over `createdAt`), the
same source the rest of the app trusts. A ray with no decodable time contributes
to its count but not to `lastActive`.

### Classification — precise rules first, heuristic fallback second

A record is classified by its collection NSID, and for `app.bsky.feed.post` also
by its value:

| Ray          | Known NSIDs / rule                                                                                          |
|--------------|------------------------------------------------------------------------------------------------------------|
| **Create**   | `app.bsky.feed.post` with **no** `reply` field; `com.whtwnd.blog.entry`; flashes video post lexicons        |
| **Converse** | `app.bsky.feed.post` **with** a `reply` field                                                               |
| **Amplify**  | `app.bsky.feed.repost`; `app.bsky.feed.post` whose `embed.$type` is `app.bsky.embed.record` or `…recordWithMedia` (a quote) |
| **React**    | `app.bsky.feed.like`                                                                                        |
| **Curate**   | `app.bsky.graph.list`, `graph.listitem`, `graph.starterpack`, `app.bsky.feed.generator`, `app.bsky.labeler.service`, `feed.threadgate`, `feed.postgate` |
| **Connect**  | `app.bsky.graph.follow`, `app.bsky.graph.block`                                                             |
| **Identity** | `app.bsky.actor.profile`, `app.bsky.actor.status`, `chat.bsky.actor.declaration`, verification records      |

A `feed.post` is classified in priority order: **quote → Amplify**, else
**reply → Converse**, else **Create**. Each record counts once.

**Unknown apps** (`sh.tangled.*`, `events.smokesignal.*`, any unlisted NSID)
fall through to a **leaf-verb heuristic** on the last NSID segment:

    .like                    -> React
    .repost | .share         -> Amplify
    .follow                  -> Connect
    .post | .entry | .item*  -> Create      (*only if not caught above)
    .profile | .declaration  -> Identity
    .list | .generator       -> Curate

This is what lets the wider atmosphere light the rays instead of collapsing to a
Bluesky-only chart.

**Anything still unmatched** increments `unclassified` and is **never drawn**.
It is reported only inside the ⓘ popover. This mirrors the project's rule to
audit only what a lexicon actually promises: we do not force an unknown record
into a behaviour we cannot justify — we count it honestly and keep it visible on
demand.

The values needed (`reply`, `embed`) are already retained after a CAR read (the
226 MB-heap fact), so this is a field read, not a second fetch. On the
`listRecords` fallback path the values are likewise present.

## B. `src/lib/repo/polar.js` — `polarLayout(vector, opts)`

Pure. Turns counts into geometry for a square of side `opts.size`:

    { rings:   [{ r, label }],           // 10 / 100 / 1k / 10k, neutral gridlines
      axes:    [{ ray, label, angle, count,
                  r,                       // 0..1 radius fraction (see scale)
                  x, y,                    // ring-edge point for the axis line
                  px, py,                  // the plotted data point on this axis
                  hue, sat }],             // colour, see section C
      polygon: [{ x, y }] }               // the 7 data points, closed

### Radial scale — fixed log anchor

    rFrac = clamp( log10(count + 1) / log10(10000), 0, 1 )

- `count = 1` → near centre; `count = 10000` → the edge; `count > 10000` clamps
  to the edge and the panel shows a `10k+` tick so the clamp is honest, never
  silent.
- **Fixed**, not self-normalised: the polygon's **size** then reads as overall
  activity and its **shape** as personality, and two accounts are directly
  comparable. It is also the absolute vector a future map would embed, so no
  rework.
- The seven axes are independent (a person can be high-Create *and* high-React),
  which is the property share-of-total would have destroyed.

### Angles

Seven equal 51.43° sectors. **Create at 12 o'clock**, proceeding clockwise in
ladder order: Create, Converse, Amplify, React, Curate, Connect, Identity.

## C. Colour

- **Ray hue = behaviour identity.** Seven fixed hues from the golden-angle walk
  (`i * 137.507 % 360`) over the ray names in ladder order — the same technique
  `hues.js` uses for collections, so the hues are stable and well-separated.
- **Ray saturation = recency.** Derived from `lastActive[ray]`: a behaviour last
  done today is vivid; one dormant for ~a year decays toward grey. A ray with
  zero records is neutral. Exact half-life chosen in implementation (target:
  ~180 days to half-saturation); the rule, not the constant, is load-bearing.
- **Grid, rings, axis lines, labels, polygon outline = neutral ink**
  (`--ink`, `--ink-soft`). Polygon **fill = ink at low alpha** — not a ray hue,
  because the fill belongs to no single behaviour. Data points carry the hue.
- No gradient, shadow, rounded corner, or motion. The chart is static once drawn.

## D. `PolarProfile.svelte` — the panel

- Sits in the sidebar Rail, directly under the profile read / sign-in block.
- Reads the **currently-loaded repo**, whoever it is. Works unauthenticated;
  sign-in is irrelevant to viewing a profile (reads are public). `+page.svelte`
  computes `behaviorVector(records)` once after a read and passes it in.
- **Face of the panel:** the polar chart; a one-line derived **type** from the
  dominant ray(s) — *Broadcaster* (Create), *Host* (Converse), *Repeater*
  (Amplify), *Listener* (React), *Curator* (Curate), *Connector* (Connect), and
  a neutral fallback when Identity leads or the repo is tiny.
- **Hover a ray** → its exact count and last-active date (sidebar is narrow, so a
  tooltip, not permanent labels).
- **ⓘ info icon** (top corner of the panel): hover/tap reveals a popover holding
  (a) the `unclassified` count and the collections it covers, (b) a one-line
  statement that this is a **best-guess behavioural estimate** from records the
  account emitted, reading/lurking excluded, and (c) the Forrester attribution.
  This keeps the honesty on record without adding noise to the chart.
- **Edge cases, reported not decorated:** empty repo → "no records", no polygon;
  only Identity present → a single point near centre; read error upstream → the
  panel states it and draws nothing.

## E. Testing

- `behavior.spec.js`: reply vs quote vs plain-post split; each known NSID → right
  ray; unknown-app leaf-verb heuristic; the `unclassified` bucket; `lastActive`
  picks the most recent TID; empty input.
- `polar.spec.js`: log scale endpoints (1 → ~0, 10000 → 1), clamp above 10k,
  seven angles with Create at −90°, closed polygon.
- Style test: the panel's CSS contains no `border-radius`, `box-shadow`,
  `gradient`, or transition/animation on drawn marks — matching the existing
  International-Style enforcement.

## Out of scope (future spec #2)

The 3D atmosphere map — placing *many* accounts by their behaviour vectors to
find related people, with this polar chart as the hover token — requires a
population: a crawl, stored vectors, and a projection (PCA/UMAP). That is a
server-shaped problem and violates the one-repo/client-only constraint of this
tool. It gets its own spec. This panel is deliberately built as its first brick:
`behaviorVector` is the exact per-account vector that map would consume.

Also out of v1: avatar/banner PNG export of the polar chart (cheap later via
`polarpaint.js` + the `exportpng.js` pattern), and any follow/peek quick-action
(those belong to the map).
