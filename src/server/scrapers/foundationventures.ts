import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.foundationventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the portfolio is one gallery of logos, each linking the
// company's site, with no captions and image files named anything at all
// ("Adobe Express - file.png"). a company is known by the address it links
// to, under the name it gives itself, looked up once; one missing from the
// list is named after its address until it is added.
const NAMES: Record<string, string> = {
	'abwaab.me': 'Abwaab',
	'accordpartners.ai': 'Accord Partners',
	'aydi.com': 'Aydi',
	'flashq.ai': 'FlashQ',
	'flextock.com': 'Flextock',
	'kenzz.com': 'Kenzz',
	'minly.com': 'Minly',
	'nowpay.com': 'NowPay',
	'rabbitmart.com': 'Rabbit',
	'sakneen.com': 'Sakneen',
	'swypex.com': 'Swypex',
	'trella.app': 'Trella'
};

const ITEM = /(?=<figure class="gallery-grid-item\b)/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;

const unescape = (s: string) => s.replace(/&amp;/g, '&');

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

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const url = unescape(item.match(LINK)?.[1] ?? '');
		const host = hostOf(url);
		if (!host) continue;
		const name = NAMES[host] ?? domainName(host);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('foundationventures: no logos in the portfolio gallery');
	}

	return companies;
}
