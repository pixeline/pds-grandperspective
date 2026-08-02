/**
 * Colour identity for collections.
 *
 * Extracted from the deleted `portrait/layout.js`. The walk runs over NSIDs
 * sorted alphabetically, which is what makes a collection's hue stable across
 * reads: the same repo always draws the same colours, whatever order the
 * reader returned records in. The golden angle spreads neighbouring
 * namespaces apart instead of letting them collide.
 *
 * @param {Array<{col: string}>} records
 * @returns {{hueOf: Map<string, number>, shares: Map<string, number>}}
 */
export function collectionHues(records) {
	const shares = new Map();
	for (const r of records) shares.set(r.col, (shares.get(r.col) || 0) + 1);

	const hueOf = new Map();
	[...shares.keys()].sort().forEach((c, i) => hueOf.set(c, (i * 137.507) % 360));

	return { hueOf, shares };
}
