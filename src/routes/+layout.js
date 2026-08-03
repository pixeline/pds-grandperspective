// Everything is still read from the browser against public XRPC: no server,
// no credentials, no proxy. But keep SSR on for the prerendered entry route
// so a browser with partial JS support still gets visible HTML instead of a
// blank shell before hydration.
export const prerender = true;
