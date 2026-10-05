import type { RequestEvent } from '@sveltejs/kit';
import { repo } from 'remult';
import { api } from '../../server/api';
import { statistics } from '../../server/statistics';
import { Company } from '../../shared/Company';
import { TIMELINE_START } from '../../shared/timeline';

// GET /statistics.json — every month's newcomers, counted: the numbers the
// statistics page draws
export const GET = (event: RequestEvent) =>
	api.withRemult(event, async () => {
		// the newcomers as the feed and the api have them: nothing a baseline
		// import brought in, nothing from before the timeline began. the
		// counting happens here rather than in the browser, which gets a few
		// kilobytes of totals instead of every row
		const companies = await repo(Company).find({
			where: { isBaseline: false, firstSeenAt: { $gte: TIMELINE_START } },
			limit: 100_000
		});
		const rows = companies.flatMap((c) =>
			c.firstSeenAt
				? [{ fundSlug: c.fundSlug, name: c.name, category: c.category, url: c.url, firstSeenAt: c.firstSeenAt }]
				: []
		);

		return new Response(JSON.stringify(statistics(rows)), {
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
				// the numbers change once a night, when the funds are refreshed; the
				// cdn holds them for an hour and serves them a while longer while
				// fetching fresh ones
				'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'
			}
		});
	});
