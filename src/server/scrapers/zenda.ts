import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.zenda.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#39;|&#8217;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();

// the portfolio page (WordPress, single-quoted markup spread over many lines)
// renders a grid item per company: the name in a title div and, for some, the
// site behind a "visit website" button. cards titled STEALTH are unannounced
// placeholders and are skipped

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	for (const item of html.split("<li class='grid-item'").slice(1)) {
		const name = decode(item.match(/<div class='title'>([^<]*)<\/div>/)?.[1] ?? '');
		if (!name || /^stealth$/i.test(name)) continue;
		companies.push({
			name,
			category: '',
			url: item.match(/view-website-button'\s+href='(https?:\/\/[^']+)'/)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('zenda: no companies found on the portfolio page');
	}

	return companies;
}
