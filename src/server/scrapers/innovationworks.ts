import type { ScrapedCompany } from './types';

const API_URL = 'https://www.innovationworks.org/wp-json/facetwp/v1/refresh';
const PER_PAGE = 1000;
// the host drops the connection of a client claiming to be chrome without being
// one, and answers one that gives its own name
const UA = 'portfolio-alert/1.0 (+https://portfolio-alert.vercel.app)';

// wordpress on siteground, the portfolio drawn by facetwp: the page shows ten of
// its near three hundred companies and asks the plugin's endpoint for the rest,
// page by page. the endpoint takes a page size, so the whole list is asked for
// at once, one request in place of twenty-nine on a host whose firewall meets a
// burst with its captcha. a company comes with its name, its site where the fund
// has one and the terms the filter reads: its sectors, the fund's programme for
// it ("AlphaLab", "Seed Fund"), its stage, and "Exit", kept as the Exited tag.
//
// the names carry their legal form ("Xactix, Inc."), and a few a note ("Dalinea
// (formerly Kloopify)", "Tunessence (acquired by Hal Leonard)"), neither part of
// the name; a buyer is kept as a tag.

const REQUEST = {
	action: 'facetwp_refresh',
	data: {
		facets: { search: '', company_specialties: [], pagination: [] },
		frozen_facets: {},
		http_params: { get: [], uri: 'investors/portfolio', url_vars: [] },
		template: 'company_portfolio',
		extras: { sort: 'default', per_page: PER_PAGE },
		soft_refresh: 1,
		is_bfcache: 0,
		first_load: 0,
		paged: 1
	}
};

const CARD = /(?=<div class="fwpl-result\b)/;
const NAME = /class="company-name-link">([\s\S]*?)<\/a>/;
const SITE = /\bhref="(https?:\/\/[^"]+)"[^>]*class="company-name-link"/;
const TERM = /\bfwpl-tax-company_specialties">([^<]*)</g;
const EXIT = /^exit$/i;
const LEGAL_FORM = /,?\s+(?:inc|llc|ltd|corp)\.?$/i;
const FORMERLY = /\s*\(formerly\b[^)]*\)$/i;
const BUYER = /\s*\(acquired by ([^)]*)\)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&rsquo;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]*>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(API_URL, {
		method: 'POST',
		headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify(REQUEST)
	});
	const body = await resp.text();
	const captcha = resp.status === 202 || /sgcaptcha/i.test(body);
	if (!resp.ok || captcha) {
		throw new Error(`innovationworks: ${API_URL} answered ${resp.status}${captcha ? ", siteground's captcha" : ''}`);
	}
	const { template, settings } = JSON.parse(body) as {
		template?: string;
		settings?: { pager?: { total_rows?: number } };
	};
	const cards = (template ?? '').split(CARD).slice(1);
	// a part of the list must not pass for the whole
	const total = settings?.pager?.total_rows ?? 0;
	if (cards.length === 0 || cards.length < total) {
		throw new Error(`innovationworks: the endpoint gave ${cards.length} of the ${total} companies it counts`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		const shown = clean(card.match(NAME)?.[1] ?? '');
		const buyer = shown.match(BUYER)?.[1] ?? '';
		const name = shown.replace(BUYER, '').replace(FORMERLY, '').replace(LEGAL_FORM, '').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const terms = [...card.matchAll(TERM)].map(([, term]) => tag(term));
		const exited = Boolean(buyer) || terms.some((term) => EXIT.test(term));
		companies.push({
			name,
			category: [
				...terms.filter((term) => !EXIT.test(term)),
				buyer ? `Acquired by ${tag(buyer)}` : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: unescape(card.match(SITE)?.[1] ?? '')
		});
	}

	return companies;
}
