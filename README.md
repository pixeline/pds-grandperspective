# Stills & Frames

A parametric data-portrait generator for the AT Protocol. Point it at any handle and it
reads the whole repo — every collection, including lexicons it has never seen — then draws
the result as a stack of tiles you can rotate.

Head-on, the stack collapses into a square. That is the avatar. Turn it and the square
turns out to have been a sequence: depth is silence, twist is cadence, each plate is one
session of activity.

Nothing is decorative. Every mark traces to a number in the repo, and the torn blocks are
records that genuinely fail validation.

## Run the prototype

```
open prototype/stills-and-frames.html
```

Enter a handle, press Draw. Drag to orbit, scroll to zoom.

Reads are public and unauthenticated, so no credentials are needed. A self-hosted PDS must
send `Access-Control-Allow-Origin` on `/xrpc/` for browser reads to work.

## Where things are

- `prototype/` — single-file working prototype, vanilla JS and CSS 3D
- `docs/brief.md` — what this is for and where the visual language comes from
- `docs/mapping.md` — every visual property and its data source
- `CLAUDE.md` — constraints, architecture, and what to do next
