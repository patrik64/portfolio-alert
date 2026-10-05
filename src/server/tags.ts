// What a fund files a company under, read for the statistics. A category is a
// comma-joined list of whatever the fund's page says about a company: its
// sectors, but also the stage, the cohort or the year it came in, where it is
// based, which of the fund's vehicles holds it and whether it is still held.
// Counted as they stand, a month's top categories would be "Fall 2026" and
// "Seed" — so each tag is told apart here as a sector, which is a category to
// count, as a stage, or as neither. The patterns know the labels that are
// common across the funds; one fund's own word for a vehicle or a programme
// still passes for a category.

// a tag in lowercase words, without accents or punctuation
const words = (s: string) =>
	s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();

// ...and run together without its "and" and its plural, so that spellings
// differing only in case, hyphens, spaces, an ampersand or a final s share a
// key: "E-commerce" and "eCommerce", "AI & ML" and "AI/ML", "Marketplace"
// and "Marketplaces" (but not "SaaS", too short to be a plural)
const keyOf = (s: string) =>
	words(s)
		.replace(/\band\b/g, ' ')
		.replace(/ /g, '')
		.replace(/(?<=.{3}[^s])s$/, '');

// where a company is based. every country, continent and region comes by the
// name the runtime's own locale data gives it — two letters name a country,
// three digits a continent or a part of one — and beside those the names in
// use that it does not have, the states of the US and a few of Germany, and
// the cities the funds name most. a city missing here is counted as a
// category until it is added
const PLACES = new Set<string>();
const addPlace = (name?: string) => {
	if (name) PLACES.add(words(name));
};
const regionNames = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
for (let a = 65; a <= 90; a++)
	for (let b = 65; b <= 90; b++) addPlace(regionNames.of(String.fromCharCode(a, b)));
for (let n = 1; n < 1000; n++) addPlace(regionNames.of(String(n).padStart(3, '0')));
[
	'USA|US|U.S.|U.S.A.|United States of America|UK|U.K.|Great Britain|Britain|England|Scotland',
	'Wales|EU|UAE|Turkey|Czech Republic|Holland|Korea|Hong Kong|Macau|Ivory Coast',
	'Global|International|Worldwide|Remote|Emerging Markets|Middle East|MENA|MENAP|EMEA|APAC',
	'Asia Pacific|LATAM|South East Asia|SEA|Nordics|Scandinavia|DACH|Benelux|CEE|Baltics',
	'Balkans|Iberia|ANZ|North East|Northeast|North West|Northwest|South East|Southeast',
	'South West|Southwest|Midwest|East Coast|West Coast|Bay Area|SF Bay Area|Silicon Valley',
	'NorCal|Nor Cal|SoCal',
	'Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Hawaii',
	'Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts',
	'Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey',
	'New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania',
	'Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia',
	'Washington|West Virginia|Wisconsin|Wyoming|Washington DC|District of Columbia',
	'Bavaria|Baden-Württemberg|North Rhine-Westphalia|Hesse|Saxony|Lower Saxony',
	'Ontario|Quebec|British Columbia|Alberta',
	'San Francisco|SF|Palo Alto|Mountain View|Menlo Park|San Jose|Oakland|Berkeley|San Mateo',
	'Los Angeles|San Diego|Seattle|Portland|New York City|NYC|Brooklyn|Boston|Cambridge',
	'Chicago|Austin|Dallas|Houston|Denver|Boulder|Miami|Atlanta|Philadelphia|Pittsburgh',
	'Salt Lake City|Toronto|Vancouver|Montreal|Waterloo|London|Oxford|Paris|Berlin|Munich',
	'Hamburg|Amsterdam|Stockholm|Copenhagen|Helsinki|Oslo|Dublin|Zurich|Geneva|Vienna|Madrid',
	'Barcelona|Lisbon|Milan|Rome|Brussels|Warsaw|Prague|Tallinn|Istanbul|Tel Aviv|Jerusalem',
	'Dubai|Abu Dhabi|Riyadh|Cairo|Lagos|Nairobi|Cape Town|Johannesburg|Bangalore|Bengaluru',
	'Mumbai|Delhi|New Delhi|Gurgaon|Hyderabad|Chennai|Pune|Shanghai|Beijing|Shenzhen|Tokyo',
	'Seoul|Jakarta|Sydney|Melbourne|Auckland|Sao Paulo|Mexico City|Bogota|Buenos Aires|Santiago'
]
	.join('|')
	.split('|')
	.forEach(addPlace);

// a state by its two letters, as in "San Francisco / CA" — matched in capitals
// only, and without Arkansas, whose letters more often stand for augmented
// reality
const STATE_CODES = new Set(
	(
		'AL AK AZ CA CO CT DC DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE ' +
		'NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY'
	).split(' ')
);

// a part of a place is one too: "Mainland China", "Rest of Asia"
const PART_OF =
	/^(?:the|greater|mainland|rest of(?: the)?|non|(?:north|south|east|west)(?:ern)?|central) /;

const isOnePlace = (name: string) => {
	const w = words(name);
	return PLACES.has(w) || PLACES.has(w.replace(PART_OF, '')) || STATE_CODES.has(name.trim());
};

// one place, or several joined: "UK & Europe", "US/Canada"
const isPlace = (tag: string) => {
	const names = tag.split(/[/&+]|\band\b/i);
	return names.every((name) => name.trim() && isOnePlace(name));
};

// when a company came in: a year, alone, after a word or before one ("2021",
// "Invested 2021", "Fall 2026", "2015 Vintage"), a span of years, a cohort or
// a batch by name, or a batch by Y Combinator's letter and year
const WHEN =
	/^(?:[a-z0-9]+ )?(?:19|20)\d\d(?: (?:19|20)?\d\d)?$|^(?:19|20)\d\d [a-z]+$|^(?:cohort|batch|class|vintage|wave|season)\b|^[swfx]\d\d$/;

// what became of it, or that nothing has yet
const STATUS =
	/^(?:exit(?:ed|s)?|notable exits|acquired(?: by .+)?|acquisitions?|merged(?: .+)?|ipos?(?: .+)?|listed(?: .+)?|public(?:ly listed| company)?|private|m a(?: pending)?|spac|trade sale|secondary sale|sold(?: .+)?|inactive|active|realized|realised|unrealized|unrealised|wind down|wound down|closed|shut down|defunct|bankrupt|rip|written off|write off|divested|unicorn|alumni|graduated|stealth|hasn t worked out)$|^(?:current|legacy|prior|previous|past|former|historical)\b/;

// how the fund holds it rather than what it does: one of its vehicles ("Fund
// II", "Network Fund", "Epoch III", "Syndicate"), or a programme of its own
const VEHICLE =
	/\b(?:funds?|syndicates?|spv|sidecar)\b|\b(?:ii|iii|iv|vi|vii|viii|ix|xi|xii)\b|^(?:core|prime|flagship|select|opportunit(?:y|ies)|incubat(?:ed|ion|or)|accelerat(?:ed|ion|or)|studio|scouts?|co invest(?:ment)?s?)$|\baccelerator$|^cdl\b/;
// ...or a vehicle by its letters and number: "GV-3", "GA 18"
const VEHICLE_CODE = /^[A-Z]{2,4}[- ]\d{1,2}$/;

// a label that says nothing about what the company does
const FILLER =
	/^(?:\d+|other|others|n a|na|none|misc|miscellaneous|unspecified|unknown|uncategorized|general|generalist|all|various|portfolio|investments?|compan(?:y|ies)|startups?|featured|spotlight|tbd)$|\bfounders?\b/;

// the stage a fund came in at, under one name for its spellings; "Seed+" and
// "Series A+" count with the round they extend
const STAGES: [RegExp, string][] = [
	[/^pre ?seed$/, 'Pre-seed'],
	[/^(?:global |series )?seed(?: stage| round| plus| extension)?$/, 'Seed'],
	[/^pre series a$/, 'Pre-Series A'],
	[/^series a$/, 'Series A'],
	[/^series b$/, 'Series B'],
	[/^series [c-k](?: .+)?$/, 'Series C or later'],
	[/^early(?: stage)?$/, 'Early stage'],
	[/^(?:growth|late|later)(?: stage| equity)?$/, 'Growth'],
	// a fund's own word for a stage, kept as it is
	[/^inception$/, 'Inception'],
	[/^angel$/, 'Angel'],
	[/^venture$/, 'Venture']
];
// "Invested Seed", "Led Series A": the stage is what follows
const CAME_IN = /^(?:invested|led|entered|entry)(?: at| in)? /;

// the same category under the different names the funds give it: each group
// is counted as one and shown under its first name
const SYNONYMS = new Map<string, string>();
const NAMED = new Map<string, string>();
for (const [name, ...others] of [
	[
		'AI',
		'Artificial Intelligence',
		'AI/ML',
		'ML/AI',
		'AI & Machine Learning',
		'Artificial Intelligence & Machine Learning',
		'Machine Learning & Artificial Intelligence',
		'Machine Learning',
		'ML'
	],
	['Healthcare', 'Health'],
	['Healthtech', 'Health Technology'],
	['Fintech', 'Financial Technology'],
	['Security', 'Cybersecurity', 'Cyber'],
	['Climate', 'Climate Tech', 'Climate Technology'],
	['SaaS', 'Software as a Service'],
	['IoT', 'Internet of Things'],
	['Developer Tools', 'DevTools'],
	['Biotech', 'Biotechnology'],
	['Medtech', 'Medical Technology'],
	['Insurtech', 'InsureTech'],
	['Proptech', 'Real Estate Tech', 'Real Estate Technology'],
	['AgTech', 'AgriTech']
]) {
	NAMED.set(keyOf(name), name);
	for (const other of others) SYNONYMS.set(keyOf(other), keyOf(name));
}

// two of Y Combinator's sub-industries hold a comma of their own and so
// arrive as two tags; they are put back together
const SPLIT = [
	['Engineering', 'Product and Design'],
	['Travel', 'Leisure and Tourism']
];

export interface Tags {
	// each sector once: the key its spellings share, and how this fund wrote it
	// (or the first name of its group of synonyms)
	categories: Map<string, string>;
	stages: Set<string>;
}

export function readTags(category: string): Tags {
	const tags = category
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean);
	for (const [head, tail] of SPLIT) {
		const at = tags.indexOf(head);
		if (at >= 0 && tags[at + 1] === tail) tags.splice(at, 2, `${head}, ${tail}`);
	}

	const categories = new Map<string, string>();
	const stages = new Set<string>();
	for (const tag of tags) {
		// a label that held a comma on the fund's page keeps its halves around a
		// slash ("San Francisco / CA", "B2B / SaaS"): a place in either makes
		// the whole of it one, and otherwise each half is a tag of its own
		const parts = tag
			.split(' / ')
			.map((p) => p.trim())
			.filter(Boolean);
		if (parts.some(isPlace)) continue;
		for (const written of parts) {
			// what a label spells out in brackets is the label again: "AI
			// (Artificial Intelligence)", "Pre-Seed (SEIS)"
			const part = written.replace(/\s*\([^)]*\)?\s*$/, '') || written;
			const w = words(part);
			if (w.length < 2 || isPlace(part)) continue;
			if (WHEN.test(w) || STATUS.test(w) || VEHICLE.test(w) || VEHICLE_CODE.test(part) || FILLER.test(w)) continue;
			const stage = STAGES.find(([pattern]) => pattern.test(w.replace(CAME_IN, '')))?.[1];
			if (stage) {
				stages.add(stage);
				continue;
			}
			const key = SYNONYMS.get(keyOf(part)) ?? keyOf(part);
			if (!categories.has(key)) categories.set(key, NAMED.get(key) ?? part);
		}
	}
	return { categories, stages };
}
