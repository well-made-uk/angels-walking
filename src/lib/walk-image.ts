// The share image for a walk: the walk's name over one of five map-and-trail
// illustrations, drawn as SVG (and turned into a PNG in the browser). Every
// illustration is generated from a seed, so a new seed gives new hills, routes
// and rivers. Browser only: fitting the name to the picture measures text on a canvas.

export const IMAGE_SIZE = 1080;
const W = IMAGE_SIZE;
const H = IMAGE_SIZE;

// Colours match the site (src/app.css) and its hero.
const C = {
	paper: '#e9f5ef',
	paperLight: '#f4f9f6',
	contour: '#a9d8bf',
	contourIndex: '#86c4a3',
	ink: '#153d2e',
	muted: '#5b7a6d',
	trail: '#e8590c',
	white: '#ffffff',
	mint: '#cfe9da',
	mintDeep: '#b6dcc7',
	river: '#bfe3df',
	riverLight: '#d9f0ec',
	border: '#d9eae1',
	night: '#0c1c16',
	nightLine: '#1d4034',
	nightIndex: '#2f5c4c',
	cream: '#eaf7f0',
	trailNight: '#ff8a4c'
};

// A heavy condensed sans that reads like a trail signpost. These are fonts that
// come with the device, so the look varies a little between devices.
export const IMAGE_FONT = {
	family: "'Avenir Next Condensed', 'Avenir Next', 'Arial Narrow', sans-serif",
	weight: 800
};
const FAMILY = IMAGE_FONT.family;

// ---------- helpers -------------------------------------------------------
interface Rng {
	(): number;
	range: (lo: number, hi: number) => number;
	int: (lo: number, hi: number) => number;
	pick: <T>(items: T[]) => T;
}

function rngFrom(seed: number): Rng {
	let a = seed >>> 0;
	const next = (() => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}) as Rng;
	next.range = (lo, hi) => lo + next() * (hi - lo);
	next.int = (lo, hi) => Math.floor(next.range(lo, hi + 1));
	next.pick = (items) => items[Math.floor(next() * items.length)];
	return next;
}

export const randomSeed = () => Math.floor(Math.random() * 1e9);

/** A steady seed from some text, so the same walk starts with the same pictures. */
export function seedFrom(text: string, n = 0) {
	let h = 2166136261 ^ n;
	for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
	return h >>> 0;
}

const f1 = (n: number) => n.toFixed(1);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fontAttr = FAMILY.replace(/"/g, "'");

type Pt = [number, number];

// A wobbly closed ring, as in the site's hero (src/lib/components/Hero.svelte).
function ring(cx: number, cy: number, r: number, seed: number, squash = 0.78) {
	const n = 28;
	const pts: Pt[] = [];
	for (let i = 0; i < n; i++) {
		const t = (i / n) * Math.PI * 2;
		const k = 1 + 0.12 * Math.sin(3 * t + seed) + 0.07 * Math.sin(5 * t + seed * 1.7) + 0.04 * Math.sin(2 * t + seed * 0.5);
		pts.push([cx + Math.cos(t) * r * k, cy + Math.sin(t) * r * k * squash]);
	}
	let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
	for (let i = 0; i < n; i++) {
		const [p0, p1, p2, p3] = [pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]];
		const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
		const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
		d += ` C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(p2[0])} ${f1(p2[1])}`;
	}
	return d + 'Z';
}

// A smooth open curve through points (Catmull-Rom).
function curve(pts: Pt[]) {
	let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
	for (let i = 0; i < pts.length - 1; i++) {
		const p0 = pts[Math.max(0, i - 1)];
		const p1 = pts[i];
		const p2 = pts[i + 1];
		const p3 = pts[Math.min(pts.length - 1, i + 2)];
		const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
		const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
		d += ` C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(p2[0])} ${f1(p2[1])}`;
	}
	return d;
}

interface Hill {
	cx: number;
	cy: number;
	r: number;
	n: number;
}

function contours(rng: Rng, hills: Hill[], line: string, index: string, width = 2.5) {
	let out = '';
	for (const h of hills) {
		const seed = rng.range(0, 7);
		for (let i = 0; i < h.n; i++) {
			const isIndex = (h.n - i) % 4 === 0;
			out += `<path d="${ring(h.cx, h.cy, (h.r * (i + 1)) / h.n, seed + i * 0.15)}" fill="none" stroke="${isIndex ? index : line}" stroke-width="${isIndex ? width * 1.5 : width}"/>`;
		}
	}
	return out;
}

function randomHills(rng: Rng, count: number, area: { x0: number; x1: number; y0: number; y1: number }): Hill[] {
	return Array.from({ length: count }, () => ({
		cx: rng.range(area.x0, area.x1),
		cy: rng.range(area.y0, area.y1),
		r: rng.range(200, 380),
		n: rng.int(7, 11)
	}));
}

// Route waypoints running left to right through a band.
function routePoints(rng: Rng, x0: number, x1: number, yMid: number, amp: number, count = 6): Pt[] {
	const pts: Pt[] = [];
	for (let i = 0; i < count; i++) {
		const t = i / (count - 1);
		const wobble = (i % 2 ? 1 : -1) * rng.range(0.35, 1) * amp;
		pts.push([x0 + (x1 - x0) * t + rng.range(-24, 24), yMid + wobble]);
	}
	return pts;
}

const pin = (x: number, y: number, s = 2.2, fill = C.trail, ink = C.white) =>
	`<g transform="translate(${f1(x - 12 * s)} ${f1(y - 31 * s)}) scale(${s})"><path d="M12 31C12 31 2 18.5 2 11a10 10 0 0 1 20 0c0 7.5-10 20-10 20z" fill="${fill}" stroke="${ink}" stroke-width="1.2"/><circle cx="12" cy="11" r="4" fill="${ink}"/></g>`;

const startDot = (x: number, y: number, ink = C.ink, around = C.white) =>
	`<circle cx="${f1(x)}" cy="${f1(y)}" r="19" fill="${around}"/><circle cx="${f1(x)}" cy="${f1(y)}" r="12" fill="${ink}"/>`;

const cafe = (x: number, y: number, bg = C.white, ink = C.ink) =>
	`<g transform="translate(${f1(x - 30)} ${f1(y - 30)})"><circle cx="30" cy="30" r="30" fill="${bg}" stroke="${C.trail}" stroke-width="5"/><g transform="translate(11 11) scale(1.6)" fill="none" stroke="${ink}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z M16 10h1.5a2.5 2.5 0 0 1 0 5H16 M8 4.5c0 1 1 1 1 2 M11.5 4.5c0 1 1 1 1 2"/></g></g>`;

function routeLine(d: string, { shadow = C.white, color = C.trail, glow = false } = {}) {
	return (
		(glow
			? `<path d="${d}" fill="none" stroke="${color}" stroke-width="22" stroke-linecap="round" opacity="0.28" filter="url(#blur)"/>`
			: `<path d="${d}" fill="none" stroke="${shadow}" stroke-width="17" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`) +
		`<path d="${d}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 17"/>`
	);
}

// ---------- the name ------------------------------------------------------
let measurer: CanvasRenderingContext2D | null = null;
const measure = () => (measurer ??= document.createElement('canvas').getContext('2d')!);

interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

// The biggest size at which the name wraps into the box.
function layoutTitle(text: string, box: Box) {
	const t = text.toUpperCase().trim().replace(/\s+/g, ' ');
	const words = t.split(' ');
	const lh = 1.02;
	const ctx = measure();
	for (let size = 170; size >= 36; size -= 3) {
		ctx.font = `${IMAGE_FONT.weight} ${size}px ${FAMILY}`;
		const lines: string[] = [];
		let line = '';
		let tooWide = false;
		for (const w of words) {
			const test = line ? `${line} ${w}` : w;
			if (ctx.measureText(test).width <= box.w) line = test;
			else {
				if (line) lines.push(line);
				line = w;
				if (ctx.measureText(w).width > box.w) tooWide = true;
			}
		}
		if (line) lines.push(line);
		if (!tooWide && lines.length * size * lh <= box.h) return { lines, size, lh };
	}
	return { lines: [t], size: 36, lh };
}

function titleText(text: string, box: Box, color: string, align: 'top' | 'middle' | 'bottom' = 'top') {
	const { lines, size, lh } = layoutTitle(text, box);
	const block = lines.length * size * lh;
	const top = align === 'bottom' ? box.y + box.h - block : align === 'middle' ? box.y + (box.h - block) / 2 : box.y;
	const y0 = top + size * 0.84;
	return lines
		.map(
			(l, i) =>
				`<text x="${box.x}" y="${f1(y0 + i * size * lh)}" font-family="${fontAttr}" font-weight="${IMAGE_FONT.weight}" font-size="${size}" fill="${color}" letter-spacing="${f1(size * 0.012)}">${esc(l)}</text>`
		)
		.join('');
}

function brand(x: number, y: number, color: string, accent: string, scale = 1) {
	const hole = color === C.ink ? C.paperLight : C.night;
	return `<g transform="translate(${x} ${y}) scale(${scale})"><g transform="translate(0 -30) scale(1.3)"><path d="M12 31C12 31 2 18.5 2 11a10 10 0 0 1 20 0c0 7.5-10 20-10 20z" fill="${accent}"/><circle cx="12" cy="11" r="4" fill="${hole}"/></g><text x="44" y="0" font-family="${fontAttr}" font-weight="700" font-size="28" letter-spacing="4" fill="${color}">ANGELS WALKING GROUP</text></g>`;
}

// ---------- the five styles -----------------------------------------------
export interface ImageStyle {
	name: string;
	blurb: string;
	draw: (rng: Rng, text: string) => string;
}

export const IMAGE_STYLES: ImageStyle[] = [
	{
		name: 'Contours',
		blurb: 'The site header: hills as contour lines and a dotted route to a pin.',
		draw(rng, text) {
			const hills = randomHills(rng, 6, { x0: 0, x1: W, y0: 40, y1: 560 });
			const pts = routePoints(rng, 120, 960, 330, 150, 6);
			const d = curve(pts);
			return (
				`<rect width="${W}" height="${H}" fill="${C.paper}"/>` +
				contours(rng, hills, C.contour, C.contourIndex) +
				routeLine(d) +
				startDot(...pts[0]) +
				cafe(pts[3][0], pts[3][1] - 2) +
				pin(pts[5][0], pts[5][1] + 4) +
				titleText(text, { x: 80, y: 600, w: 920, h: 320 }, C.ink, 'bottom') +
				brand(80, 1000, C.ink, C.trail)
			);
		}
	},
	{
		name: 'Night map',
		blurb: 'Deep forest green with a glowing orange route, for a cosy winter feel.',
		draw(rng, text) {
			const hills = randomHills(rng, 7, { x0: 0, x1: W, y0: 380, y1: H });
			const pts = routePoints(rng, 120, 960, 740, 150, 6);
			const d = curve(pts);
			return (
				`<rect width="${W}" height="${H}" fill="${C.night}"/>` +
				contours(rng, hills, C.nightLine, C.nightIndex) +
				routeLine(d, { color: C.trailNight, glow: true }) +
				startDot(...pts[0], C.cream, C.night) +
				cafe(pts[3][0], pts[3][1], C.night, C.cream) +
				pin(pts[5][0], pts[5][1] + 4, 2.2, C.trailNight, C.night) +
				titleText(text, { x: 80, y: 100, w: 920, h: 400 }, C.cream, 'top') +
				brand(80, 1010, C.cream, C.trailNight)
			);
		}
	},
	{
		name: 'Grid map',
		blurb: 'An Ordnance-style grid with numbered waymarkers and a name label.',
		draw(rng, text) {
			let grid = '';
			for (let i = 0; i <= 9; i++) {
				const p = i * 120;
				const major = i % 3 === 0;
				const stroke = major ? C.border : '#e3f0e9';
				const width = major ? 4 : 2;
				grid += `<line x1="${p}" y1="0" x2="${p}" y2="${H}" stroke="${stroke}" stroke-width="${width}"/><line x1="0" y1="${p}" x2="${W}" y2="${p}" stroke="${stroke}" stroke-width="${width}"/>`;
			}
			const base = rng.int(30, 70);
			let labels = '';
			for (let i = 0; i < 9; i++) {
				labels += `<text x="${i * 120 + 8}" y="26" font-family="monospace" font-size="20" fill="${C.muted}">${base + i}</text>`;
				if (i) labels += `<text x="8" y="${i * 120 + 28}" font-family="monospace" font-size="20" fill="${C.muted}">${base + 20 + i}</text>`;
			}
			const hills = randomHills(rng, 3, { x0: 100, x1: 980, y0: 80, y1: 520 });
			const pts = routePoints(rng, 110, 960, 360, 140, 6);
			const d = curve(pts);
			const marks = [1, 2, 3, 4]
				.map(
					(i, n) =>
						`<circle cx="${f1(pts[i][0])}" cy="${f1(pts[i][1])}" r="26" fill="${C.white}" stroke="${C.ink}" stroke-width="5"/><text x="${f1(pts[i][0])}" y="${f1(pts[i][1] + 10)}" text-anchor="middle" font-family="${fontAttr}" font-weight="700" font-size="30" fill="${C.ink}">${n + 1}</text>`
				)
				.join('');
			const compass = `<g transform="translate(930 150)"><circle r="62" fill="${C.white}" stroke="${C.ink}" stroke-width="5"/><path d="M0 -46 L13 8 L0 0 L-13 8Z" fill="${C.trail}"/><path d="M0 46 L13 -8 L0 0 L-13 -8Z" fill="${C.ink}" opacity="0.85"/><text y="-72" text-anchor="middle" font-family="${fontAttr}" font-weight="700" font-size="26" fill="${C.ink}">N</text></g>`;
			return (
				`<rect width="${W}" height="${H}" fill="${C.paperLight}"/>` +
				grid +
				labels +
				contours(rng, hills, '#cfe5d8', '#b7d9c6') +
				compass +
				routeLine(d) +
				startDot(...pts[0]) +
				marks +
				pin(pts[5][0], pts[5][1] + 4) +
				`<rect x="90" y="630" width="920" height="340" rx="26" fill="${C.ink}"/>` +
				`<rect x="70" y="610" width="920" height="340" rx="26" fill="${C.white}" stroke="${C.ink}" stroke-width="6"/>` +
				titleText(text, { x: 120, y: 650, w: 820, h: 210 }, C.ink, 'middle') +
				`<line x1="120" y1="880" x2="940" y2="880" stroke="${C.border}" stroke-width="3"/>` +
				brand(120, 925, C.ink, C.trail)
			);
		}
	},
	{
		name: 'Elevation',
		blurb: 'A ridge profile like the one on a trail page, with a pin on the high point.',
		draw(rng, text) {
			const x0 = 70;
			const x1 = 1010;
			const base = 970;
			const profile = (amp: number, seed: number): Pt[] => {
				const n = 14;
				const pts: Pt[] = [];
				for (let i = 0; i <= n; i++) {
					const t = i / n;
					const h = amp * (0.5 + 0.28 * Math.sin(t * 5 + seed) + 0.17 * Math.sin(t * 11 + seed * 2) + 0.08 * Math.sin(t * 23 + seed * 3.3));
					pts.push([x0 + (x1 - x0) * t, base - h]);
				}
				return pts;
			};
			const back = profile(330, rng.range(0, 6));
			const front = profile(250, rng.range(0, 6));
			const high = front.reduce((m, p) => (p[1] < m[1] ? p : m), front[0]);
			const area = (pts: Pt[], fill: string, stroke: string) =>
				`<path d="${curve(pts)} L${x1} ${base} L${x0} ${base}Z" fill="${fill}" stroke="${stroke}" stroke-width="${stroke === 'none' ? 0 : 5}" stroke-linejoin="round"/>`;
			let grid = '';
			for (let i = 0; i < 4; i++) {
				const y = base - 95 * (i + 1) - 40;
				grid += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${C.border}" stroke-width="3" stroke-dasharray="6 12"/>`;
			}
			let ticks = '';
			for (let i = 0; i <= 8; i++) {
				const x = x0 + ((x1 - x0) * i) / 8;
				ticks += `<line x1="${f1(x)}" y1="${base}" x2="${f1(x)}" y2="${base + 14}" stroke="${C.ink}" stroke-width="3"/>`;
			}
			return (
				`<rect width="${W}" height="${H}" fill="${C.paper}"/>` +
				grid +
				area(back, C.mint, 'none') +
				area(front, C.mintDeep, C.ink) +
				`<line x1="${f1(high[0])}" y1="${f1(high[1])}" x2="${f1(high[0])}" y2="${base}" stroke="${C.trail}" stroke-width="5" stroke-dasharray="2 14" stroke-linecap="round"/>` +
				startDot(front[0][0] + 14, front[0][1]) +
				pin(high[0], high[1] - 6) +
				`<line x1="${x0}" y1="${base}" x2="${x1}" y2="${base}" stroke="${C.ink}" stroke-width="4"/>` +
				ticks +
				titleText(text, { x: 80, y: 90, w: 920, h: 360 }, C.ink, 'top') +
				brand(80, 1040, C.ink, C.trail, 0.8)
			);
		}
	},
	{
		name: 'Parks & river',
		blurb: 'Map features: a river, green spaces, woodland symbols and a footpath.',
		draw(rng, text) {
			const rv = routePoints(rng, -40, 1120, 330, 120, 7).map((p): Pt => [p[0], p[1] + rng.range(-30, 30)]);
			const river = curve(rv);
			const blobs = Array.from({ length: 4 }, () => ({ cx: rng.range(120, 960), cy: rng.range(110, 520), r: rng.range(110, 190) }));
			let parks = '';
			let trees = '';
			for (const b of blobs) {
				parks += `<path d="${ring(b.cx, b.cy, b.r, rng.range(0, 7), 0.8)}" fill="${C.mint}" stroke="${C.mintDeep}" stroke-width="4"/>`;
			}
			for (let i = 0; i < 38; i++) {
				const b = rng.pick(blobs);
				const a = rng.range(0, 6.28);
				const r = rng.range(0, b.r * 0.7);
				trees += `<circle cx="${f1(b.cx + Math.cos(a) * r)}" cy="${f1(b.cy + Math.sin(a) * r * 0.8)}" r="${f1(rng.range(9, 15))}" fill="${C.contourIndex}" opacity="0.85"/>`;
			}
			let roads = '';
			for (let i = 0; i < 5; i++) {
				const x = rng.range(60, 1020);
				const y = rng.range(60, 560);
				roads += `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x + rng.range(-420, 420))}" y2="${f1(y + rng.range(-240, 240))}" stroke="${C.white}" stroke-width="${f1(rng.range(10, 20))}" stroke-linecap="round"/>`;
			}
			const pts = routePoints(rng, 110, 960, 360, 140, 6);
			const d = curve(pts);
			return (
				`<rect width="${W}" height="${H}" fill="${C.paperLight}"/>` +
				roads +
				`<path d="${river}" fill="none" stroke="${C.river}" stroke-width="84" stroke-linecap="round"/><path d="${river}" fill="none" stroke="${C.riverLight}" stroke-width="58" stroke-linecap="round"/>` +
				parks +
				trees +
				routeLine(d) +
				startDot(...pts[0]) +
				pin(pts[5][0], pts[5][1] + 4) +
				`<rect y="610" width="${W}" height="${H - 610}" fill="${C.ink}"/>` +
				`<path d="M0 610 Q 270 570 540 610 T 1080 610" fill="none" stroke="${C.trail}" stroke-width="8" stroke-dasharray="1 17" stroke-linecap="round"/>` +
				titleText(text, { x: 80, y: 655, w: 920, h: 290 }, C.cream, 'middle') +
				brand(80, 1034, C.cream, C.trailNight, 0.85)
			);
		}
	}
];

// ---------- output --------------------------------------------------------
const DEFS = `<defs><filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter></defs>`;

/** One finished image, as SVG text. */
export function walkImageSvg(style: number, seed: number, title: string) {
	const name = title.trim() || 'Your walk name';
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${DEFS}${IMAGE_STYLES[style].draw(rngFrom(seed), name)}</svg>`;
}

/** Make sure the image font is ready before drawing (so text is measured with it). */
export async function fontsReady() {
	await document.fonts?.load(`${IMAGE_FONT.weight} 100px ${FAMILY}`).catch(() => {});
	await document.fonts?.ready;
}

export function svgToPng(svg: string): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			const canvas = document.createElement('canvas');
			canvas.width = W;
			canvas.height = H;
			canvas.getContext('2d')!.drawImage(img, 0, 0);
			canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not make the image'))), 'image/png');
		};
		img.onerror = () => reject(new Error('Could not draw the image'));
		img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
	});
}

export const imageFileName = (title: string, style: number) =>
	`${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'walk'}-${IMAGE_STYLES[style].name.toLowerCase().replace(/\W+/g, '-')}.png`;
