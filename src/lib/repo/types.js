/**
 * Shared JSDoc shapes for values that cross module boundaries.
 *
 * This file has no runtime behaviour -- it exists so `svelte-check` can catch
 * a mis-shaped value reaching somewhere it shouldn't (RecordModal chief among
 * them: Critical 1 was `hittest.js`'s display-shaped hit reaching the modal
 * with `value` missing, silently defeating the `$type` immutability guard,
 * and it survived three review rounds partly because `+page.svelte`'s
 * `$state(null)` declarations narrowed to `never` and TypeScript gave up on
 * the whole file rather than catching it).
 */

/**
 * One record, as produced by both `atproto/car.js` (the primary CAR read
 * path) and `atproto/list.js` (the exhaustive `listRecords` fallback). Both
 * readers must agree on this shape -- it is what `read.js` returns
 * regardless of which path actually ran.
 *
 * @typedef {Object} RepoRecord
 * @property {string} col
 * @property {number|null} ts resolved timestamp (TID first, createdAt
 *   second); null when neither source is decodable -- see car.js/list.js
 * @property {string} rkey
 * @property {number} bytes DAG-CBOR block length (CAR) or JSON length
 *   (listRecords fallback / local edit)
 * @property {boolean} exact true only when `bytes` is a measurement (CAR)
 *   rather than an estimate (listRecords, or a record edited locally)
 * @property {number} errs count of audit findings for this record
 * @property {string[]} errNames
 * @property {any} value the decoded record body -- what RecordModal reads
 *   for its JSON pane, the edit textarea, the `$type` guard, and the
 *   claimed-`createdAt`-vs-TID skew check
 */

/**
 * A hit from `hittest.js` on an aggregated block: too small to resolve to
 * one cell per record, so there is no single record behind it.
 *
 * @typedef {Object} AggregateHit
 * @property {string} nsid
 * @property {string} col same as `nsid`, kept for a uniform `col ?? nsid`
 *   read at call sites
 * @property {null} rkey always null -- an aggregate has no single record
 *   behind it, so there is nothing honest to put here. (This used to be an
 *   arbitrary member record's rkey, dressed up as if it identified the whole
 *   block; that was the bug, not a feature to preserve.)
 * @property {number} records
 * @property {number} bytes
 * @property {true} aggregate
 */

/**
 * A hit from `hittest.js` on one real record's cell. Deliberately
 * display-shaped -- it carries only enough (`col` + `rkey`) to look the full
 * record up; it never carries `value` (see `resolveHit.js`).
 *
 * @typedef {Object} CellHit
 * @property {string} nsid
 * @property {string} col
 * @property {string} rkey
 * @property {number|null} ts
 * @property {number} bytes
 * @property {string} [err]
 * @property {boolean} [undated]
 * @property {false} aggregate
 */

/** @typedef {AggregateHit | CellHit} Hit */

/**
 * What `RecordModal`'s `record` prop actually needs to be: an `AggregateHit`
 * passed through unchanged (it has no single record, hence no `value` to
 * attach), or a non-aggregate `CellHit` with `value` REQUIRED --
 * `resolveHit.js` is the only place that attaches it.
 *
 * Making `value` required on the non-aggregate branch, rather than optional
 * across the whole union, is what turns Critical 1 back into a compile
 * error: a raw `CellHit` straight from `hittest.js` has `aggregate: false`
 * and no `value`, so handing it to `RecordModal` without going through
 * `resolveHit.js` now fails typechecking instead of silently reaching the
 * modal with `value: undefined` (which defeated the `$type` guard in
 * write.js, among other things -- see resolveHit.js's own doc comment).
 *
 * @typedef {AggregateHit | (CellHit & {value: any, exact?: boolean})} ModalRecord
 */

export {};
