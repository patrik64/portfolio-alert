import type { RequestEvent } from '@sveltejs/kit';
import { repo } from 'remult';
import { api } from '../../server/api';
import { dayEnd, dayKey, rssFeed, WINDOW_DAYS } from '../../server/rss';
import { Company } from '../../shared/Company';
import { Fund } from '../../shared/Fund';
import { TIMELINE_START } from '../../shared/timeline';

// GET /rss.xml — the nightly newcomer digests as an rss feed
export const GET = (event: RequestEvent) =>
	api.withRemult(event, async () => {
		const now = new Date();
		// the feed covers the same stretch as the timeline, at most WINDOW_DAYS back
		const since = new Date(Math.max(TIMELINE_START.getTime(), now.getTime() - WINDOW_DAYS * 86_400_000));

		// a fund's first day is its baseline import — the whole portfolio as it
		// stood, which neither the timeline nor the bluesky post counts as
		// newcomers. funds imported on the same day share a branch of the query
		const [baselines, funds] = await Promise.all([
			repo(Company).groupBy({ group: ['fundSlug'], min: ['firstSeenAt'] }),
			repo(Fund).find({ limit: 1000 })
		]);
		const fundsByBaselineEnd = new Map<number, string[]>();
		for (const b of baselines) {
			if (!b.firstSeenAt.min) continue;
			const end = dayEnd(dayKey(new Date(b.firstSeenAt.min))).getTime();
			fundsByBaselineEnd.set(end, [...(fundsByBaselineEnd.get(end) ?? []), b.fundSlug]);
		}
		const companies =
			fundsByBaselineEnd.size === 0
				? []
				: await repo(Company).find({
						where: {
							firstSeenAt: { $gte: since },
							$or: [...fundsByBaselineEnd].map(([end, slugs]) => ({
								fundSlug: { $in: slugs },
								firstSeenAt: { $gt: new Date(end) }
							}))
						},
						orderBy: { firstSeenAt: 'desc' },
						limit: 100_000
					});

		const rows = companies.flatMap((c) =>
			c.firstSeenAt
				? [{ fundSlug: c.fundSlug, name: c.name, url: c.url, firstSeenAt: c.firstSeenAt }]
				: []
		);
		const latestFetch = funds.reduce<Date | undefined>(
			(latest, f) => (f.lastFetchedAt && (!latest || f.lastFetchedAt > latest) ? f.lastFetchedAt : latest),
			undefined
		);

		return new Response(rssFeed(rows, latestFetch, now), {
			headers: {
				// browsers render plain xml as a document tree, while the feed's own
				// media type gets them offering a download; readers accept either
				'Content-Type': 'application/xml; charset=utf-8',
				// a night arrives once a day; feed readers ask far more often
				'Cache-Control': 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600'
			}
		});
	});
