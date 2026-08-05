/**
 * User preferences for external app links.
 *
 * Preferences are stored in the browser's localStorage.
 */

export const STORAGE_KEY = 'pds-grandperspective-preferences';

/**
 * Available microblogging app options
 * @type {Array<{id: string, label: string}>}
 */
export const MICROBLOGGING_OPTS = [
	{ id: 'bsky', label: 'Bluesky (bsky.app)' },
	{ id: 'bluepy.social', label: 'Bluepy (bluepy.social)' },
	{ id: 'mu.social', label: 'Mu Social' },
	{ id: 'blacksky', label: 'Blacksky' },
	{ id: 'witchsky', label: 'Witchsky' }
];

export const MICROBLOGGING_MAP = {
	bsky: { domain: 'bsky.app', label: 'Bluesky' },
	'bluepy.social': { domain: 'bluepy.social', label: 'Bluepy', route: 'at-uri-path' },
	'mu.social': { domain: 'mu.social', label: 'Mu' },
	blacksky: { domain: 'blacksky.community', label: 'Blacksky' },
	witchsky: { domain: 'witchsky.app', label: 'Witchsky' }
};

/**
 * Available viewer app options
 * @type {Array<{id: string, label: string}>}
 */
export const VIEWER_OPTS = [
	{ id: 'pdsls.dev', label: 'PDS LS (pdsls.dev)' },
	{ id: 'aturi.to', label: 'Aturi (aturi.to)' }
];

export const VIEWER_MAP = {
	'pdsls.dev': { domain: 'pdsls.dev', label: 'PDS LS' },
	'aturi.to': { domain: 'aturi.to', label: 'Aturi' }
};

export const DEFAULT_PREFERENCES = createPreferences('bsky', 'pdsls.dev');

export const PREFERENCES_EVENT = 'pds-grandperspective-preferences-changed';

/**
 * Create a preferences object for localStorage
 * @param {string} microblogging
 * @param {string} viewer
 * @returns {object}
 */
export function createPreferences(microblogging, viewer) {
	return {
		microblogging,
		viewer
	};
}

function isAllowed(id, opts) {
	return opts.some((opt) => opt.id === id);
}

/**
 * @param {unknown} value
 * @returns {{microblogging: string, viewer: string}}
 */
export function normalizePreferences(value) {
	const raw = value && typeof value === 'object' ? /** @type {any} */ (value) : {};
	const microblogging = isAllowed(raw.microblogging, MICROBLOGGING_OPTS)
		? raw.microblogging
		: DEFAULT_PREFERENCES.microblogging;
	const viewer = isAllowed(raw.viewer, VIEWER_OPTS) ? raw.viewer : DEFAULT_PREFERENCES.viewer;
	return createPreferences(microblogging, viewer);
}

/**
 * @returns {{microblogging: string, viewer: string}}
 */
export function loadPreferences() {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return DEFAULT_PREFERENCES;
		return normalizePreferences(JSON.parse(stored));
	} catch {
		return DEFAULT_PREFERENCES;
	}
}

/**
 * @param {unknown} prefs
 * @returns {{microblogging: string, viewer: string}}
 */
export function savePreferences(prefs) {
	const normalized = normalizePreferences(prefs);
	localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
	window.dispatchEvent(new CustomEvent(PREFERENCES_EVENT, { detail: normalized }));
	return normalized;
}
