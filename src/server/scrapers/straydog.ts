import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://straydogcapital.com/our-portfolio/';
// siteground's firewall answers 403 to chrome user-agent strings and lets
// safari through, as vamosventures' does. what it thinks of the address
// asking matters more: one it distrusts gets its captcha page under a 2xx
// status, however the request is dressed — so the second attempt does not
// repeat the first but says plainly who is asking, which the firewall accepts
// from an address it has nothing against
const ATTEMPTS = [
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
	'portfolio-alert/1.0 (+https://portfolio-alert.vercel.app)'
];
const RETRY_DELAY_MS = 10_000;

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
	// the firewall's mood varies night to night, and vercel's addresses fall
	// in and out of its favour for days at a time. an answer without the grid
	// is the firewall's, not the site's, and the error says what it said
	let html = '';
	let answer = '';
	for (const [attempt, ua] of ATTEMPTS.entries()) {
		if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
		const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': ua } });
		html = await resp.text();
		if (resp.ok && html.includes(GRID)) break;
		const title = html.match(/<title[^>]*>([^<]*)</)?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
		answer =
			`${resp.status}${title ? ` "${title}"` : ''}` +
			(/sgcaptcha/i.test(html) ? ", siteground's captcha" : '');
		html = '';
	}
	if (!html) {
		throw new Error(
			`straydog: the site's firewall refused this address (${answer}) — it answers fetches run locally`
		);
	}

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
