import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.node.vc/investments';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole page served. the fund lists two things on it under their
// own headings: its portfolio, and what its partners backed before joining.
// only the first is read — the second belongs to the firms they came from
// rather than to this fund, the way partners' earlier investments are left out
// elsewhere.
//
// a row prints a company's address rather than its name: a logo with no alt
// text, a line about what the company does, the tags the fund files it under,
// and the domain, written out as the thing a reader is given to go on. so the
// domain is the name here, less the ending the fund did not choose — save for
// the few the fund does name outright, in the cards above the list, and the
// few whose logo it uploaded under the company's name. either of those is
// taken only where the domain bears it out.

const SECTION = /<h[23][^>]*>([\s\S]*?)<\/h[23]>|class="grid-list_item w-dyn-item"/g;
// the fund's own companies, as against its partners' earlier ones
const OWN = /node portfolio/i;
// a row runs to the next one, or — for the last of them — to the rule the
// fund draws under the list, so that the tags below it are not read as its own
const ROW_END = /class="grid-list_item w-dyn-item"|class="divider"|<h[23][\s>]/;
const DOMAIN = /<a href="([^"]*)"[^>]*class="link">([\s\S]*?)<\/a>/;
const LOGO = /<img src="([^"]+)"/;
// a tag is an icon and the word beside it. the fund's own cards write that
// word into a class of its own; the rows do not, so the icon is what finds it
const TAG = /class="tag-icon"[^>]*\/?>\s*<div[^>]*>([\s\S]*?)<\/div>/g;
// a name the fund writes out, in the cards above the list
const SHOWCASE = /class="heading-style-h4[^"]*"[^>]*>([\s\S]*?)<\/(?:a|h3)>/g;
// webflow's hash in front of an uploaded name, and what a logo file is called
// when it is called after itself rather than after the company
const UPLOAD = /^[0-9a-f]{16,}_/;
const ARTWORK = /[\s_-]*(logo|white|black|footer)$/i;

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

// the fund leaves a zero-width space in one of its tags
const clean = (s: string) =>
	un(s.replace(/<[^>]+>/g, ''))
		.replace(/[​-‍﻿]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a tag written with a comma in it would read
// as two rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// a name and a domain are compared on their letters and digits alone
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// the name the fund uploaded a logo under, if it uploaded it under one
const fromLogo = (url: string) => {
	let stem = clean(decodeURIComponent((url.split('/').pop() ?? '').replace(/\+/g, ' ')));
	stem = stem.replace(/\.[a-z0-9]+$/i, '').replace(UPLOAD, '');
	for (let pass = 0; pass < 3; pass++) stem = stem.replace(ARTWORK, '');
	return stem.trim();
};

// the domain read as the name it stands for: what comes before the ending
const fromDomain = (domain: string) => {
	const label = domain.replace(/^www\./i, '').split('.')[0];
	return label ? label.charAt(0).toUpperCase() + label.slice(1) : '';
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// the names the fund writes out above the list, for the few it features
	const written = [...html.matchAll(SHOWCASE)].map((match) => clean(match[1])).filter(Boolean);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let own = false;

	for (const match of html.matchAll(SECTION)) {
		const heading = match[1];
		if (heading !== undefined) {
			own = OWN.test(clean(heading));
			continue;
		}
		if (!own) continue;

		const rest = html.slice(match.index + match[0].length);
		const end = rest.search(ROW_END);
		const row = end === -1 ? rest : rest.slice(0, end);

		const found = row.match(DOMAIN);
		const domain = clean(found?.[2] ?? '');
		if (!domain) continue;

		const candidates = [...written, fromLogo(row.match(LOGO)?.[1] ?? '')];
		const name =
			candidates.find((candidate) => {
				const k = key(candidate);
				return k.length > 1 && key(domain).includes(k);
			}) ?? fromDomain(domain);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [...row.matchAll(TAG)]
				.map((m) => tag(m[1]))
				.filter(Boolean)
				.join(', '),
			url: clean(found?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('node: no companies in the fund’s own portfolio');
	}

	return companies;
}
