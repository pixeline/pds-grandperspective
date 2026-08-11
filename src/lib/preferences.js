/**
 * User preferences for external app links, stored in localStorage.
 *
 * The options are sourced from the @aturi.to/waypoints catalog rather than a
 * hardcoded list: one preference per app category, each listing every app the
 * catalog knows in that category. The stored value for each group is a waypoint
 * id (e.g. 'bluesky', 'leaflet').
 *
 * "Recommended" is not a UI concept here. Each group's default is the catalog's
 * own recommendation for that category (`defaultWaypointId`), applied silently
 * when the user has expressed no preference. Whatever is selected is treated as
 * the user's favorite for that category.
 */

import {
	WAYPOINT_DESTINATIONS_DATA,
	WAYPOINT_ORDER,
	WAYPOINT_CATEGORIES_DATA
} from '@aturi.to/waypoints';

export const STORAGE_KEY = 'pds-grandperspective-preferences';
export const PREFERENCES_EVENT = 'pds-grandperspective-preferences-changed';

/**
 * The preference groups we expose, in display order. Each maps to one or more
 * catalog categories. Bluesky forks fold into the microblogging group -- the
 * catalog itself nests `blueskyForks` under `blueskyClients`, and both are
 * microblogging clients. The `viewer` group is the raw record viewer used by
 * the modal's "Examine" button; the other three feed a record's "Open as…"
 * favorites.
 *
 * @typedef {Object} PrefGroup
 * @property {string} id      our storage key for the selection
 * @property {string} label   dropdown label
 * @property {string} hint    one-line help under the dropdown
 * @property {string[]} cats  catalog category ids whose members populate it
 * @property {string[]} [extra]  extra waypoint ids to append regardless of category
 * @property {boolean} favorite  whether the selection is pinned in "Open as…"
 */

/** @type {PrefGroup[]} */
export const PREF_GROUPS = [
	{
		id: 'microblogging',
		label: 'Microblogging app',
		hint: 'Your preferred Bluesky client — pinned in a record’s “Open as…” menu.',
		cats: ['blueskyClients', 'blueskyForks'],
		// Pinkleap (pinksky) is a Bluesky client despite the catalog filing it
		// under Atmosphere, so it belongs in this list.
		extra: ['pinksky'],
		favorite: true
	},
	{
		id: 'publications',
		label: 'Publications',
		hint: 'Your preferred reader for long-form / publication records.',
		cats: ['publications'],
		favorite: true
	},
	{
		id: 'viewer',
		label: 'Record viewer',
		hint: 'The raw record explorer opened by the “Examine” button.',
		cats: ['devTools'],
		favorite: false
	}
];

/**
 * The catalog apps that belong to a group, in catalog order, as `{id, name}`.
 * Category members first, then any explicit `extra` ids appended.
 * @param {string} groupId
 * @returns {Array<{id: string, name: string}>}
 */
export function optionsFor(groupId) {
	const group = PREF_GROUPS.find((g) => g.id === groupId);
	if (!group) return [];
	const cats = new Set(group.cats);
	const members = WAYPOINT_ORDER.map((id) => WAYPOINT_DESTINATIONS_DATA[id]).filter(
		(w) => w && cats.has(w.category)
	);
	const extras = (group.extra ?? [])
		.map((id) => WAYPOINT_DESTINATIONS_DATA[id])
		.filter((w) => w && !cats.has(w.category));
	return [...members, ...extras].map((w) => ({ id: w.id, name: w.name }));
}

/**
 * The catalog's recommended default for a group -- the `defaultWaypointId` of
 * its first category. Falls back to the first available option.
 * @param {string} groupId
 * @returns {string}
 */
export function defaultFor(groupId) {
	const group = PREF_GROUPS.find((g) => g.id === groupId);
	if (!group) return '';
	for (const cat of group.cats) {
		const def = WAYPOINT_CATEGORIES_DATA[cat]?.defaultWaypointId;
		if (def && optionsFor(groupId).some((o) => o.id === def)) return def;
	}
	return optionsFor(groupId)[0]?.id ?? '';
}

/** @returns {Record<string, string>} */
function buildDefaults() {
	/** @type {Record<string, string>} */
	const out = {};
	for (const g of PREF_GROUPS) out[g.id] = defaultFor(g.id);
	return out;
}

export const DEFAULT_PREFERENCES = buildDefaults();

/**
 * @param {unknown} value
 * @returns {Record<string, string>}
 */
export function normalizePreferences(value) {
	const raw = value && typeof value === 'object' ? /** @type {any} */ (value) : {};
	/** @type {Record<string, string>} */
	const out = {};
	for (const g of PREF_GROUPS) {
		const opts = optionsFor(g.id);
		out[g.id] = opts.some((o) => o.id === raw[g.id]) ? raw[g.id] : defaultFor(g.id);
	}
	return out;
}

/** @returns {Record<string, string>} */
export function loadPreferences() {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return { ...DEFAULT_PREFERENCES };
		return normalizePreferences(JSON.parse(stored));
	} catch {
		return { ...DEFAULT_PREFERENCES };
	}
}

/**
 * @param {unknown} prefs
 * @returns {Record<string, string>}
 */
export function savePreferences(prefs) {
	const normalized = normalizePreferences(prefs);
	localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
	window.dispatchEvent(new CustomEvent(PREFERENCES_EVENT, { detail: normalized }));
	return normalized;
}

/**
 * The waypoint ids the user has picked as favorites (the `favorite: true`
 * groups) -- pinned to the top of a record's "Open as…" menu.
 * @param {Record<string, string>} prefs
 * @returns {string[]}
 */
export function favoriteIds(prefs) {
	return PREF_GROUPS.filter((g) => g.favorite)
		.map((g) => prefs?.[g.id])
		.filter((id) => typeof id === 'string' && id.length > 0);
}
