import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.satgana.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer, rendered on the server: each company is a card linking its own site,
// with its logo, the city it works from — a flag after it — and a sentence
// about it. the page renders the portfolio once per screen size, so the cards
// are deduplicated by address.
//
// nothing on the page, or anywhere on the site, writes a company's name: it is
// only ever in the logo. a company's name is its identity to the fetch, so it
// has to come from something that holds still — the address the card links to.
// the names below are what the companies call themselves, looked up once;
// a company missing from them is named after its address the way the other
// domain-named scrapers here do it, until it is added.
const NAMES: Record<string, string> = {
	'amini.ai': 'Amini',
	'arda.bio': 'Arda Biomaterials',
	'ark-climate.de': 'Ark Climate',
	'brineworks.tech': 'Brineworks',
	'buildkubik.com': 'Kubik',
	'chilli.club': 'Chilli',
	'clever.gy': 'Clevergy',
	'estuaire.dev': 'Estuaire',
	'exapto.tech': 'Exapto',
	'floxintelligence.com': 'Flox',
	'fullsoon.co': 'Fullsoon',
	'infyos.com': 'Infyos',
	'loewi.fr': 'Loewi',
	'mazimobility.com': 'Mazi Mobility',
	'meanderx.ai': 'MeanderX',
	'mophones.co': 'MoPhones',
	'nitrovolt.com': 'NitroVolt',
	'novek.io': 'Novek',
	'onima.bio': 'Onima',
	'orbio.earth': 'Orbio Earth',
	'plentify.io': 'Plentify',
	'postx.ai': 'PostX',
	'revivokenya.com': 'Revivo',
	'sirona.tech': 'Sirona Technologies',
	'sizableenergy.com': 'Sizable Energy',
	'voltiris.com': 'Voltiris',
	'wattnow.io': 'Wattnow',
	'wikifarmer.com': 'Wikifarmer'
};

const CARD = /<a [^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
const CITY = /<h6[^>]*>([\s\S]*?)<\/h6>/;
// a flag is a pair of regional indicator letters
const FLAG = /[\u{1F1E6}-\u{1F1FF}]{2}/u;

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'build', 'go', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;

const countries = new Intl.DisplayNames(['en'], { type: 'region' });

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
};

// "ark-climate.de" -> "Ark Climate", "getfoo.com" -> "Foo"
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

// "Nairobi 🇰🇪" -> "Nairobi, Kenya"; a card may name a country outright
function place(text: string): string {
	const flag = text.match(FLAG)?.[0];
	const city = text.replace(FLAG, '').trim();
	const code = flag
		? [...flag].map((c) => String.fromCharCode(c.codePointAt(0)! - 0x1f1e6 + 65)).join('')
		: '';
	let country = '';
	try {
		country = code ? (countries.of(code) ?? '') : '';
	} catch {
		// an indicator pair that names no region is only a picture
	}
	return [city, country && country !== city ? country : ''].filter(Boolean).join(', ');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, url, body] of html.matchAll(CARD)) {
		// a card is a link off the site that carries a city
		const city = body.match(CITY)?.[1];
		const host = hostOf(url);
		if (city === undefined || !host || host.endsWith('satgana.com') || seen.has(host)) continue;
		seen.add(host);
		const name = NAMES[host] ?? domainName(host);
		if (!name) continue;
		companies.push({ name, category: place(clean(city)), url });
	}

	if (companies.length === 0) {
		throw new Error('satgana: no companies on the portfolio page');
	}

	return companies;
}
