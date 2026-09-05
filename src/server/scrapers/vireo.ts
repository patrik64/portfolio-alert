import type { ScrapedCompany } from './types';

const BASE_URL = 'https://vireo.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 20;

// server-rendered react (no framework markers, no hydration payload): the
// portfolio is the #index section, a numbered <li> per company carrying the
// name, the tagline, the value-chain segment (Upstream/Midstream/Downstream)
// and — for a dead or exited one — a status badge glued to the name
// ("VesputiExit"), which moves to the category. a row links either straight to
// the company's site or to a detail page on the fund's site, whose only
// external link is the company's site. two stealth rows are named
// "Undisclosed" and name no company, so they are skipped.

// anchored at the hostname so that "x.com" doesn't swallow "pionix.com"
const NOT_THE_COMPANY =
	/\/\/(?:[a-z0-9-]+\.)*(?:vireo\.vc|linkedin\.com|twitter\.com|x\.com|instagram\.com|facebook\.com|youtube\.com|medium\.com|crunchbase\.com)(?:[/:?]|$)/i;

const decode = (s: string) =>
	s
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

async function fetchSite(path: string): Promise<string> {
	try {
		const resp = await fetch(`${BASE_URL}${path}`, { headers: { 'User-Agent': UA } });
		if (!resp.ok) return '';
		const body = (await resp.text()).split('<body')[1] ?? '';
		for (const m of body.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
			if (!NOT_THE_COMPANY.test(m[1])) return m[1];
		}
		return '';
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const at = html.indexOf('id="index"');
	if (at < 0) {
		throw new Error('vireo: no index section on the portfolio page');
	}
	const section = html.slice(at, html.indexOf('</section>', at));

	const entries: { name: string; category: string; path: string; url: string }[] = [];
	const seen = new Set<string>();
	for (const [, row] of section.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)) {
		// the name cell, up to the tagline cell that follows it
		const cell = row.match(/<span class="text-display[^"]*">([\s\S]*?)<\/span><span class="col-span-2/)?.[1];
		if (!cell) continue;
		const name = decode(cell.split('<')[0]);
		// a company the fund has not named yet
		if (!name || /^undisclosed$/i.test(name) || seen.has(name)) continue;
		seen.add(name);
		const badge = decode(cell.match(/<span[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '');
		const tags = [decode(row.match(/<span class="hidden text-kicker[^"]*">([^<]*)<\/span>/)?.[1] ?? '')];
		if (badge) {
			tags.push(/^exit/i.test(badge) ? 'Exited' : /acqui/i.test(badge) ? 'Acquired' : badge);
		}
		const href = row.match(/<a[^>]*href="([^"]*)"/)?.[1] ?? '';
		entries.push({
			name,
			category: tags.filter(Boolean).join(', '),
			path: href.startsWith('/') ? href : '',
			url: href.startsWith('http') ? href : ''
		});
	}
	if (entries.length === 0) {
		throw new Error('vireo: no companies on the portfolio page');
	}

	// the companies without a direct link keep their site on the detail page
	const companies: ScrapedCompany[] = [];
	for (let i = 0; i < entries.length; i += BATCH_SIZE) {
		const batch = entries.slice(i, i + BATCH_SIZE);
		const sites = await Promise.all(batch.map((e) => (e.path ? fetchSite(e.path) : e.url)));
		for (let j = 0; j < batch.length; j++) {
			const { name, category, path } = batch[j];
			companies.push({ name, category, url: sites[j] || (path ? `${BASE_URL}${path}` : '') });
		}
	}

	return companies;
}
