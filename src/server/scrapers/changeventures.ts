import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.changeventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a grid of logos, the whole of it in the page,
// a logo a company, opening a panel with its stage ("Pre-seed", "Series
// A", "Growth") or what became of it ("Exited", "Closed"), its industries
// ("Robotics / ClimateTech / B2B", or "AI agents, B2B sales"), a
// description and links to its site, crunchbase and linkedin — but never
// the company's name, the logos having no alt text.
//
// so the name is read from the description, which opens with it as a rule
// ("Aerones is the world's leading…", "Teamdash's built-in recruitment…"):
// the earliest words there, the longest spelling at a place, that spell
// the company's crunchbase or linkedin name, or its site's — not the
// site's for an exited company, whose link may be its buyer's. failing
// that, the site's name or the crunchbase name is written out in words.
//
// the industries and the stage are kept as tags; an exit with the Exited
// tag, a company gone with the Closed tag.

const ITEM = /(?=<div role="listitem" class="portfolio-collection-item w-dyn-item">)/;
const DESCRIPTION = /class="portfolio-more-p">([\s\S]*?)<\/div>/;
const STAGE = /class="portfolio-stage-text-[a-z]+">([^<]*)</;
const INDUSTRIES = /class="portfolio-more-details">[\s\S]*?class="portfolio-industry-text">([\s\S]*?)<\/div>/;
const LINK = /<a href="([^"]*)"[^>]*class="portfolio-more-linkblock\b/g;
const PROFILE = /(?:crunchbase\.com\/organization|linkedin\.com\/company)\/([^/?#]+)/i;
const SOCIAL = /^https?:\/\/(?:[\w-]+\.)*(?:crunchbase\.com|linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com)(?:[/?#]|$)/i;
// a profile's suffix added to tell it from another's: "printify-2", "certific-4cda"
const SUFFIX = /-(?:\d+|[0-9a-f]{4})$/;
// a word as a name may be written: "Trace.Space", "99math"
const WORD = /[\p{L}\p{N}][\p{L}\p{N}.&'’+-]*/gu;
const EXITED = /^exited$/i;
const CLOSED = /^closed$/i;
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

const spelled = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// "robot-muralist" -> "Robot Muralist"
const inWords = (s: string) =>
	s
		.split(/[-_]+/)
		.filter(Boolean)
		.map((w) => w[0].toUpperCase() + w.slice(1))
		.join(' ');

// the site's own name: "https://www.aerones.com/" -> "aerones"
const hostName = (site: string) =>
	site
		.replace(/^https?:\/\/(?:www\.)?/i, '')
		.split(/[/?#]/)[0]
		.split('.')[0];

// the company's name as its description writes it — see above
function nameOf(description: string, profiles: string[], site: string, exited: boolean): string {
	const host = site ? hostName(site) : '';
	const keys = [...profiles.map((p) => spelled(p.replace(SUFFIX, ''))), exited ? '' : spelled(host)].filter(
		(key, i, all) => key && all.indexOf(key) === i
	);
	const words = description.match(WORD) ?? [];
	for (let i = 0; i < words.length; i++) {
		// the longest spelling at a place: "Inspectle Food" over "Inspectle"
		for (let n = Math.min(4, words.length - i); n >= 1; n--) {
			const phrase = words
				.slice(i, i + n)
				.join(' ')
				.replace(/[.,;:]+$/, '')
				.replace(/['’]s$/, '');
			if (keys.includes(spelled(phrase))) return phrase;
		}
	}
	return inWords(exited || !host ? (profiles[0] ?? '').replace(SUFFIX, '') : host);
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const links = [...item.matchAll(LINK)].map(([, href]) => unescape(href).trim());
		const site = links.find((href) => /^https?:\/\//i.test(href) && !SOCIAL.test(href)) ?? '';
		const profiles = links.map((href) => href.match(PROFILE)?.[1] ?? '').filter(Boolean);
		const stage = clean(item.match(STAGE)?.[1] ?? '');
		const exited = EXITED.test(stage);
		const name = nameOf(clean(item.match(DESCRIPTION)?.[1] ?? ''), profiles, site, exited);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [
				...clean(item.match(INDUSTRIES)?.[1] ?? '')
					.split(/[/,]/)
					.map(tag),
				exited || CLOSED.test(stage) ? '' : stage,
				exited ? 'Exited' : '',
				CLOSED.test(stage) ? 'Closed' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('changeventures: no companies on the portfolio page — the markup moved');
	}

	return companies;
}
