<script>
	import { PLATE } from '$lib/portrait/layout.js';

	let {
		plates = [],
		stackDepth = 0,
		cam = $bindable(300),
		ax = $bindable(-24),
		ay = $bindable(32),
		zoom = $bindable(0.55),
		userZoomed = $bindable(false),
		onhover,
		onfocus,
		onopen
	} = $props();

	const PERSP = 4000;
	const CAM_HOME = 300;
	// plates flown past fade instead of blowing up through the lens
	const NEAR_FADE = 350;
	const NEAR_HIDE = 900;

	let stageEl;
	let stageW = $state(1000);

	/** one wheel notch crosses a fixed fraction of a life, whatever its depth */
	const step = $derived(Math.max(20, Math.min(120, Math.abs(stackDepth) / 80)));

	export function home() {
		cam = CAM_HOME;
		userZoomed = false;
		zoom = fitZoom();
	}
	export function glide(tx, ty) {
		// rAF is suspended in a hidden or throttled tab; jump rather than stall
		if (matchMedia('(prefers-reduced-motion:reduce)').matches || document.hidden) {
			ax = tx;
			ay = ty;
			return;
		}
		const sx = ax;
		const sy = ay;
		const t0 = performance.now();
		(function stepAnim(t) {
			const k = Math.min((t - t0) / 520, 1);
			const e = 1 - Math.pow(1 - k, 3);
			ax = sx + (tx - sx) * e;
			ay = sy + (ty - sy) * e;
			if (k < 1) requestAnimationFrame(stepAnim);
		})(t0);
	}
	function fitZoom() {
		return Math.max(0.25, Math.min(1.2, (0.26 * (stageW || 1000)) / PLATE));
	}

	/* ---- per-plate visibility, derived from where the camera stands ---- */
	const shaded = $derived(
		plates.map((p) => {
			const zp = p.z - cam;
			const f = zp > NEAR_FADE ? Math.max(0, 1 - (zp - NEAR_FADE) / (NEAR_HIDE - NEAR_FADE)) : 1;
			return { p, zp, f, visible: f > 0.02, alpha: p.alpha * f };
		})
	);
	/** where we are = the visible plate nearest the plane we stand on */
	const focus = $derived(
		shaded
			.filter((s) => s.visible)
			.reduce((best, s) => {
				const d = Math.abs(s.zp + CAM_HOME);
				return !best || d < best.d ? { d, s } : best;
			}, null)?.s?.p ?? null
	);
	$effect(() => {
		onfocus?.(focus);
	});

	/* ---- flight: velocity with damping, so travel glides and coasts ---- */
	const FLY = { vel: 0, yaw: 0, pitch: 0, zvel: 0 };
	const held = new Set();
	const DAMP = 0.9;
	const KEYS = ['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
	let flying = false;
	let lastT = 0;

	function travel(dz) {
		const lo = stackDepth - 600;
		const want = cam + dz;
		cam = Math.max(lo, Math.min(600, want));
		if (cam !== want) FLY.vel = 0; // stop coasting into either end
	}
	function flightStep(dt) {
		const fwd =
			(held.has('w') || held.has('arrowup') ? 1 : 0) -
			(held.has('s') || held.has('arrowdown') ? 1 : 0);
		const turn =
			(held.has('d') || held.has('arrowright') ? 1 : 0) -
			(held.has('a') || held.has('arrowleft') ? 1 : 0);
		const tilt = (held.has('e') ? 1 : 0) - (held.has('q') ? 1 : 0);
		FLY.vel -= fwd * step * 150 * dt;
		FLY.yaw += turn * 260 * dt;
		FLY.pitch += tilt * 260 * dt;
		const k = Math.pow(DAMP, dt * 60);
		FLY.vel *= k;
		FLY.yaw *= k;
		FLY.pitch *= k;
		FLY.zvel *= k;
		if (Math.abs(FLY.vel) > 0.5) travel(FLY.vel * dt);
		if (Math.abs(FLY.yaw) > 0.02) ay += FLY.yaw * dt;
		if (Math.abs(FLY.pitch) > 0.02) ax = Math.max(-89, Math.min(89, ax + FLY.pitch * dt));
		if (Math.abs(FLY.zvel) > 0.002) {
			userZoomed = true;
			zoom = Math.max(0.15, Math.min(4, zoom * (1 + FLY.zvel * dt)));
		}
		return (
			!!(fwd || turn || tilt) ||
			Math.abs(FLY.vel) > 0.5 ||
			Math.abs(FLY.yaw) > 0.02 ||
			Math.abs(FLY.pitch) > 0.02 ||
			Math.abs(FLY.zvel) > 0.002
		);
	}
	function loop(t) {
		const dt = lastT ? Math.min((t - lastT) / 1000, 0.05) : 1 / 60;
		lastT = t;
		const alive = flightStep(dt);
		if (alive && !document.hidden) requestAnimationFrame(loop);
		else {
			flying = false;
			lastT = 0;
		}
	}
	function kick() {
		if (document.hidden) {
			flightStep(1 / 60);
			return;
		}
		if (!flying) {
			flying = true;
			lastT = 0;
			requestAnimationFrame(loop);
		}
	}
	function wheel(e) {
		e.preventDefault();
		if (e.shiftKey) FLY.zvel -= e.deltaY * 0.02;
		else FLY.vel -= e.deltaY * step * 0.25;
		kick();
	}
	function keydown(e) {
		if (e.target instanceof HTMLInputElement) return;
		const k = e.key.toLowerCase();
		if (!KEYS.includes(k)) return;
		e.preventDefault();
		held.add(k);
		kick();
	}

	/* ---- orbit and tap. A press is captured so the drag survives leaving the
	   element, which means click never fires on the mark — so a tap is detected
	   on pointerup with a movement threshold instead. ---- */
	let dragging = $state(false); // drives the grab/grabbing cursor, so reactive
	let lx = 0;
	let ly = 0;
	let pressMark = null;
	let pressX = 0;
	let pressY = 0;
	let dragMoved = false;

	function pointerdown(e) {
		pressMark = e.target?.closest?.('.m') ?? null;
		pressX = e.clientX;
		pressY = e.clientY;
		dragMoved = false;
		dragging = true;
		lx = e.clientX;
		ly = e.clientY;
		stageEl.setPointerCapture(e.pointerId);
	}
	function pointermove(e) {
		if (!dragging) return;
		if (Math.hypot(e.clientX - pressX, e.clientY - pressY) > 4) dragMoved = true;
		ay += (e.clientX - lx) * 0.35;
		ax = Math.max(-89, Math.min(89, ax - (e.clientY - ly) * 0.35));
		lx = e.clientX;
		ly = e.clientY;
	}
	function pointerup() {
		dragging = false;
		if (pressMark && !dragMoved) onopen?.(pressMark.dataset);
		pressMark = null;
	}
</script>

<svelte:window
	onkeydown={keydown}
	onkeyup={(e) => held.delete(e.key.toLowerCase())}
	onblur={() => held.clear()}
/>

<div
	class="stage"
	class:drag={dragging}
	bind:this={stageEl}
	bind:clientWidth={stageW}
	onwheel={wheel}
	onpointerdown={pointerdown}
	onpointermove={pointermove}
	onpointerup={pointerup}
	onmouseleave={() => onhover?.(null)}
	role="application"
	aria-label="Rotatable stack of sessions"
>
	<div class="scene">
		<div
			class="pivot"
			style="transform:scale({zoom}) rotateX({ax}deg) rotateY({ay}deg) translateZ({(-cam).toFixed(
				1
			)}px)"
		>
			{#each shaded as s (s.p.n)}
				{#if s.visible}
					<div
						class="tile"
						class:sel={focus === s.p}
						style="width:{PLATE}px;height:{PLATE}px;left:{-PLATE / 2}px;top:{-PLATE /
							2}px;opacity:{s.alpha.toFixed(3)};transform:translateZ({s.p
							.z}px) rotateZ({s.p.twist}deg);pointer-events:{s.alpha > 0.12 ? 'none' : 'none'}"
					>
						{#each s.p.marks as m, i (i)}
							<div
								class="m"
								style="left:{m.x}px;top:{m.y}px;width:{m.w}px;height:{m.h}px;background:{m.color}{m.kind ===
								'tear'
									? `;opacity:${m.alpha};mix-blend-mode:multiply`
									: ''};pointer-events:{s.alpha > 0.12 ? 'auto' : 'none'}"
								data-col={m.col}
								data-rkey={m.rkey ?? ''}
								data-kind={m.kind}
								data-from={m.from ?? ''}
								data-to={m.to ?? ''}
								data-count={m.count ?? ''}
								data-err={m.err ?? ''}
								onmouseover={() => onhover?.({ mark: m, plate: s.p })}
								onfocus={() => onhover?.({ mark: m, plate: s.p })}
								role="presentation"
							></div>
						{/each}
					</div>
				{/if}
			{/each}
		</div>
	</div>
</div>

<style>
	.stage {
		position: absolute;
		inset: 0;
		overflow: hidden;
		cursor: grab;
	}
	.stage.drag {
		cursor: grabbing;
	}
	.scene {
		position: absolute;
		inset: 0;
		perspective: 4000px;
		perspective-origin: 50% 50%;
	}
	.pivot {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 0;
		height: 0;
		transform-style: preserve-3d;
	}
	.tile {
		position: absolute;
		transform-style: preserve-3d;
		will-change: transform;
		pointer-events: none;
	}
	.tile.sel {
		outline: 1px solid var(--ink);
		outline-offset: 3px;
	}
	.m {
		position: absolute;
		pointer-events: auto;
		cursor: pointer;
	}
</style>
