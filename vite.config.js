import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	// @atproto/repo pulls in a server-oriented logger (pino) that reads
	// process.env.* at module-eval time with no browser guard. This app never
	// runs on a server (constraint 2: all reading is client-side), so there is
	// no real process.env to read -- replace it with an empty object so those
	// reads resolve to undefined instead of throwing "process is not defined"
	// the instant the page imports readRepo.
	define: {
		'process.env': {}
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
