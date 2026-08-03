# Mobile polish — wifi warning, label overlap, mobile font size, standard.site block

## Problem

Five independent user reports on a phone-class device (Fairphone 4, Android
Chrome):

1. **Data budget** — reading a 187k-record PDS is on the order of tens of MB.
   The user wants a heads-up before paying for it on a metered connection.
   Two surfaces: the gate (pre-consent, for everyone) and the firehose (during
   read, for slow connections specifically).
2. **Controls button covers the top-left cell label** — on mobile the rail
   toggle button is fixed at top-left, and the painter draws the first block's
   collection label at `(b.x, b.y)` — usually `(0, 0)`. The two collide.
3. **Canvas labels are too small to read on Android Chrome** — `LABEL_FONT_PX`
   in `paint.js` is `8.5`, an absolute pixel value. The mobile media query in
   `Rail.svelte` already raises body text; the canvas painter is unaware.
4. **`standard.site` redirects to a placeholder page** — when a record's
   `subject.uri` or its own NSID resolves to `standard.site`, the "Open on
   <domain>" button in `RecordModal` opens a URL the user did not ask for.
   The redirect is broken enough that the URL should not launch at all.

## Approach

Four independent fixes, each landing in the one obvious place. No new state
shape; the existing `phase`/`status`/`data`/`selected` flow carries them all.

### 1. Wifi warning on slow networks

New module `src/lib/util/connection.js` exposes `getConnection()` returning:

```js
{
  effectiveType: 'slow-2g' | '2g' | '3g' | '4g' | null,
  saveData: boolean,
  isSlow: boolean
}
```

`isSlow` is true when `saveData` is true OR `effectiveType` is `slow-2g`, `2g`,
or `3g`. When `navigator.connection` is absent (desktop, Safari, iOS where
the API isn't supported), returns `{effectiveType: null, saveData: false,
isSlow: false}` — desktop users never see the warning. The module never throws.

New component `src/lib/components/WifiWarning.svelte` renders a single-line
banner with copy: *"Reading a PDS can use tens of MB. Switch to wifi to avoid
data charges."* It carries a single dismiss button: *"Continue anyway"*.
Clicking it sets a dismissed flag in the parent for the rest of the session.

`+page.svelte` reads `getConnection()` once on mount, then registers a
`change` listener on `navigator.connection` if present. The listener is
removed on `onDestroy`. State `connectionDismissed = $state(false)`.

The banner is rendered when all of:
- `busy` is true (a read is in progress)
- `connection.isSlow` is true
- `connectionDismissed` is false

It is rendered immediately before `<Firehose>` in DOM order, inside the same
`.stage` parent. Reasoning: the firehose is already the only thing on screen
during a read; placing the warning there means the warning shares the
firehose's footer (already styled for narrow viewports) and doesn't introduce
a new stacking context. Visually, the banner sits at the top of the stage
area; the firehose panel sits below it.

The gate gets a parallel signal: a fourth bullet in `.facts` reading exactly
*"Reading a PDS can use tens of MB."* — same font and weight as the other
three facts above it, not styled as a warning. Reasoning: the gate's job is
to set expectations, not to gate decisions, and the three facts already say
honest things like "Read straight from the PDS" and "from the repository's
CAR export." A data-budget line in the same register makes the cost of
admission part of the project description, not a warning to be dismissed.
The wifi-connection warning during the read is for slow connections only;
this line is for everyone.

`connection.js` lives in `src/lib/util/`, not `src/lib/atproto/`, because it
is a generic browser-API wrapper with no atproto domain knowledge.

### 2. Canvas label overlap with controls button

`paintMap(ctx, map, {w, h, ink, background, labels, labelScale, labelInset})`
gains one optional argument. `labelInset` defaults to `{top: 0, left: 0}`.

The label-painting loop respects `labelInset`: it skips blocks whose
`b.y < labelInset.top` OR `b.x < labelInset.left`. Squarified treemap blocks
are laid out top-left first, so this drops exactly the labels that would
collide with the fixed `.railtoggle` button at `top: 12px; left: 12px;
min-height: 44px`. The cells themselves are still drawn — only the label
plate is omitted. Touch-to-open still works on those cells.

`Treemap.svelte` passes `labelInset = w <= 820 ? {top: 56, left: 0} :
{top: 0, left: 0}`. The `56` is `controls-button-height (~44px) + 12px top
margin` from the existing media query.

The on-screen `<canvas>` is the only caller of `paintMap` that uses
`labelInset`. PNG export — which lives in `exportpng.js` and calls `paintMap`
directly — passes `{labelInset: {top: 0, left: 0}, labelScale: 1}` always,
so exported PNGs preserve the original label positions.

### 3. Mobile font scale

`labelScale` is already an existing argument. The change is the *call site*:
`Treemap.svelte` sets `labelScale = w <= 820 ? 1.3 : 1`. Result: canvas labels
on mobile render at `8.5 × 1.3 ≈ 11.05px`, which matches the existing mobile
legend text size of `11.5px` set in `Rail.svelte`'s `@media (max-width:
820px)` block.

`LABEL_FONT_PX = 8.5` stays unchanged — that constant is the desktop default.
`labelScale` is the multiplier; both call sites (on-screen and PNG export)
control it explicitly.

`labelScale = 1.3` scales both the label font and the label plate proportionally
(`LABEL_FONT_PX * s`, `LABEL_BOX_PX * s`, `LABEL_PAD_PX * s` in `paint.js`),
so larger labels take more of their cell. With 11.05px mono on a 390px phone,
some labels that fit at 8.5px may be skipped at 1.3x because they no longer
fit in their cell — `paint.js` does not skip them; it draws them at the
plate's origin, and the plate's larger footprint simply covers more of the
cell. This is acceptable — on a phone, illegible labels are worse than
labels that fill more of a small cell, and `Treemap.svelte`'s tap-to-open
path is the rich-detail fallback.

### 4. `standard.site` block

New constant `BLOCKED_DOMAINS = new Set(['standard.site'])` in `appOf.js`,
with a comment explaining why (placeholder page, redirect is lossy, the
project does not benefit from driving traffic there).

`appLinkFor(nsid, did, rkey, value)` returns `null` if either:
- The record's own `appDomainOf(nsid)` resolves to a blocked domain
- The subject branch's `appDomainOf(subjectRef.collection)` resolves to a
  blocked domain (fall through to the record's own link in that case, which
  is then re-checked)

`RecordModal.svelte` already renders the "Open on <domain>" button only when
`appLink` is truthy, so no UI change is needed beyond the `appLinkFor` short
circuit. The "Open on pdsls.dev" button stays — that always works.

## Components

- `src/lib/util/connection.js` — new
- `src/lib/components/WifiWarning.svelte` — new
- `src/lib/components/Gate.svelte` — add fourth fact bullet
- `src/lib/repo/paint.js` — `paintMap` gains optional `labelInset`
- `src/lib/components/Treemap.svelte` — passes `labelInset` and mobile `labelScale`
- `src/lib/repo/appOf.js` — `BLOCKED_DOMAINS` set + return-`null` short circuit
- `src/routes/+page.svelte` — wire connection state + render `WifiWarning`
- `src/app.html` — no change

## Data flow

```
navigator.connection ──► getConnection() ──► +page.svelte ──► WifiWarning
                                                          └──► dismiss flag
                                                                  │
                                                                  ▼
                                                              local state

Treemap props (records, hueOf, w, h) ──► Treemap.svelte
                                         │
                                         ├──► w <= 820 ?
                                         │     ├── labelInset = {top: 56, left: 0}
                                         │     └── labelScale = 1.3
                                         └──► w > 820 ?
                                               ├── labelInset = {0, 0}
                                               └── labelScale = 1
                                         │
                                         └──► paintMap(ctx, map, {...})

Record value, did, col ──► appLinkFor(nsid, did, rkey, value)
                            │
                            ├──► subject parsed?  ──► subjectDomain ──► blocked?
                            │                                          ├── YES → fall through
                            │                                          └── NO  ──► use it
                            └──► own domain      ──► blocked?
                                                       ├── YES → null
                                                       └── NO  ──► use it
```

## Error handling

- `getConnection()` never throws. Absent API returns `{isSlow: false}`.
- `change` listener only registered when `navigator.connection` exists.
  `removeEventListener` paired with registration, both guarded by a feature
  check.
- `paintMap` with `labelInset` does no input validation — it is an internal
  contract, never user-facing.
- `appLinkFor` returns `null` on blocked domains; `RecordModal` already
  handles `null` cleanly (the button simply does not render).

## Testing

- `connection.spec.js`: `getConnection()` returns the right shape with mocked
  `navigator.connection`. `isSlow` is `true` for each of `slow-2g`, `2g`,
  `3g`. `isSlow` is `true` for any `effectiveType` when `saveData: true`. The
  no-API case returns `{isSlow: false}` and never throws.
- `paint.spec.js`: `paintMap` with `labelInset: {top: 50, left: 0}` produces
  no label-fill calls for any block at `y < 50`. `paintMap` with
  `labelScale: 1.3` sets `ctx.font` to a string starting with `~11.05px`
  (matching `LABEL_FONT_PX * 1.3` to within rounding).
- `appOf.spec.js`: `appLinkFor` for a record whose NSID resolves to
  `standard.site` returns `null`. `appLinkFor` for a record whose
  `subject.uri` collection resolves to `standard.site` falls through to the
  record's own link, and if THAT also resolves to `standard.site` returns
  `null`. A record pointing at `standard.site` from a normal domain still
  resolves to that normal domain.
- Existing `paint.spec.js` and `appOf.spec.js` tests keep passing with the
  new optional arguments defaulting to no-change behavior.
- Manual: open `npm run dev:mobile`, navigate to a known-large repo
  (e.g. `pfrazee.com`), confirm the wifi banner appears when the connection
  is throttled to Slow 3G in DevTools. Confirm the railtoggle button no
  longer covers the top-left cell label. Confirm cell labels are legible at
  11px mono on the phone screen. Confirm the gate's facts list shows the
  four bullets including the data-budget line.

## Out of scope

- A "you're on wifi" indicator. Reverse-detection is unreliable.
- A pre-read size estimator. The wifi warning is a heads-up, not a budget
  gate; the existing `size-limit` gate at 150 MB of CAR is the hard ceiling.
- Changing any other text in the app beyond the canvas painter. The mobile
  Rail/Gate text is already at 11.5px and above; the canvas painter was the
  outlier.
- Blocklists beyond `standard.site`. If others come up, add them to
  `BLOCKED_DOMAINS` with the same justification comment.
