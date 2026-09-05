import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://tobacapital.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: four grids of logos under their own headings — where the fund
// invested directly, in climate, alongside others, and what has since exited —
// and a company belongs to whichever heading it follows.
//
// the logos carry no alt text, and their filenames are wordpress uploads: a
// few name the company, but as many are an upload id or say only "images-1".
// so the company's own hostname names it, and the filename is used only where
// the hostname bears it out — which is what keeps "conversica-logo-horizontal"
// from becoming a company called Conversica Logo Horizontal.

const BLOCK = /<li class="logo-block">([\s\S]*?)<\/li>/g;
const HEADING = /<h2 class="label">([\s\S]*?)<\/h2>/g;
const SITE = /href="(https?:\/\/[^"]+)"/;
const LOGO = /\/([^/"?]+)\.(?:png|jpe?g|svg|webp)/i;

// what an upload is called besides the company
const DRESSING =
	/^(logos?|logotype|wordmark|horizontal|vertical|images?|img|icon|final|new|web|colou?r|black|white|transparent|branding|thumbnail|lg|sm|md|full|[0-9a-f]{12,}|e\d{6,}|\d+)$/i;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const capitalize = (s: string) =>
	s
		.split(' ')
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

const hostLabel = (url: string) => {
	const labels = new URL(url).hostname.replace(/^www\./, '').split('.');
	return labels.length > 2 ? labels[labels.length - 2] : labels[0];
};

function nameFor(file: string, url: string): string {
	const raw = hostLabel(url);
	const host = key(raw);
	const words = decodeURIComponent(file)
		.split(/[^A-Za-z0-9]+/)
		.filter((w) => w && !DRESSING.test(w));

	for (let len = words.length; len > 0; len--) {
		for (let start = 0; start + len <= words.length; start++) {
			const run = words.slice(start, start + len);
			const k = key(run.join(''));
			if (k.length > 1 && host.includes(k)) return capitalize(run.join(' '));
		}
	}
	return capitalize(raw);
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const headings = [...html.matchAll(HEADING)].map((m) => ({
		at: m.index,
		label: m[1].replace(/\s+/g, ' ').trim()
	}));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(BLOCK)) {
		const url = m[1].match(SITE)?.[1];
		// one logo on the page is not linked, and nothing else names it
		if (!url) continue;
		const name = nameFor(m[1].match(LOGO)?.[1] ?? '', url);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: headings.filter((hd) => hd.at < m.index).pop()?.label ?? '',
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('toba: no companies on the portfolio page');
	}

	return companies;
}
