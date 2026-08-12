import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function sourceFiles(dir, out = []) {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) sourceFiles(p, out);
		else if (/\.(svelte|css)$/.test(name)) out.push(p);
	}
	return out;
}

const FILES = sourceFiles('src');

/** Report every offending file rather than just the first. */
function offenders(pattern, allow = () => false) {
	const hits = [];
	for (const f of FILES) {
		for (const [i, line] of readFileSync(f, 'utf8').split('\n').entries()) {
			if (pattern.test(line) && !allow(line)) hits.push(`${f}:${i + 1} ${line.trim()}`);
		}
	}
	return hits;
}

// standing constraints decay without a check. These are the ones the design
// states as prohibitions, so they are asserted rather than trusted.
describe('visual language', () => {
	it('has no rounded corners other than a reset to 0 or a full-circle avatar disc', () => {
		// A profile photo cropped to a disc (border-radius: 50%) reads as a face,
		// not as decorative rounding, so it is the one sanctioned exception. Any
		// partial radius -- a rounded rectangle -- is still a failure.
		expect(
			offenders(
				/border-radius/,
				(l) => /border-radius:\s*(0|50%)(;|\s|$)/.test(l)
			)
		).toEqual([]);
	});

	it('has no drop shadows other than an explicit reset to none', () => {
		expect(
			offenders(/box-shadow|drop-shadow/, (l) => /box-shadow:\s*none(;|\s|$)/.test(l))
		).toEqual([]);
	});

	it('has no gradients', () => {
		expect(offenders(/linear-gradient|radial-gradient|conic-gradient/)).toEqual([]);
	});
});
