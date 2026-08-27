import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.worklife.vc/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the page is static webflow: one section per audience ("For developers"),
// each a run of logo links to the company sites. the logo alts and css
// classes are riddled with copy-paste leftovers (the same "Dipsea logo" alt
// sits on eight different companies), so a candidate name is trusted only
// when it matches the company's hostname — otherwise the hostname itself
// names the company, as for wischoff and boxgroup.

const hostLabel = (url: string) => {
	const labels = new URL(url).hostname.replace(/^www\./, '').split('.');
	return labels.length > 2 ? labels[labels.length - 2] : labels[0];
};

// logo names are often all-lowercase ("pietra" -> "Pietra")
const capitalize = (s: string) => (/^[a-z]/.test(s) ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const nameFor = (url: string, alt: string, cssSlug: string) => {
	const host = new URL(url).hostname.toLowerCase();
	for (const candidate of [alt.replace(/\s*logo\s*$/i, '').trim(), cssSlug]) {
		const key = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
		if (key.length > 1 && host.includes(key)) return capitalize(candidate);
	}
	return capitalize(hostLabel(url));
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const section of html.split(/<div id="portfolio-[a-z-]+"/).slice(1)) {
		// the section heading, "For developers" -> "Developers"
		const category = (section.match(/class="ff-plaid-m[^"]*">([^<]*)</)?.[1] ?? '')
			.trim()
			.replace(/^For\s+(\w)/, (_, c: string) => c.toUpperCase());
		for (const m of section.matchAll(
			/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*class="portfolio-logo[^"]*"[^>]*>([\s\S]*?)<\/a>/g
		)) {
			const url = m[1];
			if (seen.has(url)) continue;
			seen.add(url);
			const alt = m[2].match(/alt="([^"]*)"/)?.[1] ?? '';
			// "inline" just marks an svg logo, it names nothing
			const cssSlug = m[2].match(/logo-(?!inline)([a-z0-9-]+)/)?.[1] ?? '';
			companies.push({ name: nameFor(url, alt, cssSlug), category, url });
		}
	}

	if (companies.length === 0) {
		throw new Error('worklife: no companies on the page');
	}

	return companies;
}
