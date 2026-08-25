import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.ylventures.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#39;|&#8217;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();

// the portfolio page (WordPress) renders the companies twice, joined by a
// slug: logo cards (the name in the first image alt) and a hidden modal per
// company carrying a Field line, an exited flag in data-company-status, and
// the company site among its social links. one card is a javascript template
// ("${companySlug}") and is skipped

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const nameBySlug = new Map<string, string>();
	for (const card of html.split('<div class="card card--').slice(1)) {
		const slug = card.match(/data-company="([^"#]+)"/)?.[1] ?? '';
		const alt = decode((card.match(/alt="([^"]+)"/)?.[1] ?? '').replace(/\s*logo\s*$/i, ''));
		if (slug && !slug.includes('$') && alt && !nameBySlug.has(slug)) nameBySlug.set(slug, alt);
	}

	const blocks = [
		...html.matchAll(/class="carousel-item company-block[^"]*" data-company="#([^"]+)"/g)
	];
	if (blocks.length === 0) {
		throw new Error('ylventures: no company modals on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	for (const [i, block] of blocks.entries()) {
		const seg = html.slice(block.index, blocks[i + 1]?.index ?? html.length);
		const slug = block[1];
		const name =
			nameBySlug.get(slug) ??
			slug
				.split('-')
				.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
				.join(' ');
		const field = decode(
			seg.match(/data-item="field">\s*<span>Field<\/span>\s*<p>([^<]*)<\/p>/)?.[1] ?? ''
		);
		const exited = (seg.match(/data-company-status="([^"]*)"/)?.[1] ?? '') !== '';
		companies.push({
			name,
			category: [field, exited ? 'Exited' : ''].filter(Boolean).join(', '),
			url: seg.match(/<li class="website">\s*<a[^>]*href="(https?:\/\/[^"]+)"/)?.[1] ?? ''
		});
	}

	return companies;
}
