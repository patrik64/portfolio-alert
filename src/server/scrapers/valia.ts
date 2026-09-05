import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.valia.vc/portfolioindex';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace 7.1, but the portfolio is a hand-written code block rather than a
// summary gallery (?format=json returns an empty mainContent): one
// <a class="va-portfolio-item"> per company, linking the company's own site,
// with the sector tags in .categories and the name in .title. an exited company
// carries its outcome in the name — "Cobalt (Acquired: FactSet)",
// "Lyft (NASDAQ: LYFT)" — which moves to the category so the name stays stable.

const decode = (s: string) =>
	s
		.replace(/<[^>]+>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, href, block] of html.matchAll(
		/<a href="([^"]*)" class="va-portfolio-item">([\s\S]*?)<\/a>/g
	)) {
		const title = decode(block.match(/<div class="title">([\s\S]*?)<\/div>/)?.[1] ?? '');
		if (!title || seen.has(title)) continue;
		seen.add(title);
		// "(Acquired: FactSet)" -> Acquired, "(NASDAQ: LYFT)" -> Exited
		const outcome = title.match(/\((acquired)[^)]*\)\s*$/i)
			? 'Acquired'
			: /\((?:nasdaq|nyse|ipo)[^)]*\)\s*$/i.test(title)
				? 'Exited'
				: '';
		const tags = decode(
			block.match(/class="categories above-content">\s*<p>([\s\S]*?)<\/p>/)?.[1] ?? ''
		)
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		if (outcome) tags.push(outcome);
		companies.push({
			name: title.replace(/\s*\([^)]*\)\s*$/, '').trim() || title,
			category: tags.join(', '),
			url: href.startsWith('http') ? href : href ? `https://${href}` : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('valia: no companies on the portfolio page');
	}

	return companies;
}
