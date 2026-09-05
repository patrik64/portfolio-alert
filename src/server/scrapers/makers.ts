import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.makersfund.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, and the page carries its portfolio whole: every company with the
// sectors and the region it is filed under, where it is, and what became of
// it. the fund publishes no address for any of them and keeps no page of its
// own for one either, so the link is left empty.
//
// a company's sectors and region are written into it as the class the browser
// filters on — content, platform, asia — and the words those stand for are the
// fund's own, sitting beside them in the filters. so the filters are read
// first and each class is looked up in them, in the order the fund lists them,
// rather than a class being turned into a word here.
//
// where the fund gives a company a town it is kept over the region, which is
// only the coarser way of saying the same thing; the two companies with no
// town keep their region. a town is written with a slash where it has a comma,
// since the category is joined with commas.
//
// what became of a company is kept in the fund's own words — Acquired by Sony,
// IPO on LSE AIM Market — misspellings and all: two of the twelve read
// "Aquired", which is the fund's text rather than anything to correct here.
// one company carries that same sentence in its name as well, and there it is
// what became of it rather than what it is called, so it comes off.

const NEXT_DATA = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
// what became of a company, written where its name should be
const BECAME = /\s*[-–—]\s*ac?quired by .*$/i;

interface Filter {
	label?: string;
	value?: string;
}

interface Company {
	title?: string;
	cls?: string;
	location?: string;
	status?: string;
	exited_label?: string;
}

interface PageProps {
	companies?: Company[];
	portfolio_categories?: Filter[];
	locations?: Filter[];
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
// the category is joined with commas, so a comma inside one is written as a
// slash instead
const part = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the words the fund puts to a class it files a company under
const said = (filters: Filter[] | undefined, cls: string) =>
	(filters ?? [])
		.filter((filter) => {
			const token = (filter.value ?? '').replace(/^\./, '');
			return token && filter.label && cls.split(/\s+/).includes(token);
		})
		.map((filter) => clean(filter.label ?? ''));

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const data = html.match(NEXT_DATA)?.[1];
	if (!data) {
		throw new Error('makers: the portfolio page no longer carries its own data');
	}
	const props: PageProps = JSON.parse(data).props?.pageProps ?? {};

	const companies: ScrapedCompany[] = [];
	for (const company of props.companies ?? []) {
		const name = clean((company.title ?? '').replace(BECAME, ''));
		if (!name) continue;

		const cls = company.cls ?? '';
		const where = company.location
			? [part(company.location)]
			: said(props.locations, cls).map(part);
		const became =
			company.status === 'exited' ? part(company.exited_label || 'Exited') : '';

		companies.push({
			name,
			category: [...said(props.portfolio_categories, cls), ...where, became]
				.filter(Boolean)
				.join(', '),
			url: ''
		});
	}

	if (companies.length === 0) {
		throw new Error('makers: no companies in the portfolio');
	}

	return companies;
}
