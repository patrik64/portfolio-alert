import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.primetimepartners.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow, the portfolio a set of hand-built tabs rather than a
// collection. the tab strip names them — All, Fintech, Healthcare,
// Consumer/Media, Angel Investments — and each pane holds a card per company
// with its name, a line about it and a link.
//
// "All" repeats every company the sector tabs already carry, and the fund
// keeps the two by hand, so they have drifted: it writes CoreCare as
// "Core.Care" there, and links Rosarium Health to a second domain. the sector
// panes are read first and "All" only fills a gap, so a company the fund adds
// to the index but not to a sector is still picked up, without the drift
// showing up as a second company.
//
// "Angel Investments" is how the fund came in rather than what the company
// does, but it is the only heading those six are filed under, so it is kept.

const TAB = /<a data-w-tab="([^"]*)" class="linktabs[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
const PANE = /<div data-w-tab="([^"]*)" class="[^"]*w-tab-pane/g;
const CARD =
	/<a href="([^"]*)" target="_blank" class="blog-thumbnail-container[^"]*">([\s\S]*?)<\/a>/g;
const NAME = /<h4 class="heading-5">([\s\S]*?)<\/h4>/;
// the index tab, which names no sector
const EVERY = /^all$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]*>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();

const key = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
// the fund writes the same link with and without its trailing slash
const linkKey = (s: string) => s.replace(/\/+$/, '').toLowerCase();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = (await resp.text()).replace(/\s+/g, ' ');

	const labels = new Map<string, string>();
	for (const m of html.matchAll(TAB)) {
		labels.set(m[1], clean(m[2]));
	}

	const panes: { label: string; body: string }[] = [];
	const starts = [...html.matchAll(PANE)];
	for (const [i, m] of starts.entries()) {
		panes.push({
			label: labels.get(m[1]) ?? '',
			body: html.slice(m.index, starts[i + 1]?.index ?? html.length)
		});
	}

	const companies: ScrapedCompany[] = [];
	const seenNames = new Set<string>();
	const seenLinks = new Set<string>();
	// sectors first, so the index tab can only add a company, never rename one
	const sectors = panes.filter((p) => !EVERY.test(p.label));
	const index = panes.filter((p) => EVERY.test(p.label));
	for (const pane of [...sectors, ...index]) {
		for (const m of pane.body.matchAll(CARD)) {
			const name = clean(m[2].match(NAME)?.[1] ?? '');
			const url = clean(m[1]);
			if (!name || seenNames.has(key(name))) continue;
			if (url && seenLinks.has(linkKey(url))) continue;
			seenNames.add(key(name));
			if (url) seenLinks.add(linkKey(url));

			companies.push({ name, category: EVERY.test(pane.label) ? '' : pane.label, url });
		}
	}

	if (companies.length === 0) {
		throw new Error('primetime: no companies on the portfolio page');
	}

	return companies;
}
