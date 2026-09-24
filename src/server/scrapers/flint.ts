import type { ScrapedCompany } from './types';

const API_URL = 'https://flintcap.com/api/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a vue app over a laravel api: the page draws the portfolio from
// /api/portfolio, which gives each company its categories, a line about it,
// its logo, a link and — for one the fund is out of — a note on how
// ("Acquired by Microsoft", "NASDAQ: WKME"), plus whether it is still in the
// current portfolio. what it never gives is a name: that is only in the
// logo, and many of the sold companies link to their buyer or to news of the
// sale. so the companies are named from a list looked up once, keyed by the
// api's own id; one missing from it is named after its link's address until
// it is added. a company out of the current portfolio with no note is kept
// as "Past portfolio" rather than counted an exit.
const NAMES: Record<number, string> = {
	56: 'LendingClub',
	57: 'BlazeMeter',
	59: 'MentAd',
	60: 'MatchCo',
	61: 'Mobee',
	62: 'Sumsub',
	64: 'Appsee',
	65: 'AvaFin',
	66: 'Loom Systems',
	67: 'CyberX',
	68: 'WalkMe',
	69: 'Qbox',
	70: 'Voca.ai',
	93: 'JobToday',
	94: 'Yva.ai',
	95: 'YouAppi',
	96: 'Audioburst',
	97: 'PLYmedia',
	98: 'Any.do',
	99: 'Socure',
	100: 'Flo',
	101: 'Sailplay',
	102: 'Cyolo',
	103: 'Antidote Health',
	104: 'Sensi.ai',
	105: 'Mitiga',
	106: 'Intento',
	107: 'XRHealth',
	111: 'ManyChat',
	112: 'Wiser',
	114: 'Fjor Nutrition',
	116: 'Oneday',
	117: 'Cynomi',
	119: 'Jiffy Software',
	122: 'Circles',
	123: 'Boards',
	124: 'Quantori',
	125: 'ODAIA',
	126: 'Nokod Security',
	127: 'DevOcean',
	130: 'Bluebricks',
	131: 'Vayu'
};

interface Company {
	id: number;
	categories?: { title?: string }[];
	brand?: string | null;
	link?: string | null;
	current_portfolio?: boolean;
}

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;
const EXITS = /^exits?$/i;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&rsquo;|&#8217;|&#0?39;/g, "'")
		.replace(/&[a-z]+;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

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
	const resp = await fetch(API_URL, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${API_URL}: ${resp.status}`);
	}
	const { data } = (await resp.json()) as { data?: Company[] };

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of data ?? []) {
		const url = (company.link ?? '').trim();
		const name = NAMES[company.id] ?? domainName(hostOf(url));
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const labels = (company.categories ?? []).map((c) => tag(c.title ?? ''));
		const note = tag(company.brand ?? '');
		const exited = Boolean(note) || labels.some((l) => EXITS.test(l));
		companies.push({
			name,
			category: [
				...labels.filter((l) => !EXITS.test(l)),
				note && !EXITS.test(note) && !/^exit$/i.test(note) ? note : '',
				exited ? 'Exited' : company.current_portfolio === false ? 'Past portfolio' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('flint: the portfolio api lists no companies');
	}

	return companies;
}
