// The 35 tracked funds. Slugs match the scraper module filenames in
// src/server/scrapers/; display names come from scrapa/all.json (with the
// "General Catalys" typo fixed and Octopus Ventures added). url is the fund's
// public portfolio page (for the API-based scrapers it's the human-facing
// equivalent of the scraped endpoint).
export interface FundInfo {
	slug: string;
	name: string;
	url: string;
}

export const FUNDS: FundInfo[] = [
	{ slug: '01a', name: '01A', url: 'https://01a.com/portfolio' },
	{ slug: 'acapital', name: 'A Capital', url: 'https://acapital.com/portfolio' },
	{ slug: 'advent', name: 'Advent International', url: 'https://www.adventinternational.com/investments/' },
	{ slug: 'aisling', name: 'Aisling Capital', url: 'https://www.aislingcapital.com/portfolio' },
	{ slug: 'alumni', name: 'Alumni Ventures', url: 'https://www.av.vc/portfolio' },
	{ slug: 'a16z', name: 'Andreessen Horowitz', url: 'https://a16z.com/portfolio/' },
	{ slug: 'antler', name: 'Antler', url: 'https://www.antler.co/portfolio' },
	{ slug: 'atlas', name: 'Atlas Venture', url: 'https://atlasventure.com/portfolio/' },
	{ slug: 'av8', name: 'AV8', url: 'https://av8.vc/our-portfolio/' },
	{ slug: 'avp', name: 'AVP', url: 'https://avpcap.com/companies/' },
	{ slug: 'baincapital', name: 'Bain Capital Ventures', url: 'https://baincapitalventures.com/portfolio/' },
	{ slug: 'base10', name: 'Base10', url: 'https://base10.vc/' },
	{ slug: 'battery', name: 'Battery Ventures', url: 'https://www.battery.com/company/' },
	{ slug: 'bessemer', name: 'Bessemer Venture Partners', url: 'https://www.bvp.com/companies' },
	{ slug: 'boxgroup', name: 'BoxGroup', url: 'https://www.boxgroup.com/portfolio' },
	{ slug: 'draper', name: 'Draper Associates', url: 'https://www.draper.vc/portfolio' },
	{ slug: 'eclipse', name: 'Eclipse Ventures', url: 'https://eclipse.capital/portfolio/' },
	{ slug: 'filrouge', name: 'Fil Rouge Capital', url: 'https://www.filrougecapital.com/portfolio' },
	{ slug: 'flagship', name: 'Flagship Pioneering', url: 'https://www.flagshippioneering.com/companies' },
	{ slug: 'fly', name: 'Fly', url: 'https://fly.vc/portfolio' },
	{ slug: 'flybridge', name: 'Flybridge', url: 'https://www.flybridge.com/portfolio' },
	{ slug: 'generalcatalyst', name: 'General Catalyst', url: 'https://www.generalcatalyst.com/portfolio' },
	{ slug: 'glasswing', name: 'Glasswing Ventures', url: 'https://glasswing.vc/our-companies/' },
	{ slug: 'greycroft', name: 'Greycroft', url: 'https://www.greycroft.com/portfolio/' },
	{ slug: 'headline', name: 'Headline', url: 'https://headline.com/portfolio' },
	{ slug: 'hvcapital', name: 'HV Capital', url: 'https://www.hvcapital.com/portfolio' },
	{ slug: 'indexventures', name: 'Index Ventures', url: 'https://www.indexventures.com/companies/backed/all/' },
	{ slug: 'indiebio', name: 'Indie Bio', url: 'https://indiebio.co/' },
	{ slug: 'innovestor', name: 'Innovestor', url: 'https://innovestorgroup.com/venture-capital/portfolio-companies/' },
	{ slug: 'inovia', name: 'Inovia Capital', url: 'https://www.inovia.vc/active-companies' },
	{ slug: 'insight', name: 'Insight Partners', url: 'https://www.insightpartners.com/portfolio/' },
	{ slug: 'kima', name: 'Kima Ventures', url: 'https://www.kimaventures.com/portfolio' },
	{ slug: 'kleiner', name: 'Kleiner Perkins', url: 'https://jobs.kleinerperkins.com/companies' },
	{ slug: 'kurma', name: 'Kurma Partners', url: 'https://www.kurmapartners.com/en/portfolio' },
	{ slug: 'lightspeed', name: 'Lightspeed Ventures', url: 'https://lsvp.com/companies/' },
	{ slug: 'menlo', name: 'Menlo Ventures', url: 'https://menlovc.com/portfolio/' },
	{ slug: 'mig', name: 'MIG Capital', url: 'https://www.mig.ag/en/portfolio/' },
	{ slug: 'mouro', name: 'Mouro Capital', url: 'https://www.mourocapital.com/our-portfolio/' },
	{ slug: 'nexus', name: 'Nexus Venture Partners', url: 'https://nexusvp.com/companies/' },
	{ slug: 'norwest', name: 'Norwest', url: 'https://www.norwest.com/companies' },
	{ slug: 'octopus', name: 'Octopus Ventures', url: 'https://octopusventures.com/portfolio/' },
	{ slug: 'otb', name: 'OTB Ventures', url: 'https://otb.vc/portfolio/' },
	{ slug: 'pear', name: 'Pear VC', url: 'https://pear.vc/companies/' },
	{ slug: 'pillar', name: 'Pillar VC', url: 'https://www.pillar.vc/companies/' },
	{ slug: 'plugandplay', name: 'Plug and Play', url: 'https://www.plugandplaytechcenter.com/innovation-services/startups/our-startups' },
	{ slug: 'polaris', name: 'Polaris Partners', url: 'https://polarispartners.com/companies-list' },
	{ slug: 'quantonation', name: 'Quantonation', url: 'https://www.quantonation.com/portfolio/' },
	{ slug: 'racap', name: 'RA Capital', url: 'https://www.racap.com/portfolio' },
	{ slug: 'recall', name: 'Recall Capital', url: 'https://www.recall.capital/portfolio' },
	{ slug: 'redpoint', name: 'Redpoint', url: 'https://www.redpoint.com/companies/' },
	{ slug: 'salesforce', name: 'Salesforce Ventures', url: 'https://salesforceventures.com/portfolio/' },
	{ slug: 'sapphire', name: 'Sapphire Ventures', url: 'https://sapphireventures.com/companies/' },
	{ slug: 'seedcamp', name: 'Seedcamp', url: 'https://seedcamp.com/our-companies/' },
	{ slug: 'sequoia', name: 'Sequoia Capital', url: 'https://www.sequoiacap.com/our-companies/' },
	{ slug: 'silversmith', name: 'Silversmith', url: 'https://www.silversmith.com/portfolio' },
	{ slug: 'slow', name: 'Slow Ventures', url: 'https://slow.co/about/' },
	{ slug: 'sosv', name: 'SOSV', url: 'https://sosv.com/portfolio/' },
	{ slug: 'spark', name: 'Spark Capital', url: 'https://www.sparkcapital.com/companies' },
	{ slug: 'superhero', name: 'Superhero', url: 'https://superherocapital.com/portfolio/' },
	{ slug: 'techstars', name: 'Techstars', url: 'https://www.techstars.com/portfolio' },
	{ slug: 'thomabravo', name: 'Thoma Bravo', url: 'https://www.thomabravo.com/portfolio' },
	{ slug: 'townhall', name: 'Town Hall Ventures', url: 'https://www.townhallventures.com/portfolio' },
	{ slug: 'transformation', name: 'Transformation Capital', url: 'https://transformcap.com/partner-companies' },
	{ slug: 'venrock', name: 'Venrock', url: 'https://www.venrock.com/companies/' },
	{ slug: 'xyz', name: 'XYZ', url: 'https://www.xyz.vc/portfolio' },
	{ slug: 'ycombinator', name: 'Y Combinator', url: 'https://www.ycombinator.com/companies' }
];

export const fundName = new Map(FUNDS.map((f) => [f.slug, f.name]));
export const fundBySlug = new Map(FUNDS.map((f) => [f.slug, f]));
