/**
 * Read the browser's NetworkInformation API for a coarse "is this
 * connection expensive?" signal. Used by `+page.svelte` to decide
 * whether to render the `WifiWarning` banner during a read.
 *
 * Conformance:
 * - `navigator.connection.effectiveType` is a string from a fixed set
 *   in the spec ('slow-2g' | '2g' | '3g' | '4g') or `undefined`.
 * - `navigator.connection.saveData` is a boolean the user can toggle in
 *   their OS-level data-saver setting.
 * - The API is fully absent on desktop and iOS Safari (only Chrome-family
 *   and Android Firefox expose it).
 *
 * This module never throws. When the API is absent OR returns something
 * weird, it returns `{ effectiveType: null, saveData: false, isSlow: false }`
 * -- a desktop user never sees the wifi banner.
 *
 * The `isSlow` definition here is the only place this policy lives. If
 * it needs to change (e.g. add `'4g'` when a user complains the banner
 * shows on a fast phone), this is the line. The gate's "Reading a PDS
 * can use tens of MB" fact is unconditional and lives in `Gate.svelte`;
 * it does not consult this module.
 */

const SLOW_TYPES = new Set(['slow-2g', '2g', '3g']);

/**
 * @returns {{effectiveType: string|null, saveData: boolean, isSlow: boolean}}
 */
export function getConnection() {
	const conn = typeof navigator !== 'undefined' ? navigator.connection : null;
	if (!conn || typeof conn !== 'object') {
		return { effectiveType: null, saveData: false, isSlow: false };
	}
	const effectiveType =
		typeof conn.effectiveType === 'string' ? conn.effectiveType : null;
	const saveData = conn.saveData === true;
	const isSlow = saveData || (effectiveType != null && SLOW_TYPES.has(effectiveType));
	return { effectiveType, saveData, isSlow };
}
