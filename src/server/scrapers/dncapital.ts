import { request } from 'node:https';
import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.dncapital.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the companies' pages are asked for one at a time, a pause between them
const PACE_MS = 150;
// the pauses before a refused page is asked for again under the app's own name
const RETRY_MS = [2_000, 8_000];
const ANSWER_MS = 30_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const OWN_UA = 'portfolio-alert/1.0 (+https://portfolio-alert.vercel.app)';

// rebuilt on astro (with sanity behind it) on 2026-11-05, the old full list
// redirecting to a page that is not there, and cloudflare refusing the
// nightly run's first ask with a 403. the portfolio page lists every company
// in full: an item classed for the page's filters by its status ("current",
// "exited") and its sectors, which the filter's buttons name, heading with
// the name, and giving the location, the year invested and the entry stage,
// linking a page per company. that page links the company's site and tags an
// exit with what it was ("Acquired"). a page that will not load leaves its
// company linking it. the sectors, locations, year, stage and outcome are
// kept as tags, an exit with the Exited tag.

const ITEM = /(?=<li\b[^>]*\bdata-status=")/;
const STATUS = /^<li\b[^>]*\bdata-status="([^"]*)"/;
const SECTORS = /^<li\b[^>]*\bdata-sector="([^"]*)"/;
const NAME = /<h3\b[^>]*>([\s\S]*?)<\/h3>/;
const COLUMN = (column: string) => new RegExp(`data-column="${column}"[^>]*>\\s*<dt>[^<]*</dt>\\s*<dd>([\\s\\S]*?)</dd>`);
const LINK = /\bhref="\/portfolio\/([^"#?/]+)"/;
const SECTOR_LABEL = /data-filter="sector" data-value="([^"]*)"[^>]*>([^<]*)</g;
const SITE = /<a\b(?=[^>]*aria-label="Visit the company website)[^>]*\bhref="(https?:\/\/[^"]+)"/;
const OUTCOME = /<span\b[^>]*class="[^"]*\btag\b[^"]*"[^>]*>\s*(Acquired|IPO|Merged|Listed)\s*<\/span>/i;
const YEAR = /^(?:19|20)\d{2}$/;
const STEALTH = /^stealth\b/i;

// the companies the new site names otherwise, kept under the names stored for
// them off the old one (the same sites; "Kana" was stored as Lagan, its buyer's
// site linked)
const STORED_AS: Record<string, string> = {
	accept: 'accept.inc',
	artur: 'Artur Inside',
	digitalmotors: 'Digital Motors',
	eve: 'Eve Sleep',
	hometogo: 'HomeToGo GmbH',
	jobandtalent: 'job&talent',
	kana: 'Lagan Technologies',
	ombud: 'Ombud Inc',
	optilyz: 'Opitlyz',
	parallel: 'Parallel Wireless',
	patronus: 'Patronus Group',
	sanas: 'Sanas.ai',
	socialstandards: 'Social Standards',
	spire: 'Spire Science',
	triple: 'TripleMint'
};

interface Answer {
	status: number;
	body: string;
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the page through node's https module, under the app's own name
function getHonestly(url: string): Promise<Answer> {
	return new Promise((resolve, reject) => {
		const req = request(url, { headers: { 'User-Agent': OWN_UA } }, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () =>
				resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') })
			);
			res.on('error', reject);
		});
		req.setTimeout(ANSWER_MS, () => req.destroy(new Error(`dncapital: ${url} did not answer in 30 s`)));
		req.on('error', reject);
		req.end();
	});
}

// once the app's own name has been let through, the rest is asked under it
let honest = false;

async function get(url: string): Promise<Answer> {
	if (honest) return getHonestly(url);
	const resp = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(ANSWER_MS) });
	if (resp.status !== 403) return { status: resp.status, body: await resp.text() };
	await resp.body?.cancel();
	let answer: Answer = { status: resp.status, body: '' };
	for (const ms of RETRY_MS) {
		await wait(ms);
		answer = await getHonestly(url);
		if (answer.status !== 403) {
			honest = answer.status === 200;
			break;
		}
	}
	return answer;
}

// a company's site and what its exit was, or nothing when its page will not load
async function detailsOf(url: string): Promise<{ site: string; outcome: string }> {
	try {
		const { status, body } = await get(url);
		if (status !== 200) return { site: '', outcome: '' };
		return { site: unescape(body.match(SITE)?.[1] ?? '').trim(), outcome: clean(body.match(OUTCOME)?.[1] ?? '') };
	} catch {
		return { site: '', outcome: '' };
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	honest = false;
	const { status, body: html } = await get(PAGE_URL);
	if (status !== 200) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${status}`);
	}
	const sectors = new Map([...html.matchAll(SECTOR_LABEL)].map(([, value, label]) => [value, tag(label)]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const item of html.split(ITEM).slice(1)) {
		const shown = clean(item.match(NAME)?.[1] ?? '');
		const name = STORED_AS[shown.toLowerCase()] ?? shown;
		const slug = item.match(LINK)?.[1];
		if (!name || !slug || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const column = (key: string) => clean(item.match(COLUMN(key))?.[1] ?? '');
		const year = column('year');
		const exited = /^exited$/i.test(item.match(STATUS)?.[1] ?? '');
		const page = `${BASE_URL}/portfolio/${slug}`;
		if (companies.length > 0) await wait(PACE_MS);
		const { site, outcome } = await detailsOf(page);
		if (site) withSite++;
		companies.push({
			name,
			category: [
				...(item.match(SECTORS)?.[1] ?? '')
					.split(/\s+/)
					.map((value) => sectors.get(value) ?? ''),
				...column('location')
					.split(/\s*,\s*/)
					.map((place) => tag(place)),
				YEAR.test(year) ? `Invested ${year}` : '',
				tag(column('stage')),
				exited ? outcome : '',
				exited ? 'Exited' : ''
			]
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: site || page
		});
	}

	if (companies.length === 0) {
		throw new Error('dncapital: no companies on the portfolio page — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("dncapital: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
