import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.greenmeadow.co';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the portfolio's filters are pages of their own, kept by hand apart from it
const FILTERS: [string, string][] = [
	[`${BASE_URL}/b2b`, 'B2B'],
	[`${BASE_URL}/consumer`, 'Consumer']
];
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace galleries of logos, each linking the company's site, with image
// files named anything at all ("Untitled design (27).png", "9.png") and no
// captions. the "All", "B2B" and "Consumer" filters are three pages, kept
// apart and out of step — each has companies the others lack — so all three
// are read, a company taking the label of each filter page it is on. a
// company is known by the address it links to, under the name it gives
// itself, looked up once; one missing from the list is named after its
// address until it is added. one logo links a search for the company instead
// ("beren therapeutics"), which names it; a logo linking nowhere names no one
// and is passed over.
const NAMES: Record<string, string> = {
	'angiex.com': 'Angiex',
	'artsy.net': 'Artsy',
	'blockrenovation.com': 'Block Renovation',
	'boox.eco': 'Boox',
	'brat.tv': 'Brat TV',
	'calidadbeer.com': 'Calidad Beer',
	'carbonhealth.com': 'Carbon Health',
	'cargomatic.com': 'Cargomatic',
	'coverahealth.com': 'Covera Health',
	'creator.rest': 'Creator',
	'cubcoats.com': 'Cubcoats',
	'elemindtech.com': 'Elemind',
	'fernish.com': 'Fernish',
	'flossy.com': 'Flossy',
	'freedamedia.com': 'Freeda Media',
	'get.chownow.com': 'ChowNow',
	'getcarro.com': 'Carro',
	'hashflow.com': 'Hashflow',
	'hellopearl.com': 'Pearl',
	'hellosalted.com': 'Salted',
	'kalendar.ai': 'Kalendar AI',
	'lemonperfect.com': 'Lemon Perfect',
	'magicspoon.com': 'Magic Spoon',
	'marketerhire.com': 'MarketerHire',
	'medialab.la': 'Medialab',
	'meundies.com': 'MeUndies',
	'mirareality.com': 'Mira',
	'modernanimal.com': 'Modern Animal',
	'nostra.ai': 'Nostra',
	'novel.shop': 'Novel',
	'okplay.co': 'OK Play',
	'particle.io': 'Particle',
	'prefect.io': 'Prefect',
	'rematter.com': 'ReMatter',
	'ring.com': 'Ring',
	'runalloy.com': 'Alloy Automation',
	'seed.com': 'Seed Health',
	'shapertools.com': 'Shaper Tools',
	'shopredone.com': 'RE/DONE',
	'snibbs.co': 'Snibbs',
	'soona.co': 'soona',
	'spacex.com': 'SpaceX',
	'stripe.com': 'Stripe',
	'thereformation.com': 'Reformation',
	'thezoereport.com': 'The Zoe Report',
	'thinkjinx.com': 'Jinx',
	'treet.co': 'Treet',
	'turo.com': 'Turo',
	'usage.ai': 'Usage.ai',
	'usbitcoin.com': 'US Bitcoin Corp',
	'welcome.tech': 'Welcome Tech'
};

const ITEM = /(?=<figure class="gallery-grid-item\b)/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const SEARCH = /^(www\.)?(google|bing)\.[a-z.]+$/;

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
};

const titled = (s: string) =>
	s
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

// "getfoo.com" -> "Foo", "ark-climate.de" -> "Ark Climate"
function domainName(host: string): string {
	const parts = host.split('.').filter((part) => !SUBDOMAIN.test(part));
	let label =
		parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])
			? parts[parts.length - 3]
			: (parts[parts.length - 2] ?? parts[0] ?? '');
	const bare = DECORATION.find((d) => label.startsWith(d) && label.length - d.length >= MIN_BRAND);
	if (bare) label = label.slice(bare.length);
	return titled(label.replace(/-/g, ' '));
}

interface Logo {
	name: string;
	url: string;
}

function logos(html: string): Logo[] {
	return html
		.split(ITEM)
		.slice(1)
		.flatMap((item) => {
			const link = unescape(item.match(LINK)?.[1] ?? '');
			const host = hostOf(link);
			if (!host) return [];
			if (SEARCH.test(host)) {
				const query = new URL(link).searchParams.get('q')?.trim() ?? '';
				return query ? [{ name: titled(query), url: '' }] : [];
			}
			return [{ name: NAMES[host] ?? domainName(host), url: link }];
		});
}

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [all, ...filtered] = await Promise.all([
		fetchText(PAGE_URL),
		// a filter page that will not load costs its labels for the night, not the fetch
		...FILTERS.map(([url]) => fetchText(url).catch(() => ''))
	]);

	const companies = new Map<string, ScrapedCompany & { labels: string[] }>();
	const add = (logo: Logo, label: string) => {
		if (!logo.name) return;
		const key = logo.name.toLowerCase();
		const known = companies.get(key);
		if (!known) {
			companies.set(key, { ...logo, category: '', labels: label ? [label] : [] });
			return;
		}
		if (!known.url) known.url = logo.url;
		if (label && !known.labels.includes(label)) known.labels.push(label);
	};
	for (const logo of logos(all)) add(logo, '');
	filtered.forEach((html, i) => {
		for (const logo of logos(html)) add(logo, FILTERS[i][1]);
	});

	if (companies.size === 0) {
		throw new Error('greenmeadow: no logos on the portfolio page');
	}

	return [...companies.values()].map(({ labels, ...company }) => ({
		...company,
		category: labels.join(', ')
	}));
}
