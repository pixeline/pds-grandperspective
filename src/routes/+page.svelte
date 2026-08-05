<script>
  import { onMount } from "svelte";
  import Gate from "$lib/components/Gate.svelte";
  import Rail from "$lib/components/Rail.svelte";
  import Treemap from "$lib/components/Treemap.svelte";
  import Firehose from "$lib/components/Firehose.svelte";
  import RecordModal from "$lib/components/RecordModal.svelte";
  import Tip from "$lib/components/Tip.svelte";
  import WifiWarning from "$lib/components/WifiWarning.svelte";
  import { readRepo } from "$lib/atproto/read.js";
  import { createSessionStore } from "$lib/atproto/session.svelte.js";
  import { collectionHues } from "$lib/repo/hues.js";
  import { applyFilters } from "$lib/repo/filter.js";
  import { resolveHit } from "$lib/repo/resolveHit.js";
  import { selectDominantCollection } from "$lib/repo/dominance.js";
  import { defaultState, fromHash, toHash } from "$lib/repo/urlstate.js";
  import { getConnection } from "$lib/util/connection.js";
  import { PREFERENCES_EVENT, STORAGE_KEY, loadPreferences } from "$lib/preferences.js";

  const session = createSessionStore();

  let handle = $state("");
  // Draft input can change freely; URL state is derived from this committed
  // handle only after an intentional action (pick/enter/read).
  let committedHandle = $state("");
  let weigh = $state("bytes");
  let filters = $state({ hidden: new Set(), from: null, to: null, query: "" });
  let microblogging = $state("bsky");
  let viewer = $state("pdsls.dev");

  // Critical 1 survived three review rounds partly because these were
  // `$state(null)` with no annotation: TypeScript infers `null`, narrows
  // every later read of `data.records` etc. to `never`, and gives up on
  // the whole file rather than catching a mis-shaped value in `selected`.
  // Annotating the shapes that actually flow through these is what makes
  // passing a raw (valueless) hit to RecordModal a compile error again.
  /** @type {Awaited<ReturnType<typeof readRepo>> | null} */
  let data = $state(null);
  /** @type {ReturnType<typeof collectionHues> | null} */
  let hues = $state(null);
  let status = $state("idle");
  let busy = $state(false);
  /** @type {string | null} */
  let error = $state(null);
  /** @type {import('$lib/repo/types.js').Hit | null} */
  let hover = $state(null);
  /** @type {import('$lib/repo/types.js').ModalRecord | null} */
  let selected = $state(null);
  let entered = $state(false);
  // Narrow viewports only. Above the breakpoint in this file's <style> the rail
  // is a permanent column and this is inert -- there is no state to keep in
  // sync with the media query, because the media query alone decides whether
  // the rail is a column or a drawer, and this only says whether the drawer is
  // showing.
  let railOpen = $state(false);
  // Keys (`col/rkey`) of records edited in this session, kept separate from
  // `data.exact`/`data.source` -- see the stats derivation below for why.
  let editedKeys = $state(new Set());

  function syncPreferences() {
    const prefs = loadPreferences();
    microblogging = prefs.microblogging;
    viewer = prefs.viewer;
  }
  // Session-scoped dismiss for the slow-network warning banner. The page owns
  // dismissed state so the same WifiWarning instance handles one read's banner;
  // a fresh read on a slow network shows it again only after a page reload.
  let connectionDismissed = $state(false);
  // `navigator.connection` is absent on iOS Safari and most desktops; the
  // module returns isSlow:false in that case, so the banner is simply never
  // shown -- and listening for `change` is unnecessary for a single read
  // session, where the user either is or isn't on a slow network at the moment
  // they pressed Read. Reading once on mount keeps the wiring minimal.
  const connection = $derived(getConnection());

  // The collection auto-hidden at the end of the read that produced `data`
  // (see draw()), and its share of that read's total bytes -- or null if
  // nothing was dominant enough, or the read suppressed auto-hide because an
  // explicit `hide=` was already in the URL. This is set once, at read
  // completion (a one-shot action), never watched and re-applied afterward.
  // `autoHiddenNotice` below is what actually decides whether Rail shows
  // anything: if the user clicks "Show all" (or otherwise removes this
  // collection from filters.hidden), the notice must disappear along with
  // it, without this code re-adding the collection or re-triggering.
  /** @type {{col: string, share: number} | null} */
  let autoHidden = $state(null);
  const autoHiddenNotice = $derived(
    autoHidden && filters.hidden.has(autoHidden.col) ? autoHidden : null,
  );

  // firehose state
  let phase = $state("resolving");
  let gotBytes = $state(0);
  let gotRecords = $state(0);
  /** @type {Array<{ts: number|null, col: string, rkey: string, bytes: number}>} */
  let lines = $state([]);
  let startedAt = $state(0);
  let elapsed = $state(0);

  /** @type {AbortController | null} */
  let ac = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let ticker = null;

  // `.by(() => ...)` rather than a bare `$derived(expr)`: at the top level of
  // the script block, `expr` runs in the SAME linear control flow as the
  // `let data = $state(null)` declaration a few lines up, so TypeScript's
  // flow analysis (correctly, for that literal position) narrows `data` to
  // exactly `null` -- there is no other code between the two lines that
  // could have assigned anything else -- and `data ? data.records : ...`
  // narrows the truthy branch to `never`. Wrapping the expression in a
  // closure is what makes TS use the annotated type instead: a closure can
  // run after `data` has been reassigned (in `draw()`, `onchanged()`), so TS
  // falls back to the declared type rather than the point-in-time flow type.
  const filtered = $derived.by(() =>
    data ? applyFilters(data.records, filters) : null,
  );
  const legend = $derived.by(() =>
    hues ? [...hues.shares.entries()].sort((a, b) => b[1] - a[1]) : [],
  );
  const errors = $derived.by(() =>
    data ? [...data.errorTally.entries()].sort((a, b) => b[1] - a[1]) : [],
  );
  const isOwnRepo = $derived.by(
    () => !!session.did && !!data && session.did === data.did,
  );

  const stats = $derived.by(() => {
    if (!data || !filtered) return null;
    const invalid = data.records.reduce((s, r) => s + (r.errs ? 1 : 0), 0);
    return {
      // The viewed identity, stated from the READ result -- never from
      // the handle input field. The field is a control ("what to read
      // next"); reusing its live value here is the exact bug this
      // fixes: edit it without pressing Read and the rail would
      // silently claim you're looking at whatever is now typed, not
      // what was actually read.
      did: data.did,
      handle: data.handle,
      isOwn: isOwnRepo,
      pds: new URL(data.pds).host,
      collections: data.collections.length,
      records: data.records.length,
      matched: filtered.matched,
      bytes: filtered.totalBytes,
      exact: data.exact,
      // `source` is the read path ('car' | 'list') and never changes after
      // an edit -- unlike `exact`, which onchanged() recomputes across all
      // records. Rail needs both: the path is what "measured (CAR)" /
      // "estimated (listRecords)" actually describes, and editedCount is
      // reported alongside it rather than folded into the same claim, so
      // editing one record after a CAR read cannot make the rail say the
      // whole 187,000-record read came from listRecords.
      source: data.source,
      editedCount: editedKeys.size,
      rev: data.rev,
      invalid,
      invalidPct: data.records.length
        ? ((invalid / data.records.length) * 100).toFixed(2)
        : "0.00",
      // undated records sort last, but do not depend on position: scan for
      // the earliest record that actually has a timestamp
      first: (() => {
        let earliest = null;
        for (const r of data.records) {
          if (r.ts != null && (earliest == null || r.ts < earliest))
            earliest = r.ts;
        }
        return earliest == null
          ? "—"
          : new Date(earliest).toISOString().slice(0, 10);
      })(),
      undated: data.records.reduce((s, r) => s + (r.ts == null ? 1 : 0), 0),
    };
  });

  $effect(() => {
    if (!data && !committedHandle) return;
    history.replaceState(
      history.state,
      "",
      toHash({ ...defaultState(), handle: committedHandle, weigh, ...filters }),
    );
  });

  /**
   * @param {string|null} [who]
   * @param {{suppressAutoHide?: boolean}} [opts] `suppressAutoHide`: true
   *   only when THIS read was launched from a URL hash that already named an
   *   explicit `hide=` -- a shared link must reproduce exactly what the
   *   sharer saw, so auto-hide must not add a collection the link didn't ask
   *   for. Every other caller (Rail's Read button, Gate's pick, the
   *   post-sign-in redirect with no `#h=`) leaves this false, so a fresh read
   *   still gets the one-shot dominant-collection check.
   */
  async function draw(who = null, { suppressAutoHide = false } = {}) {
    // Commit the handle only on an intentional action: typeahead selection,
    // Enter, or pressing Read.
    const target = String(who ?? handle).trim();
    if (!target) return;
    handle = target;
    committedHandle = target;

    ac?.abort();
    ac = new AbortController();
    const mine = ac;

    busy = true;
    entered = true;
    // On a phone the Read button lives inside the drawer, which covers the
    // stage it is about to fill: leaving it open would hide the firehose the
    // press just started. Inert at desktop widths.
    railOpen = false;
    error = null;
    hover = null;
    selected = null;
    editedKeys = new Set();
    autoHidden = null;
    gotBytes = 0;
    gotRecords = 0;
    lines = [];
    phase = "resolving";
    startedAt = Date.now();
    elapsed = 0;
    clearInterval(ticker ?? undefined);
    ticker = setInterval(() => (elapsed = Date.now() - startedAt), 100);

    try {
      const d = await readRepo(target, {
        signal: mine.signal,
        onProgress: (e) => {
          phase = e.phase;
          status = e.message;
          if (e.bytes != null) gotBytes = e.bytes;
          if (e.records != null) gotRecords = e.records;
        },
        onSizeGate: async (bytes) =>
          confirm(
            `Read so far: ${(bytes / 1048576).toFixed(0)} MB.\n\n` +
              `This repository is unusually large and will use roughly 4x that in memory.\n\n` +
              `Continue reading?`,
          ),
      });
      if (mine.signal.aborted) return;

      hues = collectionHues(d.records);
      data = d;
      gotRecords = d.records.length;

      // One-shot: decide once, right here at read completion, never as a
      // standing rule that re-fires later. Nothing after this point
      // watches `filters` and re-adds the collection -- clicking "Show
      // all" or toggling it back on is final until the next read.
      if (!suppressAutoHide) {
        const dominant = selectDominantCollection(d.records);
        if (dominant) {
          const totalBytes = d.records.reduce((s, r) => s + (r.bytes || 0), 0);
          const colBytes = d.records.reduce(
            (s, r) => (r.col === dominant ? s + (r.bytes || 0) : s),
            0,
          );
          autoHidden = {
            col: dominant,
            share: totalBytes ? colBytes / totalBytes : 0,
          };
          filters = {
            ...filters,
            hidden: new Set([...filters.hidden, dominant]),
          };
        }
      }

      // The firehose showed real records; end on the true final lines --
      // but d.records is ts-sorted with undated records (no TID, no
      // createdAt) pushed last (car.js), so a plain slice(-24) shows the
      // chronologically newest records only when there are fewer than 24
      // undated ones. On a repo whose undated count meets or exceeds 24
      // (pixeline.be has exactly 25) every final line would be undated --
      // representative of nothing. Prefer the newest DATED records for
      // this freeze-frame; fall back to the raw tail only if the repo
      // does not have 24 dated records to show.
      const dated = d.records.filter((r) => r.ts != null);
      const finalFrame =
        dated.length >= 24 ? dated.slice(-24) : d.records.slice(-24);
      lines = finalFrame.map((r) => ({
        ts: r.ts,
        col: r.col,
        rkey: r.rkey,
        bytes: r.bytes,
      }));
      status = d.exact
        ? "read complete (measured)"
        : "read complete (estimated)";
    } catch (/** @type {any} */ err) {
      if (mine.signal.aborted) {
        status = "stopped";
        return;
      }
      status = "failed";
      error =
        String(err?.message) === "size-limit"
          ? "Stopped: the repository exceeded the size limit and reading was declined."
          : String(err?.message ?? err);
    } finally {
      busy = false;
      clearInterval(ticker ?? undefined);
    }
  }

  /** @param {{action: 'updated'|'deleted', record: {col: string, rkey: string}, value?: any}} e */
  function onchanged({ action, record, value }) {
    if (!data) return;
    let records = data.records;
    const key = `${record.col}/${record.rkey}`;
    if (action === "deleted") {
      records = records.filter(
        (r) => r.rkey !== record.rkey || r.col !== record.col,
      );
      // the record is gone; it can no longer be "an edited record" in the
      // rail's count
      const next = new Set(editedKeys);
      next.delete(key);
      editedKeys = next;
    } else if (action === "updated") {
      records = records.map((r) =>
        r.rkey === record.rkey && r.col === record.col
          ? { ...r, value, bytes: JSON.stringify(value).length, exact: false }
          : r,
      );
      const next = new Set(editedKeys);
      next.add(key);
      editedKeys = next;
    }
    // data.exact is the aggregate "measured (CAR) / estimated" label the Rail
    // shows; each record already carries its own exact flag (true from the
    // CAR, false from listRecords or a local edit -- see list.js and above).
    // Recompute it from the records rather than leaving it pinned to
    // whatever the initial read was, or an edit after a fully-measured CAR
    // read would still claim everything is measured.
    //
    // `data.source` (the read path: 'car' | 'list') is NOT recomputed here --
    // it is provenance, fixed by which reader actually ran, and does not
    // change just because a record was edited afterward. Rail.svelte reads
    // `source` for the "measured (CAR)"/"estimated (listRecords)" label and
    // `editedCount` (derived from `editedKeys` above) separately, rather
    // than collapsing both into one boolean that can misname the read path.
    data = { ...data, records, exact: records.every((r) => r.exact !== false) };
    hues = collectionHues(data.records);
  }

  /** @param {import('$lib/repo/types.js').Hit | null} h */
  function onHover(h) {
    hover = h;
  }

  /** @param {import('$lib/repo/types.js').Hit | null} h */
  function onOpen(h) {
    // only reachable from <Treemap>, which is only rendered once `data` is
    // set (`{:else if data && hues && filtered}` below) -- but that template
    // guard doesn't narrow `data`'s type inside this closure (see the
    // `$derived.by` note above for why closures fall back to the declared,
    // nullable type), so check again here rather than asserting it away.
    if (data) selected = resolveHit(h, data.records);
  }

  /** @param {string} who */
  function onPick(who) {
    draw(who);
  }

  // `h`/`session.signIn` deliberately left untyped: session.svelte.js has its
  // own pre-existing implicit-any/never issues (unannotated $state, same as
  // Critical 1's root cause but in a file this fix wave does not touch) that
  // make an explicit `string` annotation here fight a mismatched inferred
  // signature on the other side. Out of scope for this pass.
  function onSignIn(h) {
    session.signIn(h);
  }

  onMount(() => {
    syncPreferences();

    const onPrefsChanged = () => syncPreferences();
    const onStorage = (e) => {
      if (e.key === null || e.key === STORAGE_KEY) syncPreferences();
    };
    window.addEventListener(PREFERENCES_EVENT, onPrefsChanged);
    window.addEventListener("storage", onStorage);

    (async () => {
      // the OAuth callback arrives as ?code=…&state=… on this same route, so it
      // MUST be resolved before the hash is read or the redirect races the
      // state restore. session.init() never throws (failures land in
      // session.error), so this always runs -- a failed restore must not
      // skip the hash restore below, it just means session.did stays null.
      await session.init();

      const s = fromHash(location.hash);
      handle = s.handle;
      committedHandle = s.handle;
      weigh = s.weigh;
      filters = { hidden: s.hidden, from: s.from, to: s.to, query: s.query };
      // A `hide=` already present in the URL that opened this page names
      // exactly what the sharer chose to hide -- auto-hide must not add a
      // collection on top of that, or a shared link would show its recipient
      // something the sharer never saw. This is checked ONLY for the read
      // `onMount` itself triggers below; every later read (Rail's Read
      // button, Gate's pick) has no URL of its own to honour, so it gets a
      // fresh one-shot auto-hide check regardless of this flag.
      const suppressAutoHide = s.hidden.size > 0;
      if (s.handle) {
        // An explicit #h= always wins, even when signed in: a shared link to
        // someone else's repo must not be hijacked into the signed-in user's
        // own.
        draw(null, { suppressAutoHide });
      } else if (session.did) {
        // Landing back here straight from the OAuth callback (no explicit
        // handle in the URL): session.init() just established a real
        // session, but nothing has been read yet, so the entry screen would
        // otherwise show no sign of it -- reported as "went back to the
        // home screen, seemingly unlogged". Go straight to reading the
        // signed-in user's own repo instead. draw() flips `entered` (and
        // `busy`) synchronously, before any awaiting happens, so the rail
        // (which shows "signed in as <handle>") and the firehose reading
        // state appear immediately rather than a blank entry screen
        // appearing to hang through what can be a large read (~56 MB for
        // the account this was reported against).
        draw(session.handle ?? session.did, { suppressAutoHide });
      }
    })();

    return () => {
      window.removeEventListener(PREFERENCES_EVENT, onPrefsChanged);
      window.removeEventListener("storage", onStorage);
    };
  });
</script>

<svelte:head>
  <title>GrandPerspective — PDS edition</title>
  <meta
    name="description"
    content="See where an atproto repository's bytes actually go, and act on what you find."
  />
</svelte:head>

<div class="app" class:entry={!entered}>
  {#if entered}
    <!-- Below 820px the rail is an overlay drawer (see Rail.svelte's media
         query for why), so these two exist only there: a way in, and a way
         out by tapping the map. Both are display:none above the breakpoint,
         where the rail is a permanent column. -->
    {#if !railOpen}
      <button
        class="railtoggle"
        onclick={() => (railOpen = true)}
        aria-expanded={railOpen}
        aria-controls="rail">controls</button
      >
    {:else}
      <div
        class="railscrim"
        role="button"
        tabindex="-1"
        aria-label="Close controls"
        onclick={() => (railOpen = false)}
        onkeydown={(e) => e.key === "Enter" && (railOpen = false)}
      ></div>
    {/if}

    <Rail
      bind:handle
      bind:filters
      {busy}
      {status}
      {stats}
      {legend}
      {errors}
      autoHidden={autoHiddenNotice}
      hueOf={hues?.hueOf}
      {session}
      open={railOpen}
      ondraw={draw}
      onstop={() => ac?.abort()}
      onsignin={onSignIn}
      onsignout={() => session.signOut()}
      onclose={() => (railOpen = false)}
    />
  {/if}

  <main class="stage">
    {#if !entered}
      <Gate bind:handle onpick={onPick} />
    {:else if busy}
      <WifiWarning
        visible={connection.isSlow && !connectionDismissed}
        ondismiss={() => (connectionDismissed = true)}
      />
      <Firehose
        {phase}
        bytes={gotBytes}
        records={gotRecords}
        collections={data?.collections.length ?? 0}
        {lines}
        {elapsed}
      />
    {:else if data && hues && filtered}
      <Treemap
        records={filtered.records}
        hueOf={hues.hueOf}
        bind:weigh
        exact={data.exact}
        label={data.handle ?? data.did}
        onhover={onHover}
        onopen={onOpen}
      />
      <Tip info={hover} hueOf={hues.hueOf} />
    {/if}

    {#if error}
      <div class="msg">
        <b>cannot read that repository</b>
        <p>{error}</p>
        <p class="fine">
          If the handle resolves, likely CORS: the PDS must send
          <code>Access-Control-Allow-Origin</code> on <code>/xrpc/</code>.
        </p>
      </div>
    {/if}
  </main>
</div>

<RecordModal
  record={selected}
  did={data?.did ?? null}
  handle={data?.handle ?? null}
  agent={session.agent}
  canWrite={session.canWrite}
  {isOwnRepo}
  microblogging={microblogging}
  viewer={viewer}
  onclose={() => (selected = null)}
  {onchanged}
/>

<style>
  .app {
    display: grid;
    grid-template-columns: 320px 1fr;
    height: 100%;
  }
  .app.entry {
    grid-template-columns: 1fr;
    /* One full-height row, stated explicitly rather than left implicit. The
       narrow-viewport rule at the bottom of this block sets `auto 1fr` for the
       ENTERED layout (rail stacked above stage), and `.app.entry` only
       out-specifies it on columns -- so the rows track reached the entry
       screen too. There the grid has a single child, `main.stage`, which lands
       in the `auto` row; its only child is the gate, `position: absolute`, so
       it contributes no in-flow height and the row collapsed to 0. With
       `body { overflow: hidden }` that is a blank screen on any phone. */
    grid-template-rows: 1fr;
  }
  .stage {
    position: relative;
    overflow: hidden;
    background: var(--ground);
  }
  .msg {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    max-width: 440px;
    text-align: center;
    font-size: 12px;
    line-height: 1.5;
    background: var(--paper);
    border: 1px solid var(--rule);
    padding: 16px 20px;
    z-index: 7;
  }
  .msg b {
    display: block;
    font-weight: 800;
    letter-spacing: -0.02em;
    font-size: 15px;
    margin-bottom: 6px;
    text-transform: uppercase;
  }
  .msg p {
    margin: 0;
    color: var(--ink-soft);
  }
  .msg .fine {
    margin-top: 8px;
    font-size: 11px;
  }
  code {
    font-family: "IBM Plex Mono", monospace;
    font-size: 11px;
    background: var(--ground-deep);
    padding: 1px 4px;
  }
  .railtoggle,
  .railscrim {
    display: none;
  }

  @media (max-width: 820px) {
    /* One cell, always. The rail leaves the grid entirely at this width --
       Rail.svelte makes it `position: fixed` -- so there is no second track to
       size, and the stage gets the whole viewport. `.app.entry` is included by
       name because it out-specifies a bare `.app` here, and leaving it out is
       exactly the bug that made this screen blank on every phone: the entry
       screen inherited an `auto 1fr` rows track it had no second child for,
       collapsed the stage to 0, and the absolutely-positioned gate inside it
       had nothing to be 100% of. */
    .app,
    .app.entry {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr;
    }
    .railtoggle {
      display: block;
      position: fixed;
      top: max(12px, env(safe-area-inset-top));
      left: max(12px, env(safe-area-inset-left));
      /* under the drawer (15) and the record modal (20/21) */
      z-index: 13;
      min-height: 44px;
      padding: 0 14px;
      font-family: "Archivo", sans-serif;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      border: 1px solid var(--ink);
      background: var(--paper);
      color: var(--ink);
      cursor: pointer;
    }
    .railscrim {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 14;
      background: color-mix(in srgb, var(--ink) 32%, transparent);
      border: 0;
    }
  }
</style>
