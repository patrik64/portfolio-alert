// The timeline begins the day before the nightly refresh and its bluesky
// announcements went live (21 Aug 2026). The days before that were the setup —
// every fund's baseline import and a week of fetches by hand — and stay out of
// the timeline and out of the rss feed built from it.
export const TIMELINE_START = new Date('2026-08-20T00:00:00+02:00');
