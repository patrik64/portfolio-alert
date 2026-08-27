import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.wischoff.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the portfolio is a logo wall on the homepage: anchors to the company sites
// wrapping webflow-hosted logo images, with no names anywhere in the markup.
// names are derived from the logo filenames (as for boxgroup), falling back
// to the company's hostname when the filename is a generic upload name —
// never from the company sites themselves, so a site outage can't rename
// companies into phantom newcomers.

function nameFor(imgUrl: string, companyUrl: string): string {
	// last filename segment after the webflow hash prefix(es), no extension
	let name = decodeURIComponent(imgUrl.split('/').pop() ?? '')
		.replace(/\.\w+$/, '')
		.split('_')
		.pop()!
		.trim();
	if (/^image-?\d*$/i.test(name) || /^[a-f0-9]{8,}$/i.test(name) || name.length <= 2) {
		name = new URL(companyUrl).hostname.replace(/^www\./, '').split('.')[0];
	}
	name = name.replace(/-/g, ' ');
	// logo filenames are often all-lowercase single words ("pine" -> "Pine")
	return /^[a-z]/.test(name) ? name.charAt(0).toUpperCase() + name.slice(1) : name;
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
		/<a href="(https?:\/\/[^"]+)"[^>]*class="logo_wrapper[^"]*"><img src="([^"]+)"/g
	)) {
		if (seen.has(url)) continue;
		seen.add(url);
		companies.push({ name: nameFor(img, url), category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('wischoff: no companies on the page');
	}

	return companies;
}
