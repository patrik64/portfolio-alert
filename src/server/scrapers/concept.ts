import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://concept.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole list in the html: a tile per company, its logo opening a popup
// with a line about it, the founders, the year and the site. the name is written
// nowhere, the logos having no alt text, but every tile carries the collection's slug
// ("digital-iron"), which reads as the name. the ones whose capitals it loses are
// looked up here. the page's filters give "First time founder" or "Repeat founder"
// and "Graduated" or "Non-Graduated", the first kept as they are and the second only
// where it is true; a tag on the tile, hidden on the rest, says "Exit".
const CASED: Record<string, string> = {
	argox: 'ArgoX',
	elevenlabs: 'ElevenLabs',
	mindmax: 'MindMax',
	peopleforce: 'PeopleForce',
	'v-sim': 'V-Sim'
};

const CARD = /(?=<div data-modal-open=")/;
const SLUG = /\bdata-portfolio-id="([^"]+)"/;
const SITE = /WebsIte<\/div>\s*<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/i;
const EXIT_TAG = 'class="exit-tag"';
const FOUNDER = /fs-cmsfilter-field="founder"[^>]*>([^<]+)/;
const GRADUATED = /fs-cmsfilter-field="graduated"[^>]*>\s*Graduated\s*</;
const FOUNDED = /Founded<\/div>\s*<div[^>]*>\s*(\d{4})/;

// "digital-iron" -> "Digital Iron", "verax-ai" -> "Verax AI"
const nameFrom = (slug: string) =>
	CASED[slug] ??
	slug
		.split('-')
		.filter(Boolean)
		.map((word) => (word === 'ai' ? 'AI' : word[0].toUpperCase() + word.slice(1)))
		.join(' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const cards = (await resp.text()).split(CARD).slice(1);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		const slug = card.match(SLUG)?.[1] ?? '';
		const name = nameFrom(slug);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [
				card.match(FOUNDER)?.[1].trim() ?? '',
				GRADUATED.test(card) ? 'Graduated' : '',
				card.match(FOUNDED)?.[1] ?? '',
				card.includes(EXIT_TAG) ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: card.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('concept: no companies on the portfolio page');
	}

	return companies;
}
