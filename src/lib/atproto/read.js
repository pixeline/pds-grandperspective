import { resolveIdentity } from './identity.js';
import { carUrl, fetchCarBytes, parseRepoCar } from './car.js';
import { listAllRecords } from './list.js';

/**
 * Above this many CAR bytes, stop and ask. Calibrated against a real repo:
 * pixeline.be holds 186,958 records in a 65.7 MB CAR, so ordinary accounts
 * never see the prompt.
 */
export const DEFAULT_LIMIT_BYTES = 150 * 1024 * 1024;

/**
 * Read a repo in full.
 *
 * CAR first: one unauthenticated request returns every record, and each
 * record's stored size is a measurement rather than an estimate. Exhaustive
 * listRecords is the fallback for a PDS that blocks or CORS-restricts the sync
 * endpoint -- it works, but its sizes are JSON lengths, so `exact` is false and
 * the UI says so.
 *
 * There is NO record ceiling. The previous reader sampled ~21 records per
 * collection, which drew a 186,958-record repo from 4,000 records and rendered
 * a collection holding 93% of the repo as a sliver. A treemap's only claim is
 * that area is proportional to size.
 *
 * @param {string} input handle or DID
 * @param {{signal?: AbortSignal,
 *          onProgress?: (e: {phase: string, bytes?: number, records?: number, message: string}) => void,
 *          onSizeGate?: (bytes: number) => Promise<boolean>,
 *          limitBytes?: number, now?: number, fetchImpl?: typeof fetch}} [opts]
 */
export async function readRepo(input, opts = {}) {
	const {
		signal,
		onProgress,
		onSizeGate,
		limitBytes = DEFAULT_LIMIT_BYTES,
		now = Date.now(),
		fetchImpl = fetch
	} = opts;

	const say = (phase, message, extra = {}) => onProgress?.({ phase, message, ...extra });

	say('resolving', 'Resolving identity…');
	const { did, pds } = await resolveIdentity(input, { signal, fetchImpl });

	let out = null;
	let source = 'car';

	try {
		say('receiving', `Reading ${new URL(pds).host}…`, { bytes: 0 });

		const bytes = await fetchCarBytes(carUrl(pds, did), {
			signal,
			limitBytes,
			onSizeGate,
			fetchImpl,
			onProgress: (n) => say('receiving', `${(n / 1048576).toFixed(1)} MB`, { bytes: n })
		});

		say('parsing', 'Parsing repository…', { bytes: bytes.length });
		out = await parseRepoCar(bytes, {
			now,
			onRecord: (_r, n) => {
				if (n % 500 === 0) say('parsing', `${n} records`, { records: n });
			}
		});
	} catch (err) {
		// the size gate is the user's decision, not a failure to route around
		if (String(err?.message) === 'size-limit') throw err;
		if (signal?.aborted) throw err;

		source = 'list';
		say('listing', `CAR unavailable (${err?.message ?? err}) — reading collection by collection…`);
		out = await listAllRecords(pds, did, {
			signal,
			now,
			fetchImpl,
			onProgress: (message, records) => say('listing', message, { records })
		});
	}

	const errorTally = new Map();
	for (const r of out.records) {
		for (const e of r.errNames) errorTally.set(e, (errorTally.get(e) || 0) + 1);
	}

	return {
		did: out.did ?? did,
		pds,
		rev: out.rev ?? null,
		records: out.records,
		collections: out.collections,
		exact: source === 'car',
		errorTally,
		source
	};
}
