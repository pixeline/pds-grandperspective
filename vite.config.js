import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	resolve: {
		alias: {
			// @atproto/repo's CAR reader imports setImmediate from
			// node:timers/promises to yield to the event loop every 25 blocks.
			// Vite externalizes node: specifiers to an empty stub for the
			// browser, so the named export is undefined and calling it throws --
			// which read.js's catch silently turns into a fall back to
			// listAllRecords, losing the CAR's exact byte sizes. Aliasing the
			// exact specifier to a browser-safe shim (src/lib/atproto/timers-
			// shim.js) resolves it there instead of to the stub.
			'node:timers/promises': fileURLToPath(
				new URL('./src/lib/atproto/timers-shim.js', import.meta.url)
			)
		}
	},
	// @atproto/repo pulls in @atproto/common's logger (pino), which reads four
	// specific env vars at module-eval time with no browser guard: LOG_ENABLED,
	// LOG_DESTINATION, LOG_LEVEL, LOG_SYSTEMS (node_modules/@atproto/common/dist/
	// logger.js). This app never runs on a server (constraint 2: all reading is
	// client-side), so there is no real process.env to read for these -- define
	// exactly these four literal accesses rather than blanket-defining
	// `process.env`, so any *other* process.env read anywhere in the dependency
	// tree still throws instead of silently going undefined (constraint 3:
	// fail loudly, don't paper over).
	//
	// @atproto/common also exports envInt/envStr/envBool/envList (dist/env.js),
	// which read process.env[name] dynamically -- a narrow define can't cover a
	// runtime variable key. Confirmed by grepping the actual Vite-optimized
	// dependency bundle (node_modules/.vite/deps/@atproto_repo.js) that these
	// four functions are never called anywhere in the reachable code: only
	// logger.js's four literal reads appear there. If a future @atproto/*
	// upgrade starts calling them, this narrow define will stop working and the
	// failure will be loud (a real ReferenceError), which is the point.
	//
	// The value is '""' and NOT 'undefined'. Vitest copies every
	// `process.env.*` define into the real `process.env` of the test process
	// (deleteDefineConfig, vitest/dist/chunks/cli-api), where assignment
	// coerces to a string -- so 'undefined' arrived as the truthy STRING
	// "undefined". logger.js line 8 is `dest ? destination(dest) : undefined`,
	// so pino opened a log file literally named `undefined` in the repo root on
	// every test run (traced through sonic-boom to fs.open(undefined); the
	// file was committed by accident once already). An empty string is falsy in
	// all four of logger.js's reads -- `?? '0'`, `dest ?`, `|| 'info'`,
	// `?.trim() ?` -- so behaviour in the browser bundle is identical to
	// undefined, and Node no longer gets a truthy filename.
	define: {
		'process.env.LOG_ENABLED': '""',
		'process.env.LOG_DESTINATION': '""',
		'process.env.LOG_LEVEL': '""',
		'process.env.LOG_SYSTEMS': '""'
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Fully static output: the app reads public XRPC from the browser, so
			// there is nothing to run on a server.
			adapter: adapter(),
			// relative asset URLs, so `build/` can be dropped into any subfolder
			// of pixeline.be without knowing the path at build time
			paths: { relative: true }
		})
	],
	server: {
		// the OAuth loopback client requires the literal IP; the spec rejects
		// the hostname `localhost` as a redirect target. The port is left to
		// .claude/launch.json, which already pins 5199 -- any port works, the
		// host is the part that matters.
		host: '127.0.0.1'
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.js',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
