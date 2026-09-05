import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.trailheadcap.com/portfolio-companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, but the portfolio is not squarespace's: it is an elfsight
// widget, and the served page holds only its id — three images in the whole
// document, none of them a company. so the id is read from the page and the
// widget's own contents asked for by it.
//
// the widget is a "team showcase" pressed into service for companies: a member
// is a company, its position line is what the company does, and the group it
// is in says whether it has exited.

const WIDGET = /elfsight-app-([0-9a-f-]{36})/;
const BOOT_URL = 'https://core.service.elfsight.com/p/boot/';

interface Member {
	name?: string;
	visible?: boolean;
	groups?: string[];
	externalLink?: { value?: string };
}

interface Widget {
	data?: {
		settings?: {
			members?: Member[];
			groups?: { id?: string; name?: string }[];
		};
	};
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const page = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!page.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${page.status}`);
	}
	const id = (await page.text()).match(WIDGET)?.[1];
	if (!id) {
		throw new Error('trailhead: no portfolio widget on the page');
	}

	const boot = new URL(BOOT_URL);
	boot.searchParams.set('w', id);
	const resp = await fetch(boot, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch the portfolio widget: ${resp.status}`);
	}
	const body = (await resp.json()) as { data?: { widgets?: Record<string, Widget> } };
	const settings = body.data?.widgets?.[id]?.data?.settings;
	if (!settings?.members) {
		throw new Error('trailhead: the widget lists no companies');
	}

	const groups = new Map((settings.groups ?? []).map((g) => [g.id ?? '', (g.name ?? '').trim()]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const member of settings.members) {
		const name = (member.name ?? '').trim();
		if (!name || member.visible === false || seen.has(name)) continue;
		seen.add(name);
		// "Active" is what a company still held is in, and says nothing
		const tags = (member.groups ?? [])
			.map((g) => groups.get(g) ?? '')
			.filter((tag) => tag && !/^active$/i.test(tag));
		companies.push({
			name,
			category: tags.join(', '),
			url: (member.externalLink?.value ?? '').trim()
		});
	}

	if (companies.length === 0) {
		throw new Error('trailhead: no companies in the widget');
	}

	return companies;
}
