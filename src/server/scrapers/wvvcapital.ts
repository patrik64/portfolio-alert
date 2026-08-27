import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.wvvcapital.com/portfolio-companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the page is squarespace logo galleries under two headings, Active Portfolio
// and Acquired. each slide is a logo image whose alt carries the company name
// (usually as the upload filename), wrapped in a link only when the company
// has one. the team headshots further down have no alt, which keeps them out.

const nameFor = (alt: string) => {
	const name = alt
		.replace(/\.\w+$/, '')
		.replace(/\d+$/, '')
		.replace(/[+_]/g, ' ')
		.trim();
	return /^[a-z]/.test(name) ? name.charAt(0).toUpperCase() + name.slice(1) : name;
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	// the site header carries its own logo slide, so only slides after the
	// first section heading count
	const activeAt = html.indexOf('Active Portfolio');
	const acquiredAt = html.indexOf('Acquired');

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let offset = 0;
	for (const chunk of html.split('class="slide"')) {
		const at = offset;
		offset += chunk.length + 'class="slide"'.length;
		if (at < activeAt) continue;
		const alt = chunk.match(/<img[^>]*alt="([^"]+)"/)?.[1];
		if (!alt) continue;
		const name = nameFor(alt);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: acquiredAt >= 0 && at > acquiredAt ? 'Acquired' : '',
			url: chunk.match(/href="(https?:\/\/[^"]+)"/)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('wvvcapital: no companies on the page');
	}

	return companies;
}
