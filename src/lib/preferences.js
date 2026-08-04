/**
 * User preferences for external app links.
 *
 * Preferences are stored in the browser's localStorage.
 */

/**
 * Available microblogging app options
 * @type {Array<{id: string, label: string}>}
 */
export const MICROBLOGGING_OPTS = [
	{ id: 'bsky', label: 'Bluesky (bsky.app)' },
	{ id: 'mu.social', label: 'Mu Social' },
	{ id: 'blacksky', label: 'Blacksky' },
	{ id: 'northsky', label: 'Northsky' }
];

/**
 * Available viewer app options
 * @type {Array<{id: string, label: string}>}
 */
export const VIEWER_OPTS = [
	{ id: 'pdsls.dev', label: 'PDS LS (pdsls.dev)' },
	{ id: 'aturi.to', label: 'Aturi (aturi.to)' }
];

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
