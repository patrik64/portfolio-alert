import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.primeventures.com';
const PAGE_URL = `${BASE_URL}/relationships/`;
// the company payloads are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// nuxt, generated: the relationships page shows every company the fund has
// backed as a card, a logo with no name, "Partnered" or "Exited" and the
// year, from the data the page was built with, which nuxt keeps beside it
// as a payload ("/_nuxt/static/<build>/relationships/payload.js", the build
// read from the page each run). the payload gives each company's name,
// whether the fund is still a partner, the year, where it is ("Amsterdam,
// the Netherlands") and its industries ("SaaS", "Fintech"); a company with
// a page of its own here has a payload of its own, which adds its site.
// the industries, the place's parts and the year are kept as tags, an
// exit with the Exited tag. a company whose payload will not load, or that has no
// page, links its card.
//
// a payload is a script — a function returning the page's data, called
// with the values the data repeats — so it is read as one: its arguments
// first, then the data with each parameter replaced by its value.

const BUILD = /\/_nuxt\/static\/(\d+)\/relationships\/state\.js/;
const JSONP = /__NUXT_JSONP__\(\s*"[^"]*"\s*,\s*\(function\(([^)]*)\)\s*\{\s*return\s*/;
// one token of the script: a string, a number, an undefined, a name, or
// any other character
const TOKEN = /"(?:[^"\\]|\\[\s\S])*"|-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|void 0|[A-Za-z_$][\w$]*|[\s\S]/gy;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Relation {
	title?: string;
	slug?: string;
	showSlugPage?: boolean;
	relationshipStatus?: boolean;
	year?: number | string;
	location?: { location?: string };
	industry?: { title?: string }[];
}

interface Literal {
	json: string;
	end: number;
}

// the literal opening at start — an object, an array, or an argument list
// read as an array — as json, and where it ends. a name is a parameter,
// written as the value passed for it; while the values are not yet known
// it stands as null, the literal only being measured
function literalAt(text: string, start: number, values?: Map<string, string>): Literal | undefined {
	let json = '';
	let depth = 0;
	TOKEN.lastIndex = start;
	for (let token = TOKEN.exec(text); token; token = TOKEN.exec(text)) {
		const [t] = token;
		if (t.startsWith('"')) {
			json += t;
		} else if (/^-?[\d.]/.test(t) && t !== '.' && t !== '-') {
			json += String(Number(t));
		} else if (t === 'void 0') {
			json += 'null';
		} else if (/^[A-Za-z_$]/.test(t)) {
			if (/^\s*:/.test(text.slice(TOKEN.lastIndex, TOKEN.lastIndex + 8))) json += JSON.stringify(t);
			else if (t === 'true' || t === 'false' || t === 'null') json += t;
			else if (!values) json += 'null';
			else if (values.has(t)) json += values.get(t);
			else return undefined;
		} else if (/\s/.test(t)) {
			continue;
		} else {
			const c = t === '(' ? '[' : t === ')' ? ']' : t;
			json += c;
			if (c === '[' || c === '{') depth++;
			else if ((c === ']' || c === '}') && --depth === 0) return { json, end: TOKEN.lastIndex };
		}
	}
	return undefined;
}

// a payload's data: the arguments read, then the data with them in place
function payloadOf(text: string): unknown {
	const head = text.match(JSONP);
	if (head?.index === undefined) return undefined;
	const params = head[1].split(',').map((p) => p.trim());
	const start = head.index + head[0].length;
	const measured = literalAt(text, start);
	const call = measured ? text.indexOf('(', measured.end) : -1;
	const args = call >= 0 ? literalAt(text, call) : undefined;
	if (!args) return undefined;
	try {
		const passed = JSON.parse(args.json) as unknown[];
		const values = new Map(params.map((p, i) => [p, JSON.stringify(passed[i] ?? null)]));
		const data = literalAt(text, start, values);
		return data ? JSON.parse(data.json) : undefined;
	} catch {
		return undefined;
	}
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// a file, or a refusal waited out once
async function get(url: string): Promise<Response> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (resp.status !== 429) return resp;
	await resp.body?.cancel();
	await wait(REFUSED_MS);
	return fetch(url, { headers: { 'User-Agent': UA } });
}

// the site a company's own payload names, or nothing when it will not load
async function siteOf(build: string, slug: string): Promise<string> {
	try {
		const resp = await get(`${BASE_URL}/_nuxt/static/${build}/relationships/${encodeURIComponent(slug)}/payload.js`);
		if (!resp.ok) {
			await resp.body?.cancel();
			return '';
		}
		const site = JSON.stringify(payloadOf(await resp.text()) ?? {}).match(/"websiteUrl":"([^"]*)"/)?.[1] ?? '';
		return /^https?:\/\//i.test(site) ? site : '';
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const build = (await resp.text()).match(BUILD)?.[1];
	if (!build) {
		throw new Error("prime: the page names no nuxt build — the site's build moved");
	}
	const payload = await get(`${BASE_URL}/_nuxt/static/${build}/relationships/payload.js`);
	if (!payload.ok) {
		throw new Error(`prime: the relationships payload would not load (${payload.status})`);
	}
	const data = payloadOf(await payload.text()) as { data?: { allRelations?: Relation[] }[] } | undefined;
	const relations = data?.data?.find((d) => Array.isArray(d.allRelations))?.allRelations ?? [];
	if (relations.length === 0) {
		throw new Error('prime: the relationships payload names no companies — its shape moved');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	let asked = 0;
	for (const relation of relations) {
		const name = clean(relation.title ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const slug = clean(relation.slug ?? '');
		let site = '';
		if (slug && relation.showSlugPage) {
			if (asked++ > 0) await wait(PACE_MS);
			site = await siteOf(build, slug);
			if (site) withSite++;
		}
		const year = String(relation.year ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
		companies.push({
			name,
			category: [
				...(relation.industry ?? []).map((i) => tag(i.title ?? '')),
				...(relation.location?.location ?? '').split(',').map(tag),
				year ? `Invested ${year}` : '',
				relation.relationshipStatus === false ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || (slug && relation.showSlugPage ? `${BASE_URL}/relationships/${slug}` : PAGE_URL)
		});
	}
	// without the companies' payloads every company would link the fund's site
	if (asked > 0 && withSite === 0) {
		throw new Error("prime: no company's payload named its site — the payloads' shape moved");
	}

	return companies;
}
