import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.btv.vc/partnerships';
// webflow's own address for the same site, which stayed up when the fund's
// domain stopped answering in october 2026 (no certificate served for it)
const WEBFLOW_URL = 'https://better-tomorrow-ventures.webflow.io/partnerships';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the partnerships page is one list served whole, a line a
// company — its name linking its site and, on some, a tag: "Acquired",
// "Pre-BTV" for the partners' investments before the fund, or "Mint
// Accelerator" for the fund's programme. the tag is kept, and an
// acquisition is an exit.

const ITEM = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="btv-list-link"[^>]*>([\s\S]*?)<\/a>\s*(?:<div class="btv-acquired-tag">([\s\S]*?)<\/div>)?/g;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the fund's domain first; webflow's address only when the domain cannot be
// reached at all, never in place of a page the domain did answer with
async function fetchPage(): Promise<string> {
	let resp: Response;
	try {
		resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	} catch {
		resp = await fetch(WEBFLOW_URL, { headers: { 'User-Agent': UA } });
	}
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${resp.url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchPage();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, href, text, note] of html.matchAll(ITEM)) {
		const name = clean(text);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const label = tag(note ?? '');
		const site = unescape(href).trim();
		companies.push({
			name,
			category: [label, /^acquired\b/i.test(label) ? 'Exited' : ''].filter(Boolean).join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('btv: no companies on the partnerships page');
	}

	return companies;
}
