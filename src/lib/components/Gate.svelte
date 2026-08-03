<script>
  import Typeahead from "./Typeahead.svelte";
  import Footer from "./Footer.svelte";

  // No default handle: `+page.svelte` binds `handle = $state("")` over this, so
  // the fallback never applied and the field has always rendered empty. A
  // suggested repository is already offered, honestly labelled, by the "See it
  // work" link below.
  let { handle = $bindable(""), onpick } = $props();

  function submit() {
    if (handle.trim()) onpick(handle);
  }
</script>

<div class="gate">
  <div class="gate-inner">
    <div>
      <img src="./favicon.svg" width="200" alt="GrandPerspective Logo" />
    </div>

    <h1>GrandPerspective<small>PDS EDITION</small></h1>

    <p class="tagline">
      Visualize all records in any atproto repository as a Tree Map diagram.
    </p>

    <div class="field">
      <Typeahead
        bind:value={handle}
        big
        autofocus
        onsubmit={(h) => onpick(h)}
      />
      <button class="go" onclick={submit}>Read repository</button>
    </div>

    <ul class="facts">
      <li>
        Every collection, including unknown lexicons. Read straight from the
        PDS.
      </li>
      <li>
        Cell area is the record's stored size, from the repository's CAR export.
      </li>
      <li>Sign in to edit or delete records in your own repository.</li>
      <li>
        Warning: reading a PDS can use tens of MB. Make sure you're on a WiFi
        connection.
      </li>
    </ul>

    <p class="example">
      See it work: <button class="link" onclick={() => onpick("pfrazee.com")}
        >pfrazee.com</button
      >
    </p>
  </div>

  <div class="gate-footer">
    <Footer />
  </div>
</div>

<style>
  .gate {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }
  .gate-inner {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    gap: 26px;
    padding: 48px 28px;
    width: min(520px, 100%);
    margin: 0 auto;
    text-align: center;
  }
  h1 {
    font-size: 19px;
    font-weight: 800;
    letter-spacing: -0.03em;
    text-transform: uppercase;
    margin: 0;
    line-height: 1.05;
  }
  h1 small {
    display: block;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.18em;
    color: var(--ink-soft);
    margin-top: 7px;
  }
  .tagline {
    font-size: 14px;
    line-height: 1.5;
    color: var(--ink);
    margin: 0;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .go {
    font-family: "Archivo", sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 12px 14px;
    border: 1px solid var(--ink);
    background: var(--ink);
    color: var(--paper);
    cursor: pointer;
  }
  .go:hover {
    opacity: 0.85;
  }
  .facts {
    list-style: ordered;
    list-style-position: inside;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    text-align: left;
  }
  .facts li {
    font-family: "IBM Plex Mono", monospace;
    font-size: 11px;
    line-height: 1.55;
    color: var(--ink-soft);
    padding-left: 14px;
    border-left: 0px solid var(--rule);
  }
  .example {
    font-size: 11px;
    color: var(--ink-soft);
    margin: 0;
  }
  .link {
    font: inherit;
    background: none;
    border: 0;
    padding: 0;
    color: var(--ink);
    cursor: pointer;
    border-bottom: 1px solid var(--rule);
  }
  .link:hover,
  .link:focus-visible {
    border-bottom-color: var(--ink);
    outline: none;
  }
  .gate-footer {
    display: flex;
    justify-content: center;
    padding: 16px 28px;
    border-top: 1px solid var(--rule);
  }

  @media (max-width: 820px) {
    .gate-inner {
      /* Centring stays: `flex: 1` keeps this item at least its content height
         (automatic minimum size), so a landscape phone whose content is taller
         than the viewport scrolls via .gate's overflow-y rather than being
         clipped symmetrically by the centring. */
      gap: 20px;
      padding: 28px max(20px, env(safe-area-inset-right)) 28px
        max(20px, env(safe-area-inset-left));
    }
    .go {
      min-height: 48px;
    }
    .link {
      padding: 6px 2px;
    }
    .gate-footer {
      padding: 16px max(20px, env(safe-area-inset-right))
        calc(16px + env(safe-area-inset-bottom))
        max(20px, env(safe-area-inset-left));
    }
  }
</style>
