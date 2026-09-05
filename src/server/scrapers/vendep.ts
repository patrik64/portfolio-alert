import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.vendep.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, ' ')
		.trim();

// the portfolio is one static webflow table — the finsweet chips filter in the
// browser and there is no pagination wrapper. each row ships twice (a desktop
// accordion plus a tablet copy), so every field is read once per row. the row
// carries the logo, the stage, the fund and the status; the expanded accordion
// adds the company website. three rows have an empty logo alt, so their name is
// recovered from the logo filename when it matches the site's hostname and from
// the hostname itself otherwise.

const hostLabel = (url: string) => {
	const labels = new URL(url).hostname.replace(/^www\./, '').split('.');
	return labels.length > 2 ? labels[labels.length - 2] : labels[0];
};

const capitalize = (s: string) => (/^[a-z]/.test(s) ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// "…/68ac0cbc_Savantiq_Primary_2.webp" -> "Savantiq_Primary_2"
const fileLabel = (src: string) => {
	try {
		const file = decodeURIComponent(src.split('/').pop() ?? '');
		return file
			.replace(/^[0-9a-f]{16,}_/, '')
			.replace(/\.[a-z0-9]+$/i, '')
			.replace(/[\s_-]*logo\s*$/i, '')
			.trim();
	} catch {
		return '';
	}
};

const nameFor = (alt: string, src: string, site: string) => {
	const fromAlt = alt.replace(/\s*logo\s*$/i, '').trim();
	if (fromAlt) return fromAlt;
	if (!site) return '';
	const host = new URL(site).hostname.toLowerCase();
	// the filename is often a design export ("unnamed (5)"), so trust it only
	// when it spells out the company's own hostname
	const candidate = fileLabel(src);
	const key = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
	if (key.length > 1 && host.includes(key)) return candidate;
	return capitalize(hostLabel(site));
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split('class="folio-table_item w-dyn-item"').slice(1)) {
		const row = item.split('class="folio-table_item w-dyn-item"')[0];
		// href="#" on a company that is gone for good
		const site = row.match(
			/class="text-style-tag u-mb-1">website<\/div><a href="(https?:\/\/[^"]+)"/
		)?.[1];
		const logo = row.match(/<img src="([^"]*)"[^>]*class="folio-table_logo"/);
		const alt = decode(row.match(/<img[^>]*alt="([^"]*)"[^>]*class="folio-table_logo"/)?.[1] ?? '');
		const name = nameFor(alt, logo?.[1] ?? '', site ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const field = (f: string) =>
			decode(row.match(new RegExp(`fs-list-field="${f}"[^>]*>([^<]*)<`))?.[1] ?? '');
		const status = field('status');
		companies.push({
			name,
			category: [field('stage'), field('fund'), status === 'Exited' ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url: site ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('vendep: no companies on the portfolio page');
	}

	return companies;
}
