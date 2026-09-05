import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.valar.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the site is a Next.js pages-router one-pager over Sanity, and there is no
// separate portfolio route — the whole portfolio is the "partners" section of
// the home page. __NEXT_DATA__ ships the resolved partnerList document, whose
// partners each carry a name and a website, so nothing has to be looked up in
// the CMS. the cards show only a logo and a description: no sectors, stages or
// exit badges anywhere, so the companies come back without categories.

interface Partner {
	_type?: string;
	name?: string;
	website?: string;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const json = html.match(
		/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/
	)?.[1];
	if (!json) {
		throw new Error('valar: no __NEXT_DATA__ on the page');
	}

	const nextData = JSON.parse(json) as {
		props?: { pageProps?: { data?: { partners?: { partners?: Partner[] } } } };
	};
	const partners = nextData.props?.pageProps?.data?.partners?.partners ?? [];
	if (partners.length === 0) {
		throw new Error('valar: no partners in the page data');
	}

	const companies: ScrapedCompany[] = [];
	for (const p of partners) {
		const name = (p.name ?? '').trim();
		if (!name) continue;
		let url = (p.website ?? '').trim();
		if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
		companies.push({ name, category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('valar: no named companies in the partner list');
	}

	return companies;
}
