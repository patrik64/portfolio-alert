import type { ScrapedCompany } from './types';

const BASE_URL = 'https://fintech.io';
const API_URL = `${BASE_URL}/api/portfolio-companies`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// craft cms, the portfolio page an empty mount that a script fills from the
// site's own json endpoint, which is read here: every company with the
// stage the fund came in at, the industries it is filed under, its site and
// whether the fund has exited. a company's "website" can point at the fund's
// own news of it instead, labelled so ("News Articles"), and that is no
// site; one without a site links nowhere.

interface Term {
	title?: string;
}

interface Record {
	title?: string;
	stage?: Term[];
	industry?: Term[];
	website?: string | null;
	websiteLabel?: string | null;
	exited?: boolean;
}

const STEALTH = /^stealth\b/i;

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

const titles = (terms: Term[] | undefined) => (terms ?? []).map((t) => tag(t.title ?? '')).filter(Boolean);

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(API_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${API_URL}: ${resp.status}`);
	}
	const { data } = (await resp.json()) as { data?: Record[] };

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of data ?? []) {
		const name = clean(record.title ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const website = clean(record.website ?? '');
		const ownSite = /^https?:\/\//.test(website) && !/^news\b/i.test(clean(record.websiteLabel ?? ''));
		companies.push({
			name,
			category: [...titles(record.industry), ...titles(record.stage), record.exited ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: ownSite ? website : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('fintechcollective: the portfolio endpoint lists no companies');
	}

	return companies;
}
