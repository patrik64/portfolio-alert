// The newcomers feed: one item per night that turned up new portfolio
// companies — the same digest scripts/post-newcomers.mjs puts on bluesky, with
// the headline as the title and every company named under its fund, each
// linking to its own site. A fund let through by hand later in the day (see
// the README) gets an item of its own, as it gets a post of its own. A feed
// has no length limit, so no night is ever summarized into counts.

import { FUNDS } from '../shared/funds';

// feed readers key items by these urls, so they must not depend on which host
// served the request
export const SITE_URL = 'https://portfolio-alert.vercel.app';
export const FEED_URL = `${SITE_URL}/rss.xml`;
// nights are told apart by the calendar day in the timezone the nightly job
// keeps (it runs at 22:23 utc, around midnight in Vienna)
export const TIME_ZONE = 'Europe/Vienna';
// how far back the feed reaches at most (it never predates the timeline), and
// at most how many items it carries
export const WINDOW_DAYS = 90;
const MAX_ITEMS = 30;
// a run lands its newcomers within the hour the workflow allows it, so
// newcomers further apart than that came from separate runs — the night's and
// a fund let through by hand in the morning — and make separate items. the
// newest run stays out of the feed until that long has passed, when nothing
// more can join it: a reader that caches an item never shows what is added to
// it later
const RUN_MS = 60 * 60_000;

const clock = new Intl.DateTimeFormat('en', {
	timeZone: TIME_ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23'
});
const inVienna = (d: Date) =>
	Object.fromEntries(clock.formatToParts(d).map((p) => [p.type, p.value]));

// YYYY-MM-DD in Vienna
export const dayKey = (d: Date) => {
	const t = inVienna(d);
	return `${t.year}-${t.month}-${t.day}`;
};

// the instant a Vienna day ends: midnight the next day, which is 22:00 utc in
// summer time and 23:00 otherwise
export const dayEnd = (day: string) => {
	const [y, m, d] = day.split('-').map(Number);
	const summer = new Date(Date.UTC(y, m - 1, d + 1, -2));
	return Number(inVienna(summer).hour) % 24 === 0 ? summer : new Date(summer.getTime() + 3_600_000);
};

export interface FeedRow {
	fundSlug: string;
	name: string;
	url: string;
	firstSeenAt: Date;
}

const ENTITIES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c]);

const headline = (n: number) => `${n} new portfolio ${n === 1 ? 'company' : 'companies'}`;

function groupBy<T>(items: T[], key: (item: T) => string) {
	const groups = new Map<string, T[]>();
	for (const item of items) {
		const k = key(item);
		const list = groups.get(k);
		if (list) list.push(item);
		else groups.set(k, [item]);
	}
	return groups;
}

// a night's finds, fund by fund — the loudest funds first, as on bluesky;
// each fund heading links to the fund's own portfolio page
const describe = (rows: FeedRow[]) => {
	const funds = new Map(FUNDS.map((f) => [f.slug, f]));
	return [...groupBy(rows, (r) => r.fundSlug)]
		.map(([slug, companies]) => ({
			name: funds.get(slug)?.name ?? slug,
			url: funds.get(slug)?.url ?? '',
			companies: [...companies].sort((a, b) => a.name.localeCompare(b.name))
		}))
		.sort((a, b) => b.companies.length - a.companies.length || a.name.localeCompare(b.name))
		.map((g) => {
			const items = g.companies
				.map((c) =>
					c.url.startsWith('http')
						? `<li><a href="${escape(c.url)}">${escape(c.name)}</a></li>`
						: `<li>${escape(c.name)}</li>`
				)
				.join('\n');
			const heading = g.url ? `<a href="${escape(g.url)}">${escape(g.name)}</a>` : escape(g.name);
			return `<p>${heading}:</p>\n<ul>\n${items}\n</ul>`;
		})
		.join('\n');
};

// the runs that landed the rows, newest first, each within one day: a gap of
// more than RUN_MS starts an earlier one
function runs(rows: FeedRow[]) {
	const found: { day: string; rows: FeedRow[] }[] = [];
	for (const row of rows) {
		const day = dayKey(row.firstSeenAt);
		const run = found.at(-1);
		if (run && run.day === day && run.rows.at(-1)!.firstSeenAt.getTime() - row.firstSeenAt.getTime() <= RUN_MS) {
			run.rows.push(row);
		} else {
			found.push({ day, rows: [row] });
		}
	}
	return found;
}

// rows are the genuine newcomers (no baseline imports), newest first
export function rssFeed(rows: FeedRow[], now = new Date()) {
	const found = runs(rows);
	if (rows.length && now.getTime() - rows[0].firstSeenAt.getTime() < RUN_MS) found.shift();

	const nights = found.slice(0, MAX_ITEMS);
	const items = nights.map(({ day, rows }, i) => {
		const link = `${SITE_URL}/timeline#${day}`;
		// a day's first run is known by the day alone, as every night was before
		// runs were told apart; a later one by the time it began
		const later = found[i + 1]?.day === day;
		const start = inVienna(rows.at(-1)!.firstSeenAt);
		const guid = later
			? `<guid isPermaLink="false">${link}T${start.hour}:${start.minute}</guid>`
			: `<guid>${link}</guid>`;
		return [
			'<item>',
			`<title>${escape(headline(rows.length))}</title>`,
			`<link>${link}</link>`,
			guid,
			// when the run's last newcomer landed
			`<pubDate>${rows[0].firstSeenAt.toUTCString()}</pubDate>`,
			`<description>${escape(describe(rows))}</description>`,
			'</item>'
		].join('\n');
	});

	const description =
		`New portfolio companies of ${FUNDS.length} venture capital and private equity funds: ` +
		'one item per night that found some, as announced on bluesky at @portfolio-alert.bsky.social.';
	const updated = nights.length ? `<lastBuildDate>${nights[0].rows[0].firstSeenAt.toUTCString()}</lastBuildDate>\n` : '';

	return (
		`<?xml version="1.0" encoding="UTF-8"?>\n` +
		`<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
		`<channel>\n` +
		`<title>portfolio alert</title>\n` +
		`<link>${SITE_URL}/</link>\n` +
		`<atom:link href="${FEED_URL}" rel="self" type="application/rss+xml"/>\n` +
		`<description>${escape(description)}</description>\n` +
		`<language>en</language>\n` +
		updated +
		items.join('\n') +
		(items.length ? '\n' : '') +
		`</channel>\n` +
		`</rss>\n`
	);
}
