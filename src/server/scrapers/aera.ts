import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.aera.vc/our-portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with elementor: the portfolio page is a run of cards, each a
// line about what the company does ("Deep space mining"), its logo, a
// sentence about it and a "Learn More" button linking its site. the logos
// have no alt text and the company is named only in passing in the
// sentence ("Allium designs…"), so the names are kept here, keyed on the
// address a card links, as the logos read; an address not listed here
// still imports, named after itself the way the other domain-named
// scrapers do it, until it is added. one card links a host of the
// company's rather than its own site, and is kept by it. the lines are
// slogans as often as fields, and are not kept. nothing marks an exit.
const NAMES: Record<string, string> = {
	'alliumeng.com': 'Allium',
	'aquila.earth': 'Aquila',
	'arraylabs.io': 'Array Labs',
	'astroforge.com': 'AstroForge',
	'autopallet.bot': 'AutoPallet Robotics',
	'calectra.com': 'Calectra',
	'carbicrete.com': 'CarbiCrete',
	'carbonchain.com': 'CarbonChain',
	'cosmicaerospace.com': 'Cosmic Aerospace',
	'dawnaerospace.com': 'Dawn Aerospace',
	'fablefood.co': 'Fable',
	'gilgameshpharmaceutical.com': 'Gilgamesh',
	'godela.ai': 'Godela',
	'green-got.com': 'Greengot',
	'greentownlabs.com': 'Provocative',
	'gridsight.ai': 'Gridsight',
	'intramotev.com': 'Intramotev',
	'maritimefusion.com': 'Maritime Fusion',
	'palomahealth.com': 'Paloma',
	'reditus.space': 'Reditus',
	'rewbi.com': 'Rewbi',
	'seagen.io': 'SeaGen',
	'solugen.com': 'Solugen',
	'twelve.co': 'Twelve',
	'umamibioworks.com': 'Umami Bioworks'
};

// a card opens on its line and ends with its button
const CARD = /(?=<h4\b[^>]*\bclass="elementor-heading-title)/;
const BUTTON = /<a\b[^>]*\bclass="elementor-button\b[^"]*"[^>]*\bhref="([^"]*)"/;
const STEALTH = /^stealth\b/i;

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
};

// "getfoo.com" -> "Foo", "ark-climate.de" -> "Ark Climate"
function domainName(host: string): string {
	const parts = host.split('.').filter((part) => !SUBDOMAIN.test(part));
	let label =
		parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])
			? parts[parts.length - 3]
			: (parts[parts.length - 2] ?? parts[0] ?? '');
	const bare = DECORATION.find((d) => label.startsWith(d) && label.length - d.length >= MIN_BRAND);
	if (bare) label = label.slice(bare.length);
	return label
		.split('-')
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const body = html.slice(html.indexOf('<body'));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of body.split(CARD).slice(1)) {
		const end = chunk.indexOf('</a>');
		if (end < 0) continue;
		const card = chunk.slice(0, end);
		const site = (card.match(BUTTON)?.[1] ?? '').replace(/&amp;/g, '&').trim();
		const host = /^https?:\/\//i.test(site) ? hostOf(site) : '';
		if (!host || host.endsWith('aera.vc')) continue;
		const name = NAMES[host] ?? domainName(host);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: site });
	}
	if (companies.length === 0) {
		throw new Error('aera: no companies on the portfolio page');
	}

	return companies;
}
