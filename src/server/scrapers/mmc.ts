import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://mmc.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 8;

// wordpress. the whole portfolio is on the one page — ninety-two cards, no
// paging — each with the company's name, the sector the fund files it under
// and, on nineteen of them, a mark saying it has gone.
//
// the card links to the fund's own page for a company rather than out to it,
// but that page states the address under a Website heading and all ninety-two
// have one, so they are fetched. thirteen kilobytes each over the wire, which
// is worth it to send a reader to the company rather than to the fund.
//
// the round the fund came in at and the year are on the card too. both are the
// shape of the investment rather than the company, so neither is written down.

const CARD = /<div class="default-portfolio-item">([\s\S]*?)(?=<div class="default-portfolio-item">|<\/section>)/g;
const NAME = /<a href="(https:\/\/mmc\.vc\/portfolio\/[^"]+)"><h4>([\s\S]*?)<\/h4><\/a>/;
const SECTOR = /meta-tag--portfolio">\s*<p class="meta">([\s\S]*?)<\/p>/;
// the fund marks a company it no longer holds with a mark of its own
const SOLD = /default-portfolio-item__exited/;
const SITE = /<p class="meta">\s*Website\s*<\/p>\s*<p><a href="([^"]*)"/;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);

	const listed: { name: string; page: string; sector: string; state: string }[] = [];
	const seen = new Set<string>();
	for (const [, card] of html.matchAll(CARD)) {
		const named = card.match(NAME);
		const name = clean(named?.[2] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		listed.push({
			name,
			page: named?.[1] ?? '',
			sector: clean(card.match(SECTOR)?.[1] ?? ''),
			// the fund's own word for it, which it draws rather than writes
			state: SOLD.test(card) ? 'Exited' : ''
		});
	}

	if (listed.length === 0) {
		throw new Error('mmc: no companies in the portfolio grid');
	}

	const companies: ScrapedCompany[] = [];
	for (let at = 0; at < listed.length; at += BATCH_SIZE) {
		const batch = listed.slice(at, at + BATCH_SIZE);
		const pages = await Promise.all(
			batch.map((company) => (company.page ? fetchText(company.page) : Promise.resolve('')))
		);
		batch.forEach((company, index) => {
			const site = clean(pages[index].match(SITE)?.[1] ?? '');
			companies.push({
				name: company.name,
				category: [company.sector, company.state].filter(Boolean).join(', '),
				url: /^https?:\/\//i.test(site) ? site : company.page
			});
		});
	}

	return companies;
}
