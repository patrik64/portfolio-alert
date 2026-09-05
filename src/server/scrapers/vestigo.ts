import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.vestigoventures.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// server-rendered wordpress (WPBakery): the portfolio is a logo wall in the
// homepage's #portfolio section — pnw-portfolio-item divs linking the company
// sites around logo images with no alt text. names come from the logo
// filenames ("VV_Portfolio_Advocate_BW.png" -> "Advocate"), as for wischoff;
// deliberate camel-cased brandings ("HumanityLabs") are trusted as-is, while
// a single-word name that doesn't echo the company's hostname is a filename
// typo ("Microntoes" on micronotes.com) and yields to the hostname instead.

const NOISE =
	/^(vv|vestigo|venture|portfolio|updatedlogos?|logos?|template|static|hover|bw|blk|black|white|blue)$/i;

const hostLabel = (url: string) => {
	const labels = new URL(url).hostname.replace(/^www\./, '').split('.');
	return labels.length > 2 ? labels[labels.length - 2] : labels[0];
};

const capitalize = (s: string) => (/^[a-z]/.test(s) ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function nameFor(imgUrl: string, companyUrl: string): string {
	const tokens = decodeURIComponent(imgUrl.split('/').pop() ?? '')
		.replace(/\.\w+$/, '')
		.split('_')
		.map((t) => t.replace(/-\d+$/, '').replace(/-logos?$/i, ''))
		.filter((t) => t && !NOISE.test(t) && !/^\d+$/.test(t));
	// split deliberate camel-case brandings ("HumanityLabs" -> "Humanity Labs")
	// and lowercase hyphenations ("foundation-source" -> "foundation source",
	// while "AI-ONE" keeps its hyphen)
	const name = tokens
		.join(' ')
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/([a-z])-(?=[a-z])/g, '$1 ');
	const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
	const hostKey = new URL(companyUrl).hostname
		.replace(/^www\./, '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
	// a one-word name that doesn't echo the hostname is a filename typo
	if (key.length <= 2 || (!name.includes(' ') && !hostKey.includes(key))) {
		return capitalize(hostLabel(companyUrl));
	}
	return name.split(' ').map(capitalize).join(' ');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, url, img] of html.matchAll(
		/<div class="pnw-portfolio-item"><a href="([^"]*)"[^>]*>\s*<div class="portfolio-image"><img[^>]*src="([^"]*)"/g
	)) {
		if (seen.has(url)) continue;
		seen.add(url);
		companies.push({ name: nameFor(img, url), category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('vestigo: no companies on the page');
	}

	return companies;
}
