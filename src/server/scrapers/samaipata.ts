import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.samaipata.vc';
const PAGE_URL = `${BASE_URL}/our-portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: "meet our companies" is a grid of cards, the whole portfolio in
// the page, a card a company linking its profile here, with its name, its
// country ("Spain", "United Kingdom") and its stage ("Seed", "Early",
// "Growth", or "Exited"). a profile adds the city it is based in, the year
// the fund invested and its site. the country, the city, the stage and the
// year are kept as tags, an exit with the Exited tag. a profile that will
// not load, or is not reached by the deadline, leaves its company linking
// it.

const CARD = /(?=<div role="listitem" class="portfolio-company-card-wide w-dyn-item">)/;
const PROFILE = /<a href="(\/portfolio-companies\/[^"]+)"/;
const FIELD = (name: string) => new RegExp(`fs-cms(?:filter|sort)-field="${name}"[^>]*>([\\s\\S]*?)<\\/div>`);
// a profile's facts: a heading and its value
const FACT = /<h6>([^<]+)<\/h6><\/div><div\b[^>]*>(?:<img\b[^>]*>)?<p\b[^>]*>([\s\S]*?)<\/p>/g;
const LINK = /<a href="([^"]*)" target="_blank" class="portfolio-profile-social-link\b/g;
const SOCIAL = /^https?:\/\/(?:[\w-]+\.)*(?:linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|crunchbase\.com|google\.com)(?:[/?#]|$)/i;
const YEAR = /\b(?:19|20)\d{2}\b/;
const EXITED = /^exited$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// a page, or a refusal waited out once
async function get(url: string): Promise<Response> {
	const headers = { 'User-Agent': UA };
	const resp = await fetch(url, { headers });
	if (resp.status !== 429) return resp;
	await resp.body?.cancel();
	await wait(REFUSED_MS);
	return fetch(url, { headers });
}

interface Profile {
	site: string;
	city: string;
	year?: string;
}

// what a company's profile says, or nothing when it will not load
async function profileOf(href: string): Promise<Profile | null> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return null;
		}
		const html = await resp.text();
		const facts = new Map([...html.matchAll(FACT)].map(([, label, value]) => [clean(label).toLowerCase(), clean(value)]));
		const site =
			[...html.matchAll(LINK)].map(([, link]) => unescape(link).trim()).find((link) => /^https?:\/\//i.test(link) && !SOCIAL.test(link)) ?? '';
		return {
			site,
			// "London, UK": the city, the country being the card's
			city: (facts.get('headquarters') ?? '').split(',')[0].trim(),
			year: facts.get('year invested')?.match(YEAR)?.[0]
		};
	} catch {
		return null;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const card of html.split(CARD).slice(1)) {
		const field = (key: string) => clean(card.match(FIELD(key))?.[1] ?? '');
		const name = field('name');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const path = card.match(PROFILE)?.[1];
		const href = path ? `${BASE_URL}${unescape(path)}` : '';
		const reached = !!href && Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const profile = reached ? await profileOf(href) : null;
		if (profile?.site) withSite++;
		const stage = field('Stage');
		const exited = EXITED.test(stage);
		companies.push({
			name,
			category: [
				tag(field('Geography')),
				tag(profile?.city ?? ''),
				exited ? '' : tag(stage),
				profile?.year ? `Invested ${profile.year}` : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: profile?.site || href || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('samaipata: no companies on the portfolio page — the markup moved');
	}
	// without the profiles every company would link its profile here
	if (withSite === 0) {
		throw new Error("samaipata: no profile gave its site — the profiles' markup moved");
	}

	return companies;
}
