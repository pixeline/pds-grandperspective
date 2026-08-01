// Everything is read from the browser against public XRPC: no server, no
// credentials, no proxy. So the app ships as a static shell and hydrates.
export const prerender = true;
export const ssr = false;
