import type { ScrapedCompany } from './types';

const AJAX_URL = 'https://obvious.com/wp-admin/admin-ajax.php';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// the fund pages thirty at a time; the cap is only so a page that always says
// there is more cannot spin here forever
const MAX_PAGES = 50;

// wordpress on the fund's own theme. the portfolio page opens on a spotlight
// of six logos, and under it the list that is the actual portfolio — but the
// page ships only its first thirty of ninety-one, and asks the theme for the
// rest as a reader pages through. so they are asked for the same way, and the
// pages are walked until the fund stops offering another.
//
// the spotlight is not read. it names no company — the heading over a card is
// the line about what the company does, and the name is only inside the logo —
// and every company it shows is in the list below it anyway, named.
//
// the fund files a company under one of its three pillars, and marks how a
// company left in its own words. it says Acquired of nineteen and IPO of six,
// and those are kept apart rather than folded into the one word, since the
// fund's own filters offer them apart. the year a company was founded is on
// the card too; a year is not a name to file one under, so it is left out.
//
// two companies have no address written down and keep none: the fund publishes
// no page of its own for a company to fall back on.

const ITEM = '<div class="list-secondary__item"';
const NAME = /<div class="list-secondary__title">([\s\S]*?)<\/div>/;
const LINK = /<a href="([^"]+)" class="list-secondary__link"/;
const META = /<div>\s*<span>([\s\S]*?)<\/span>\s*<strong>([\s\S]*?)<\/strong>\s*<\/div>/g;
// what the fund files a company under, and how it left
const KEPT = /^(pillar|status):$/i;

interface Answer {
	success?: boolean;
	data?: { articles?: string; load_more?: string };
}

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => un(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a pillar written with a comma in it would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function ask(body: string): Promise<Answer> {
	const resp = await fetch(AJAX_URL, {
		method: 'POST',
		headers: {
			'User-Agent': UA,
			'Content-Type': 'application/x-www-form-urlencoded',
			'X-Requested-With': 'XMLHttpRequest'
		},
		body
	});
	if (!resp.ok) {
		throw new Error(`Failed to fetch the portfolio: ${resp.status}`);
	}
	try {
		return (await resp.json()) as Answer;
	} catch {
		throw new Error('obvious: the portfolio came back in a shape that could not be read');
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	let answer = await ask('action=filter_portfolio');
	let html = answer.data?.articles ?? '';

	for (let page = 2; page <= MAX_PAGES && (answer.data?.load_more ?? '').trim(); page++) {
		answer = await ask(`action=portfolio_load_more&paged=${page}`);
		const more = answer.data?.articles ?? '';
		if (!more.includes(ITEM)) break;
		html += more;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const category: string[] = [];
		for (const [, label, value] of item.matchAll(META)) {
			if (KEPT.test(clean(label))) category.push(tag(value));
		}

		companies.push({
			name,
			category: category.filter(Boolean).join(', '),
			url: clean(item.match(LINK)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('obvious: no companies in the portfolio');
	}

	return companies;
}
