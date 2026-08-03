/**
 * The one painter for a treemap, shared by the on-screen canvas and the PNG
 * export. Two copies would drift, and a downloaded image that disagrees with
 * the screen is a second, unverifiable claim about the same repository.
 *
 * It takes a 2D context and never touches sizing, devicePixelRatio, the DOM or
 * CSS -- the caller owns those. That keeps `treemap.js` -> data ->
 * `paintMap` -> pixels a straight line, and keeps this testable with a
 * recording stub in place of a real context.
 */

const LABEL_FONT_PX = 8.5;
const LABEL_BOX_PX = 12;
const LABEL_PAD_PX = 3;
const LABEL_PLATE = 'rgba(255,255,255,0.84)';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} map  the object returned by buildTreemap
 * @param {object} o
 * @param {number} o.w              layout width, in the same units as the map
 * @param {number} o.h              layout height
 * @param {string} [o.ink]          chrome colour for label text
 * @param {string|null} [o.background]  fill first (export), or null to clear (screen)
 * @param {boolean} [o.labels]      draw collection labels
 * @param {number} [o.labelScale]   multiply label type and its plate
 * @param {{top:number,left:number}} [o.labelInset]  skip labels under a top/left overlay
 */
export function paintMap(
	ctx,
	map,
	{ w, h, ink = '#171717', background = null, labels = true, labelScale = 1, labelInset = { top: 0, left: 0 } }
) {
	if (background) {
		ctx.fillStyle = background;
		ctx.fillRect(0, 0, w, h);
	} else {
		ctx.clearRect(0, 0, w, h);
	}

	// Batch by fill colour: setting fillStyle per record would be ~200k state
	// changes on a large repo, where grouping makes it a few thousand.
	const byColour = new Map();
	for (const b of map.blocks) {
		if (b.aggregate || !b.cells.length) {
			// treemap.js only sets block.color on aggregated blocks; an empty
			// collection has neither cells nor a colour, and passing undefined
			// to fillStyle silently paints the previous colour
			if (!b.color) continue;
			const list = byColour.get(b.color) ?? [];
			list.push([b.x, b.y, b.w, b.h]);
			byColour.set(b.color, list);
			continue;
		}
		for (const c of b.cells) {
			const list = byColour.get(c.color) ?? [];
			list.push([b.x + c.x, b.y + c.y, c.w, c.h]);
			byColour.set(c.color, list);
		}
	}

	for (const [colour, rects] of byColour) {
		ctx.fillStyle = colour;
		for (const [x, y, rw, rh] of rects) ctx.fillRect(x, y, rw, rh);
	}

	if (!labels) return;

	// labels last, so no cell paints over them
	const s = labelScale;
	const insetTop = labelInset?.top ?? 0;
	const insetLeft = labelInset?.left ?? 0;
	ctx.font = `${LABEL_FONT_PX * s}px "IBM Plex Mono", monospace`;
	ctx.textBaseline = 'top';
	for (const b of map.blocks) {
		if (!b.label) continue;
		// mobile: omit labels for blocks under the railtoggle so the button
		// doesn't sit on top of them. The cell is still drawn -- tap still
		// works, the label is just less readable than the button over it.
		if (b.y < insetTop || b.x < insetLeft) continue;
		const tw = ctx.measureText(b.label).width;
		ctx.fillStyle = LABEL_PLATE;
		ctx.fillRect(b.x, b.y, tw + 2 * LABEL_PAD_PX * s, LABEL_BOX_PX * s);
		ctx.fillStyle = ink;
		ctx.fillText(b.label, b.x + LABEL_PAD_PX * s, b.y + 2 * s);
	}
}
