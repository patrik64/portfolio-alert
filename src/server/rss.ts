// The newcomers feed: one item per night that turned up new portfolio
// companies — the same digest scripts/post-newcomers.mjs puts on bluesky, with
// the headline as the title and every company named under its fund, each
// linking to its own site. A feed has no length limit, so no night is ever
// summarized into counts.

import { FUNDS } from '../shared/funds';

// feed readers key items by these urls, so they must not depend on which host
// served the request
export const SITE_URL = 'https://portfolio-alert.vercel.app';
export const FEED_URL = `${SITE_URL}/rss.xml`;
// nights are told apart by the calendar day in the timezone the nightly job
// keeps (it runs at 4am in Berlin)
export const TIME_ZONE = 'Europe/Berlin';
// how far back the feed reaches at most (it never predates the timeline), and
// at most how many nights it carries
export const WINDOW_DAYS = 90;
const MAX_ITEMS = 30;
// a fetch lands its newcomers over a few seconds and the nightly run keeps
// going for minutes, so a night this fresh is still being written: it stays
// out of the feed until it has settled, because a reader that caches a
// half-written entry may never show the rest of it
const QUIET_MS = 20 * 60_000;

const clock = new Intl.DateTimeFormat('en', {
	timeZone: TIME_ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	hourCycle: 'h23'
});
const inBerlin = (d: Date) =>
	Object.fromEntries(clock.formatToParts(d).map((p) => [p.type, p.value]));

// YYYY-MM-DD in Berlin
export const dayKey = (d: Date) => {
	const t = inBerlin(d);
	return `${t.year}-${t.month}-${t.day}`;
};

// the instant a Berlin day ends: midnight the next day, which is 22:00 utc in
// summer time and 23:00 otherwise
export const dayEnd = (day: string) => {
	const [y, m, d] = day.split('-').map(Number);
	const summer = new Date(Date.UTC(y, m - 1, d + 1, -2));
	return Number(inBerlin(summer).hour) % 24 === 0 ? summer : new Date(summer.getTime() + 3_600_000);
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

// a night's finds, fund by fund — the loudest funds first, as on bluesky
const describe = (rows: FeedRow[]) => {
	const names = new Map(FUNDS.map((f) => [f.slug, f.name]));
	return [...groupBy(rows, (r) => r.fundSlug)]
		.map(([slug, companies]) => ({
			slug,
			name: names.get(slug) ?? slug,
			companies: [...companies].sort((a, b) => a.name.localeCompare(b.name))
		}))
		.sort((a, b) => b.companies.length - a.companies.length || a.name.localeCompare(b.name))
		.map((g) => {
			const list = g.companies
				.map((c) =>
					c.url.startsWith('http')
						? `<a href="${escape(c.url)}">${escape(c.name)}</a>`
						: escape(c.name)
				)
				.join(', ');
			return `<p><a href="${SITE_URL}/funds/${g.slug}">${escape(g.name)}</a>: ${list}</p>`;
		})
		.join('\n');
};

// rows are the genuine newcomers (no baseline imports), newest first;
// latestFetch is when any fund was last refreshed successfully
export function rssFeed(rows: FeedRow[], latestFetch: Date | undefined, now = new Date()) {
	const byDay = groupBy(rows, (r) => dayKey(r.firstSeenAt));
	const latest = Math.max(rows[0]?.firstSeenAt.getTime() ?? 0, latestFetch?.getTime() ?? 0);
	if (latest && now.getTime() - latest < QUIET_MS) byDay.delete(dayKey(new Date(latest)));

	const nights = [...byDay].sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, MAX_ITEMS);
	const items = nights.map(([day, rows]) => {
		const link = `${SITE_URL}/timeline#${day}`;
		return [
			'<item>',
			`<title>${escape(headline(rows.length))}</title>`,
			`<link>${link}</link>`,
			`<guid>${link}</guid>`,
			// when the night's last newcomer landed
			`<pubDate>${rows[0].firstSeenAt.toUTCString()}</pubDate>`,
			`<description>${escape(describe(rows))}</description>`,
			'</item>'
		].join('\n');
	});

	const description =
		`New portfolio companies of ${FUNDS.length} venture capital and private equity funds: ` +
		'one item per night that found some, as announced on bluesky at @portfolio-alert.bsky.social.';
	const updated = nights.length ? `<lastBuildDate>${nights[0][1][0].firstSeenAt.toUTCString()}</lastBuildDate>\n` : '';

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
