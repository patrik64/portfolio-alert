import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.mosaicventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace 7.1, where a gallery section carries its own items as json on
// the element that draws it. two of those hold the portfolio between them,
// fifty-three and sixteen, and each item is a logo with a paragraph under it:
// the company's name linked to its site, a line on what it does, the years it
// was founded and partnered, and an underlined line of the fund's own labels
// ending in Active or Exited.
//
// the name is taken from that paragraph rather than from the logo's alt text,
// which is where the mistakes are: the alt says Blockhain.com and Mavemoid for
// companies the paragraph calls Blockchain and Mavenoid, and still says Indeez
// for the one now called Beloy. the paragraph agrees with the address every
// time, so it is believed and the alt only fills in where there is no
// paragraph name at all.
//
// the button beside each item is not to be trusted either: the one under
// Alibaba points at arex.io. the address comes from the link around the name.
// four companies have no link, three of them sold and one long quiet, and they
// keep none.
//
// Active is the state a company is in unless something has happened, so only
// Exited is written down.

const CONTEXT = /data-current-context="([^"]*)"/g;
const NAME = /<strong>([\s\S]*?)<\/strong>/;
const SITE = /<a\b[^>]*?\bhref="([^"]*)"/;
// the fund's labels are the underlined line at the foot of the paragraph
const LABELS = /<u>([\s\S]*?)<\/u>/;
// the state a company is in unless the fund says otherwise
const DEFAULT_STATE = /^active$/i;

const un = (s: string) =>
	s
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;|&apos;|&#x27;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => un(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

interface Item {
	description?: string;
	imageAltText?: string;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const items: Item[] = [];
	for (const [, context] of html.matchAll(CONTEXT)) {
		let section: { userItems?: Item[] };
		try {
			section = JSON.parse(un(context)) as { userItems?: Item[] };
		} catch {
			continue;
		}
		items.push(...(section.userItems ?? []));
	}
	if (items.length === 0) {
		throw new Error('mosaic: the page carries no gallery items');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const said = item.description ?? '';
		const name = clean(said.match(NAME)?.[1] ?? '') || clean(item.imageAltText ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const site = clean(said.match(SITE)?.[1] ?? '');
		companies.push({
			name,
			category: clean(said.match(LABELS)?.[1] ?? '')
				.split(',')
				.map((label) => label.trim())
				.filter((label) => label && !DEFAULT_STATE.test(label))
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('mosaic: no companies in the portfolio galleries');
	}

	return companies;
}
