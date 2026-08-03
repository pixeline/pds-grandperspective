/**
 * User preferences for external app links.
 *
 * Preferences are stored in the user's own PDS repo as a record of type
 * community.lexicon.preference.apps.pds-grandperspective in the
 * community.lexicon.preference collection.
 *
 * @typedef {Object} Preferences
 * @property {string} $type
 * @property {'bsky'|'mu.social'|'blacksky'|'northsky'} microblogging
 * @property {'pdsls.dev'|'aturi.to'} viewer
 * @property {string} [createdAt]
 */

/** The collection NSID for preferences */
export const PREFERENCES_COLLECTION = 'community.lexicon.preference';

/** The record type NSID for app preferences */
export const PREFERENCES_RECORD_TYPE = 'community.lexicon.preference.apps.pds-grandperspective';

/** Fixed record key for the preferences record */
export const PREFERENCES_RKEY = 'pds-grandperspective';

/**
 * Default preferences
 */
export const DEFAULT_PREFERENCES = {
	$type: PREFERENCES_RECORD_TYPE,
	microblogging: 'bsky',
	viewer: 'pdsls.dev'
};

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
 * Get the preferences record URI for a given DID
 * @param {string} did
 * @returns {string}
 */
export function getPreferencesUri(did) {
	return `at://${did}/${PREFERENCES_COLLECTION}/${PREFERENCES_RKEY}`;
}

/**
 * Validate preferences object
 * @param {any} prefs
 * @returns {boolean}
 */
export function validatePreferences(prefs) {
	if (!prefs || typeof prefs !== 'object') return false;
	if (prefs.$type !== PREFERENCES_RECORD_TYPE) return false;
	if (!MICROBLOGGING_OPTS.some(o => o.id === prefs.microblogging)) return false;
	if (!VIEWER_OPTS.some(o => o.id === prefs.viewer)) return false;
	return true;
}

/**
 * Create a preferences record for writing
 * @param {string} microblogging
 * @param {string} viewer
 * @returns {object}
 */
export function createPreferences(microblogging, viewer) {
	return {
		$type: PREFERENCES_RECORD_TYPE,
		microblogging,
		viewer,
		createdAt: new Date().toISOString()
	};
}

/**
 * Read preferences from a user's repo
 * @param {any} session OAuth session with fetchHandler
 * @param {string} did
 * @returns {Promise<object|null>}
 */
export async function readPreferences(session, did) {
	if (!session?.fetchHandler || !did) return null;

	try {
		const res = await session.fetchHandler(
			`/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(
				PREFERENCES_COLLECTION
			)}&rkey=${encodeURIComponent(PREFERENCES_RKEY)}`
		);

		if (!res.ok) {
			if (res.status === 404) return null;
			throw new Error(`${res.status} ${res.statusText}`);
		}

		const data = await res.json();
		if (validatePreferences(data.value)) {
			return data.value;
		}
		return null;
	} catch (/** @type {any} */ err) {
		// Preference record doesn't exist yet - that's fine
		if (String(err?.message).includes('404')) return null;
		throw err;
	}
}
