import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://straydogcapital.com/our-portfolio/';
// the site's firewall answers 403 to chrome user-agent strings and lets safari
// through, as vamosventures' does
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

// wordpress, the portfolio built with a page builder: a grid of logos, each
// linked to the company, with a green corner flash on the ones that have
// exited. no alt text, no captions, nothing written.
//
// here the logo filenames are the better guide — "california-cultured.jpg" and
// "Sirabellas-Portfolio.jpg" name companies whose domains (cacultured.com,
// vegancheesecake.net) do not. so the filename names the company, and the
// domain stands in only where the filename says too little: where it is a
// couple of letters, or where it prefixes the domain's own name with a
// description, as "plant-based-barvecue" does.

const GRID = 'sdc_portfolio_grid_lists';
const ITEM = '<div class="sdc_portfolio_grid_item">';
const SITE = /href="(https?:\/\/[^"]+)"/;
const LOGO = /data-src="([^"]+)"/;
const EXITED = 'portfolio_exits';

// what a logo file is called besides the company
const DRESSING =
	/^(logos?|logotype|wordmark|final|new|web|white|black|colou?r|transparent|portfolio|\d+x\d+|\d+|[0-9a-f]{8,})$/i;
const SUBDOMAIN = /^(www)$/i;
const SUFFIX = /^(co|com|org|net)$/i;
const MIN_LETTERS = 4;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const capitalize = (s: string) =>
	s
		.split(' ')
		.filter(Boolean)
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

function domainLabel(url: string): string {
	let hostname: string;
	try {
		hostname = new URL(url).hostname.toLowerCase();
	} catch {
		return '';
	}
	const parts = hostname.split('.').filter((p) => !SUBDOMAIN.test(p));
	if (parts.length < 2) return parts[0] ?? '';
	if (parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])) return parts[parts.length - 3];
	return parts[parts.length - 2];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const grid = html.slice(html.indexOf(GRID));
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of grid.split(ITEM).slice(1)) {
		const site = item.match(SITE)?.[1] ?? '';
		const label = domainLabel(site);

		const file = decodeURIComponent(item.match(LOGO)?.[1]?.split('/').pop() ?? '').replace(
			/\.\w+$/,
			''
		);
		const words = file
			.split(/[^A-Za-z0-9]+/)
			.filter((w) => w && !DRESSING.test(w))
			// a copy number can be stuck to the word before it, as in "logo7",
			// so what is left is weighed against the dressing a second time
			.map((w) => w.replace(/\d+$/, ''))
			.filter((w) => w && !DRESSING.test(w));

		const fromFile = words.join(' ');
		const fileKey = key(fromFile);
		const labelKey = key(label);
		// the filename is the name unless it says too little, or unless it is
		// the domain's own name with a description stuck on the front
		const useLabel =
			!fileKey ||
			fromFile.replace(/[^A-Za-z]/g, '').length < MIN_LETTERS ||
			(labelKey && fileKey !== labelKey && fileKey.endsWith(labelKey));

		const name = capitalize((useLabel ? label.replace(/-+/g, ' ') : fromFile).trim());
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: item.includes(EXITED) ? 'Exited' : '',
			url: site
		});
	}

	if (companies.length === 0) {
		throw new Error('straydog: no companies on the portfolio page');
	}

	return companies;
}
