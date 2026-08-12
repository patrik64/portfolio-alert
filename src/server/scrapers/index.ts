import { FUNDS } from '../../shared/funds';
import type { ScrapedCompany } from './types';
// these slugs lead with a digit, so the bindings can't be named after them
import { scrape as zeroonea } from './01a';
import { scrape as threevc } from './3vc';
import { scrape as a16z } from './a16z';
import { scrape as acapital } from './acapital';
import { scrape as advent } from './advent';
import { scrape as aisling } from './aisling';
import { scrape as alumni } from './alumni';
import { scrape as antler } from './antler';
import { scrape as atlas } from './atlas';
import { scrape as av8 } from './av8';
import { scrape as avp } from './avp';
import { scrape as baincapital } from './baincapital';
import { scrape as base10 } from './base10';
import { scrape as battery } from './battery';
import { scrape as bessemer } from './bessemer';
import { scrape as blume } from './blume';
import { scrape as boxgroup } from './boxgroup';
import { scrape as draper } from './draper';
import { scrape as eclipse } from './eclipse';
import { scrape as filrouge } from './filrouge';
import { scrape as flagship } from './flagship';
import { scrape as fly } from './fly';
import { scrape as flybridge } from './flybridge';
import { scrape as generalcatalyst } from './generalcatalyst';
import { scrape as glasswing } from './glasswing';
import { scrape as greycroft } from './greycroft';
import { scrape as headline } from './headline';
import { scrape as hvcapital } from './hvcapital';
import { scrape as indexventures } from './indexventures';
import { scrape as indiebio } from './indiebio';
import { scrape as innovestor } from './innovestor';
import { scrape as inovia } from './inovia';
import { scrape as insight } from './insight';
import { scrape as kima } from './kima';
import { scrape as kleiner } from './kleiner';
import { scrape as kurma } from './kurma';
import { scrape as lightspeed } from './lightspeed';
import { scrape as menlo } from './menlo';
import { scrape as mig } from './mig';
import { scrape as mouro } from './mouro';
import { scrape as nexus } from './nexus';
import { scrape as norwest } from './norwest';
import { scrape as octopus } from './octopus';
import { scrape as otb } from './otb';
import { scrape as pear } from './pear';
import { scrape as pillar } from './pillar';
import { scrape as plugandplay } from './plugandplay';
import { scrape as polaris } from './polaris';
import { scrape as quantonation } from './quantonation';
import { scrape as racap } from './racap';
import { scrape as recall } from './recall';
import { scrape as redpoint } from './redpoint';
import { scrape as salesforce } from './salesforce';
import { scrape as sapphire } from './sapphire';
import { scrape as seedcamp } from './seedcamp';
import { scrape as sequoia } from './sequoia';
import { scrape as silversmith } from './silversmith';
import { scrape as slow } from './slow';
import { scrape as sosv } from './sosv';
import { scrape as spark } from './spark';
import { scrape as speedinvest } from './speedinvest';
import { scrape as superhero } from './superhero';
import { scrape as techstars } from './techstars';
import { scrape as thomabravo } from './thomabravo';
import { scrape as townhall } from './townhall';
import { scrape as transformation } from './transformation';
import { scrape as venrock } from './venrock';
import { scrape as xyz } from './xyz';
import { scrape as ycombinator } from './ycombinator';

const impls: Record<string, () => Promise<ScrapedCompany[]>> = {
	'01a': zeroonea,
	'3vc': threevc,
	a16z,
	acapital,
	advent,
	aisling,
	alumni,
	antler,
	atlas,
	av8,
	avp,
	baincapital,
	base10,
	battery,
	bessemer,
	blume,
	boxgroup,
	draper,
	eclipse,
	filrouge,
	flagship,
	fly,
	flybridge,
	generalcatalyst,
	glasswing,
	greycroft,
	headline,
	hvcapital,
	indexventures,
	indiebio,
	innovestor,
	inovia,
	insight,
	kima,
	kleiner,
	kurma,
	lightspeed,
	menlo,
	mig,
	mouro,
	nexus,
	norwest,
	octopus,
	otb,
	pear,
	pillar,
	plugandplay,
	polaris,
	quantonation,
	racap,
	recall,
	redpoint,
	salesforce,
	sapphire,
	seedcamp,
	sequoia,
	silversmith,
	slow,
	sosv,
	spark,
	speedinvest,
	superhero,
	techstars,
	thomabravo,
	townhall,
	transformation,
	venrock,
	xyz,
	ycombinator
};

if (Object.keys(impls).length !== FUNDS.length || FUNDS.some((f) => !impls[f.slug]))
	throw new Error('scraper registry and shared FUNDS list are out of sync');

export const scrapers = FUNDS.map((f) => ({ ...f, scrape: impls[f.slug] }));
export const scraperBySlug = new Map(scrapers.map((s) => [s.slug, s]));
export type { ScrapedCompany } from './types';
