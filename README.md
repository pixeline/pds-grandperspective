# Stills & Frames

A parametric data-portrait generator for the AT Protocol. Point it at any handle and it
reads the whole repo — every collection, including lexicons it has never seen — then draws
what it found.

Nothing is decorative. Every mark traces to a number in the repo, and the torn blocks are
records that genuinely fail validation.

## Two viewers over one read

**Stills & Frames** — the repo as time. Sessions of activity become plates in a stack:
depth is silence, twist is cadence, colour is lexicon. Head-on the stack collapses into a
square, and that square is the avatar. Turn it and the square turns out to have been a
sequence. Fly through it.

**GrandPerspective** — the repo as space. One cell per record, nested by lexicon and
**sized by stored bytes**, so a handful of long documents outweighs hundreds of tiny
stubs. This is the disk-usage reading of the same data.

Both are hoverable and clickable: every mark opens that exact record on
[pdsls.dev](https://pdsls.dev).

## Run it

```bash
npm install
npm run dev
```

Type a handle, pick a viewer. Drag to orbit, scroll to fly through time, shift+scroll to
zoom, W/S/A/D to steer.

```bash
npm test     # unit tests over the pure core
npm run build  # static output in build/, relative paths
```

Reads are public and unauthenticated, so no credentials and no server are involved — all
of it happens in the browser. A self-hosted PDS must send `Access-Control-Allow-Origin` on
`/xrpc/` for that to work.

Every portrait is a URL. The handle, viewer and full parameter set round-trip through the
hash, so `#v=map&h=pixeline.be&twist=24` is reproducible and shareable.

## Where things are

- `src/lib/atproto/` — identity, fair paginated reading, TID decoding, the error taxonomy
- `src/lib/portrait/` — sessions, layout, treemap, parameters. Pure functions, no DOM
- `src/lib/components/` — the viewers and the instrument panel
- `prototype/` — the original single-file prototype, kept for reference only
- `docs/brief.md` — what this is for and where the visual language comes from
- `docs/mapping.md` — every visual property and its data source
- `CLAUDE.md` — constraints, architecture, and what to do next

The mapping emits plain data — a plate is numbers plus a list of marks — and the components
render it. That seam is what keeps the mapping testable.
