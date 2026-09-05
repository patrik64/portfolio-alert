import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.sierraventures.com';
const ALL_PATH = '/portfolio-all-items';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// hubspot. /portfolio shows only the sixteen companies the fund is featuring;
// its sector dropdown points at the pages that hold the rest, and
// /portfolio-all-items has all hundred and sixty-four.
//
// a tile carries the company's name as its logo's alt text, "Astronomer logo",
// and a class saying whether the company is still held. the modal behind it
// repeats the status and adds the address, under a button marked Website —
// there is a Careers button beside it, which is not the same thing.
//
// the sectors are not on the tiles, so the six sector pages are read as well
// and a company takes the sectors of the pages it appears on.

const SECTORS: Record<string, string> = {
	'/portfolio-ai-data': 'AI / Data',
	'/portfolio-saas': 'SaaS',
	'/portfolio-digital-health': 'Digital Health',
	'/portfolio-deeptech-robotics': 'DeepTech / Robotics',
	'/portfolio-security-infrastructure': 'Security / Infrastructure',
	'/portfolio-consumer-commerce': 'Consumer / Commerce'
};

const CARD =
	/class="partners-1__partner (partner-type-\d+)\s*"[\s\S]{0,600}?data-micromodal-trigger="([^"]*)"[\s\S]{0,400}?alt="([^"]*)"/g;
const MODAL =
	/<div class="modal micromodal-slide" id="([^"]*)"([\s\S]*?)(?=<div class="modal micromodal-slide" id=|<\/section)/g;
const WEBSITE = /<a class="partners-1__partner-button" href="([^"]*)"[^>]*>\s*Website\s*<\/a>/;
const LOGO_SUFFIX = /\s*logo$/i;
// the class the fund puts on a company it has exited
const EXITED = 'partner-type-2';

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

const nameOf = (alt: string) => clean(clean(alt).replace(LOGO_SUFFIX, ''));

async function fetchText(path: string): Promise<string> {
	const url = `${BASE_URL}${path}`;
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const paths = Object.keys(SECTORS);
	const [all, ...sectorPages] = await Promise.all([
		fetchText(ALL_PATH),
		...paths.map((p) => fetchText(p).catch(() => ''))
	]);

	// which sector pages a company turns up on
	const sectorsOf = new Map<string, string[]>();
	sectorPages.forEach((html, i) => {
		for (const m of html.matchAll(CARD)) {
			const name = nameOf(m[3]);
			if (!name) continue;
			const held = sectorsOf.get(name) ?? [];
			held.push(SECTORS[paths[i]]);
			sectorsOf.set(name, held);
		}
	});

	const modals = new Map([...all.matchAll(MODAL)].map((m) => [m[1], m[2]]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of all.matchAll(CARD)) {
		const name = nameOf(m[3]);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: [...(sectorsOf.get(name) ?? []), m[1] === EXITED ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url: modals.get(m[2])?.match(WEBSITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('sierra: no companies on the portfolio page');
	}

	return companies;
}
