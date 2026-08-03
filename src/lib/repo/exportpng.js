/**
 * PNG export of the current map.
 *
 * The map is re-laid-out at the target size rather than the screen canvas
 * being upscaled. That is the whole reason this is cheap: `buildTreemap` is
 * plain data over plain numbers, so asking it for 3000x1000 costs one more
 * call. It also means a large target resolves MORE individual records than the
 * screen does (the aggregation threshold is measured in target pixels), while
 * every area stays proportional to bytes -- the export is a better version of
 * the same claim, never a different one.
 *
 * Targets are laid out from the records handed in, which are the FILTERED
 * records already on screen. An export of a filtered view is an export of what
 * the user is looking at; exporting the unfiltered repo instead would hand
 * them an image they never saw.
 */

import { buildTreemap } from './treemap.js';
import { paintMap } from './paint.js';

/**
 * @typedef {'avatar' | 'banner' | 'screen'} ExportKind
 * @typedef {{w: number, h: number, scale: number, labels: boolean, labelScale: number}} ExportTarget
 */

/**
 * Fixed sizes, named for what they are used for. `screen` has no size of its
 * own -- it takes the live viewport's.
 *
 * `labels: false` on the avatar is not a style preference. An avatar is
 * displayed at roughly 48-96px, where 8.5px type inside a 1024px image lands
 * well under one device pixel -- an unreadable mark carries no information, and
 * this project does not draw those. The banner scales its type with the image
 * so it reads at the size a banner is actually displayed.
 */
export const TARGETS = {
	avatar: { w: 1024, h: 1024, labels: false, button: 'avatar' },
	banner: { w: 3000, h: 1000, labels: true, button: 'banner' },
	screen: { w: null, h: null, labels: true, button: 'as shown' }
};

/**
 * Type scales with the image; 900px wide is the reference on-screen width.
 * @param {number} w
 */
export function labelScaleFor(w) {
	return Math.max(1, w / 900);
}

/**
 * @param {string} kind
 * @param {{w: number, h: number, ratio?: number}} viewport  the live canvas, for 'screen'
 * @returns {ExportTarget}
 */
export function targetFor(kind, viewport) {
	const t = /** @type {Record<string, any>} */ (TARGETS)[kind];
	if (!t) throw new Error(`unknown export target: ${kind}`);
	if (t.w != null && t.h != null) {
		return { w: t.w, h: t.h, scale: 1, labels: t.labels, labelScale: labelScaleFor(t.w) };
	}
	// 'screen' means exactly what is on screen: the same layout dimensions, at
	// the display's own pixel density, with type at its on-screen size. A
	// re-layout at a scaled-up size would resolve different cells and stop
	// being "as shown".
	return {
		w: Math.max(1, Math.round(viewport.w)),
		h: Math.max(1, Math.round(viewport.h)),
		scale: Math.max(1, viewport.ratio || 1),
		labels: true,
		labelScale: 1
	};
}

/**
 * Handles are already filename-safe apart from the odd colon in a DID.
 * @param {string | null | undefined} label
 * @param {string} kind
 * @param {number} w
 * @param {number} h
 */
export function pngFilename(label, kind, w, h) {
	const slug =
		String(label || 'repository')
			.replace(/[^a-zA-Z0-9._-]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 60) || 'repository';
	return `${slug}-${kind}-${w}x${h}.png`;
}

/**
 * Lay out and paint one target onto a detached canvas.
 *
 * A DOM canvas, not an OffscreenCanvas: the labels are set in IBM Plex Mono,
 * and a detached canvas resolves document fonts.
 *
 * @param {object} o
 * @param {any[]} o.records
 * @param {Map<string, number>} o.hueOf
 * @param {'bytes'|'records'} o.weigh
 * @param {ExportTarget} o.target
 * @param {string} o.ink
 * @param {string} o.background
 * @returns {HTMLCanvasElement}
 */
export function renderTarget({ records, hueOf, weigh, target, ink, background }) {
	const { w, h, scale, labels, labelScale } = target;
	const cv = document.createElement('canvas');
	cv.width = Math.round(w * scale);
	cv.height = Math.round(h * scale);
	const ctx = cv.getContext('2d');
	if (!ctx) throw new Error('2D canvas unavailable');
	ctx.setTransform(scale, 0, 0, scale, 0, 0);
	const map = buildTreemap(records, { w, h, weigh, hueOf });
	// Exports are opaque. On screen the page background shows through any
	// sub-pixel seam between rects; a transparent PNG would leak whatever it is
	// placed on into those seams instead.
	paintMap(ctx, map, { w, h, ink, background, labels, labelScale, labelInset: { top: 0, left: 0 } });
	return cv;
}

/**
 * @param {HTMLCanvasElement} cv
 * @returns {Promise<Blob>}
 */
export function canvasToPng(cv) {
	return new Promise((resolve, reject) => {
		cv.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))),
			'image/png'
		);
	});
}

/**
 * A synthetic anchor, deliberately: `window.open` with a features string is a
 * popup, and blockers kill it silently.
 *
 * @param {Blob} blob
 * @param {string} filename
 */
export function saveBlob(blob, filename) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.style.display = 'none';
	document.body.appendChild(a);
	a.click();
	a.remove();
	// Revoking synchronously can cancel the download in some browsers; well
	// after the click has been handled is safe.
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Render, encode and save in one step. Rejects; the caller reports.
 *
 * @param {object} o
 * @param {string} o.kind
 * @param {{w: number, h: number, ratio?: number}} o.viewport
 * @param {any[]} o.records
 * @param {Map<string, number>} o.hueOf
 * @param {'bytes'|'records'} o.weigh
 * @param {string} o.ink
 * @param {string} o.background
 * @param {string | null} [o.label]
 */
export async function exportPng({
	kind,
	viewport,
	records,
	hueOf,
	weigh,
	ink,
	background,
	label
}) {
	const target = targetFor(kind, viewport);
	const cv = renderTarget({ records, hueOf, weigh, target, ink, background });
	const blob = await canvasToPng(cv);
	saveBlob(blob, pngFilename(label, kind, target.w, target.h));
	return { bytes: blob.size, w: target.w, h: target.h };
}
