// node:timers/promises has no browser equivalent, so Vite externalizes it to
// an empty module for the client build -- its named export `setImmediate`
// resolves to undefined. @atproto/repo's CAR reader (node_modules/@atproto/
// repo/dist/car.js, readCarBlocksIterGenerator) awaits setImmediate() every 25
// blocks purely to yield to the event loop so a large synchronous CAR read
// doesn't jam the main thread; calling undefined() there throws, which
// read.js's catch quietly turns into a fall back to listAllRecords, losing
// the CAR's exact byte sizes.
//
// setTimeout(fn, 0) is NOT an adequate substitute for Node's setImmediate: a
// real repo yields here every 25 blocks, which for a repo the size of
// pixeline.be (186,958 records, several hundred thousand blocks including MST
// nodes) means tens of thousands of yields. Browsers clamp a chain of nested
// setTimeout calls to a 4ms floor (HTML spec "nested timeouts" throttling),
// so 15-20k yields at ~4ms each adds minutes, not milliseconds -- measured
// directly: a read that should finish in ~10s was still parsing at 2+ minutes
// and climbing before this fix. A MessageChannel round-trip is a real
// zero-delay macrotask with no such clamp -- this is the same technique the
// widely-used `setimmediate` npm package uses to polyfill this exact API, so
// this file hand-rolls only the one call shape @atproto/repo actually uses
// rather than pulling in that whole polyfill (no queued IDs to cancel, no
// arguments to forward -- just "yield once").
//
// Aliased in vite.config.js so the literal specifier 'node:timers/promises'
// resolves here instead of to Vite's browser stub.
/** @returns {Promise<void>} */
export function setImmediate() {
	return new Promise((resolve) => {
		const channel = new MessageChannel();
		channel.port2.onmessage = () => resolve();
		channel.port1.postMessage(null);
	});
}
