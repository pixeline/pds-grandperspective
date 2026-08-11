/**
 * Draw a polar layout to any 2D context. Context in, nothing out — the same
 * seam as paint.js, so an offscreen context yields a PNG avatar with no new
 * code. Chrome is neutral ink; only the data points carry behaviour hue and
 * recency. Rings are heptagons (no circles) and points are squares, so the
 * no-rounded / neutral-chrome rules hold.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<import('./polar.js').polarLayout>} layout
 * @param {{ink: string, inkSoft: string, fill: string}} colors
 */
export function paintPolar(ctx, layout, colors) {
	const { center, axes, polygon, rings } = layout;

	const heptagon = (rad, stroke) => {
		ctx.beginPath();
		axes.forEach((a, i) => {
			const x = center.x + rad * Math.cos(a.angle);
			const y = center.y + rad * Math.sin(a.angle);
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		});
		ctx.closePath();
		ctx.strokeStyle = stroke;
		ctx.lineWidth = 1;
		ctx.stroke();
	};

	for (const r of rings) heptagon(r.r, colors.inkSoft); // concentric gridlines

	// Ring scale labels ('10' / '100' / '1k' / '10k', or '10k+' when clamped),
	// set where each ring crosses the top (Create) spoke. Text, not a mark on
	// the data -- neutral chrome, same as the gridlines it annotates.
	ctx.fillStyle = colors.inkSoft;
	ctx.font = '9px "JetBrains Mono", monospace';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'bottom';
	for (const r of rings) {
		ctx.fillText(r.label, center.x, center.y - r.r - 1);
	}

	ctx.strokeStyle = colors.inkSoft; // spokes
	ctx.lineWidth = 1;
	for (const a of axes) {
		ctx.beginPath();
		ctx.moveTo(center.x, center.y);
		ctx.lineTo(a.x, a.y);
		ctx.stroke();
	}

	ctx.beginPath(); // data polygon
	polygon.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
	ctx.closePath();
	ctx.fillStyle = colors.fill;
	ctx.fill();
	ctx.strokeStyle = colors.ink;
	ctx.lineWidth = 1.5;
	ctx.stroke();

	for (const a of axes) { // data points: hue = behaviour, saturation = recency
		// 70% is the max saturation cap, so even a fresh ray avoids full-blast neon
		ctx.fillStyle = `hsl(${a.hue.toFixed(1)} ${(a.sat * 70).toFixed(0)}% 50%)`;
		ctx.fillRect(a.px - 2.5, a.py - 2.5, 5, 5);
	}
}
