<script lang="ts">
	import { SITE } from '$lib/site';

	// Contour lines, like hills on a walking map. Each hill is a set of nested,
	// slightly wobbly rings; every fourth ring is a bolder "index" contour.
	const hills = [
		{ cx: 1180, cy: 170, r: 270, n: 10, seed: 1 },
		{ cx: 330, cy: 530, r: 310, n: 11, seed: 2.3 },
		{ cx: 1520, cy: 560, r: 230, n: 8, seed: 4.1 },
		{ cx: 720, cy: 30, r: 190, n: 7, seed: 5.5 },
		{ cx: -40, cy: 110, r: 210, n: 8, seed: 3.2 },
		{ cx: 820, cy: 600, r: 150, n: 5, seed: 6.4 }
	];

	function ring(cx: number, cy: number, r: number, seed: number) {
		const n = 28;
		const pts: [number, number][] = [];
		for (let i = 0; i < n; i++) {
			const t = (i / n) * Math.PI * 2;
			const k = 1 + 0.12 * Math.sin(3 * t + seed) + 0.07 * Math.sin(5 * t + seed * 1.7) + 0.04 * Math.sin(2 * t + seed * 0.5);
			pts.push([cx + Math.cos(t) * r * k, cy + Math.sin(t) * r * k * 0.78]);
		}
		// Closed Catmull-Rom spline through the points, as cubic Béziers.
		let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
		for (let i = 0; i < n; i++) {
			const [p0, p1, p2, p3] = [pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]];
			const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
			const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
			d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
		}
		return d + 'Z';
	}

	const contours = hills.flatMap((h) =>
		Array.from({ length: h.n }, (_, i) => ({
			d: ring(h.cx, h.cy, (h.r * (i + 1)) / h.n, h.seed + i * 0.15),
			index: (h.n - i) % 4 === 0
		}))
	);

	// The trail, in a 100 x 110 box that stretches to the width of the text
	// column. Keep these in step with the start dot, café and pin positions.
	const trail = 'M2 88 C18 88 24 44 42 54 S66 100 78 64 S90 34 96 32';
</script>

<header class="hero">
	<svg class="map" viewBox="0 0 1600 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
		{#each contours as c}
			<path d={c.d} class:index={c.index} />
		{/each}
	</svg>

	<div class="inner">
		<p class="badge"><span class="dot" aria-hidden="true"></span>All welcome · every pace</p>
		<h1>{SITE.name}</h1>
		<p class="lede">Friendly walks, good chats and the odd café stop. Come as you are.</p>

		<div class="route" aria-hidden="true">
			<svg viewBox="0 0 100 110" preserveAspectRatio="none">
				<path class="trail-shadow" d={trail} />
				<path class="trail" d={trail} />
			</svg>
			<span class="start"></span>
			<span class="stop" title="Café stop">
				<svg viewBox="0 0 24 24"><path d="M5 9h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z M16 10h1.5a2.5 2.5 0 0 1 0 5H16 M8 4.5c0 1 1 1 1 2 M11.5 4.5c0 1 1 1 1 2" /></svg>
			</span>
			<span class="pin">
				<span class="pulse"></span>
				<svg viewBox="0 0 24 32"><path d="M12 31C12 31 2 18.5 2 11a10 10 0 0 1 20 0c0 7.5-10 20-10 20z" /><circle cx="12" cy="11" r="4" /></svg>
			</span>
		</div>
	</div>
</header>

<style>
	.hero {
		--paper: #e9f5ef;
		--contour: #a9d8bf;
		--contour-index: #86c4a3;
		--ink: #153d2e;
		--ink-soft: #2f6150;
		--trail: #e8590c;
		--trail-halo: #ffffff;
		--badge: rgb(255 255 255 / 0.75);

		position: relative;
		overflow: hidden;
		margin-bottom: 2rem;
		background: var(--paper);
		color: var(--ink);
	}

	@media (prefers-color-scheme: dark) {
		.hero {
			--paper: #10241c;
			--contour: #234a39;
			--contour-index: #2f6049;
			--ink: #eaf7f0;
			--ink-soft: #b9dccb;
			--trail: #ff8a4c;
			--trail-halo: #10241c;
			--badge: rgb(16 36 28 / 0.7);
		}
	}

	.map {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.map path {
		fill: none;
		stroke: var(--contour);
		stroke-width: 1.1;
		vector-effect: non-scaling-stroke;
	}

	.map path.index {
		stroke: var(--contour-index);
		stroke-width: 1.8;
	}

	.inner {
		position: relative;
		max-width: 44rem;
		margin: 0 auto;
		padding: 2.25rem 1rem 1.25rem;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		margin: 0 0 0.9rem;
		padding: 0.3rem 0.8rem 0.3rem 0.55rem;
		border-radius: 999px;
		background: var(--badge);
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--ink);
		backdrop-filter: blur(4px);
	}

	.dot {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: var(--trail);
	}

	h1 {
		font-size: clamp(2.1rem, 8vw, 3rem);
		letter-spacing: -0.02em;
		margin: 0 0 0.5rem;
		color: var(--ink);
	}

	.lede {
		margin: 0;
		max-width: 26rem;
		font-size: 1.1rem;
		font-weight: 500;
		color: var(--ink-soft);
	}

	/* The trail strip under the text */
	.route {
		position: relative;
		height: 110px;
		margin-top: 0.75rem;
	}

	.route > svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	.trail,
	.trail-shadow {
		fill: none;
		stroke-linecap: round;
		vector-effect: non-scaling-stroke;
	}

	.trail-shadow {
		stroke: var(--trail-halo);
		stroke-width: 7;
		opacity: 0.6;
	}

	.trail {
		stroke: var(--trail);
		stroke-width: 3;
		stroke-dasharray: 9 7;
		animation: march 1.6s linear infinite;
	}

	@keyframes march {
		to {
			stroke-dashoffset: -16;
		}
	}

	/* Markers sit at the same points as the trail's start, middle and end
	   (x as % of the width, y in px of the 110px strip). */
	.start,
	.stop,
	.pin {
		position: absolute;
		transform: translate(-50%, -50%);
	}

	.start {
		left: 2%;
		top: 88px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--paper);
		border: 3px solid var(--trail);
	}

	.stop {
		left: 42%;
		top: 54px;
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: var(--paper);
		border: 2px solid var(--trail);
	}

	.stop svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: var(--trail);
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.pin {
		left: 96%;
		top: 32px;
		width: 28px;
		height: 37px;
		transform: translate(-50%, -100%);
	}

	.pin svg {
		position: relative;
		width: 100%;
		height: 100%;
	}

	.pin path {
		fill: var(--trail);
	}

	.pin circle {
		fill: var(--paper);
	}

	.pulse {
		position: absolute;
		left: 50%;
		bottom: -6px;
		width: 22px;
		height: 10px;
		border-radius: 50%;
		background: var(--trail);
		opacity: 0.35;
		transform: translateX(-50%);
		animation: pulse 2.2s ease-out infinite;
	}

	@keyframes pulse {
		from {
			transform: translateX(-50%) scale(0.6);
			opacity: 0.5;
		}
		to {
			transform: translateX(-50%) scale(2.2);
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.trail,
		.pulse {
			animation: none;
		}
	}

	@media (min-width: 700px) {
		.inner {
			padding-top: 3rem;
		}

		.route {
			height: 110px;
			margin-top: -1.5rem;
			margin-left: 45%;
		}
	}
</style>
