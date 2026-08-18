import { FUNDS } from '../../shared/funds';
import type { ScrapedCompany } from './types';
// these slugs lead with a digit, so the bindings can't be named after them
import { scrape as zeroonea } from './01a';
import { scrape as twentyonefifty } from './twentyonefifty';
import { scrape as threevc } from './3vc';
import { scrape as fivehundred } from './fivehundred';
import { scrape as sevenpercent } from './sevenpercent';
import { scrape as eightythreenorth } from './eightythreenorth';
import { scrape as a16z } from './a16z';
import { scrape as acapital } from './acapital';
import { scrape as accel } from './accel';
import { scrape as advent } from './advent';
import { scrape as aisling } from './aisling';
import { scrape as alchemist } from './alchemist';
import { scrape as aleph } from './aleph';
import { scrape as alumni } from './alumni';
import { scrape as antler } from './antler';
import { scrape as apex } from './apex';
import { scrape as archventure } from './archventure';
import { scrape as atomico } from './atomico';
import { scrape as atlas } from './atlas';
import { scrape as av8 } from './av8';
import { scrape as avp } from './avp';
import { scrape as aws } from './aws';
import { scrape as baincapital } from './baincapital';
import { scrape as balderton } from './balderton';
import { scrape as b2venture } from './b2venture';
import { scrape as base10 } from './base10';
import { scrape as battery } from './battery';
import { scrape as behold } from './behold';
import { scrape as bessemer } from './bessemer';
import { scrape as bluventures } from './bluventures';
import { scrape as blume } from './blume';
import { scrape as broocknell } from './broocknell';
import { scrape as calmstorm } from './calmstorm';
import { scrape as canapi } from './canapi';
import { scrape as congruent } from './congruent';
import { scrape as boxgroup } from './boxgroup';
import { scrape as craft } from './craft';
import { scrape as credo } from './credo';
import { scrape as creandum } from './creandum';
import { scrape as dcvc } from './dcvc';
import { scrape as draper } from './draper';
import { scrape as earlybird } from './earlybird';
import { scrape as eclipse } from './eclipse';
import { scrape as ef } from './ef';
import { scrape as episode1 } from './episode1';
import { scrape as eqt } from './eqt';
import { scrape as felicis } from './felicis';
import { scrape as filrouge } from './filrouge';
import { scrape as firstround } from './firstround';
import { scrape as flagship } from './flagship';
import { scrape as foundersfund } from './foundersfund';
import { scrape as fly } from './fly';
import { scrape as flybridge } from './flybridge';
import { scrape as g2 } from './g2';
import { scrape as gv } from './gv';
import { scrape as generalatlantic } from './generalatlantic';
import { scrape as generalcatalyst } from './generalcatalyst';
import { scrape as gigascale } from './gigascale';
import { scrape as glasswing } from './glasswing';
import { scrape as greycroft } from './greycroft';
import { scrape as greylock } from './greylock';
import { scrape as headline } from './headline';
import { scrape as htgf } from './htgf';
import { scrape as hvcapital } from './hvcapital';
import { scrape as indexventures } from './indexventures';
import { scrape as indiebio } from './indiebio';
import { scrape as industrifonden } from './industrifonden';
import { scrape as initialized } from './initialized';
import { scrape as innovestor } from './innovestor';
import { scrape as inovia } from './inovia';
import { scrape as insight } from './insight';
import { scrape as invus } from './invus';
import { scrape as ivp } from './ivp';
import { scrape as khosla } from './khosla';
import { scrape as kima } from './kima';
import { scrape as kleiner } from './kleiner';
import { scrape as kinnevik } from './kinnevik';
import { scrape as kurma } from './kurma';
import { scrape as lakestar } from './lakestar';
import { scrape as lifeline } from './lifeline';
import { scrape as lightspeed } from './lightspeed';
import { scrape as menlo } from './menlo';
import { scrape as mig } from './mig';
import { scrape as mouro } from './mouro';
import { scrape as nea } from './nea';
import { scrape as nexus } from './nexus';
import { scrape as northzone } from './northzone';
import { scrape as norwest } from './norwest';
import { scrape as octopus } from './octopus';
import { scrape as oneequity } from './oneequity';
import { scrape as openocean } from './openocean';
import { scrape as otb } from './otb';
import { scrape as palladium } from './palladium';
import { scrape as pear } from './pear';
import { scrape as pillar } from './pillar';
import { scrape as plugandplay } from './plugandplay';
import { scrape as pointnine } from './pointnine';
import { scrape as polaris } from './polaris';
import { scrape as prelude } from './prelude';
import { scrape as push } from './push';
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
import { scrape as southparkcommons } from './southparkcommons';
import { scrape as spark } from './spark';
import { scrape as speedinvest } from './speedinvest';
import { scrape as standardindustries } from './standardindustries';
import { scrape as superhero } from './superhero';
import { scrape as targetglobal } from './targetglobal';
import { scrape as techstars } from './techstars';
import { scrape as thomabravo } from './thomabravo';
import { scrape as townhall } from './townhall';
import { scrape as trianglepeak } from './trianglepeak';
import { scrape as transformation } from './transformation';
import { scrape as usv } from './usv';
import { scrape as venrock } from './venrock';
import { scrape as viking } from './viking';
import { scrape as wellington } from './wellington';
import { scrape as xyz } from './xyz';
import { scrape as ycombinator } from './ycombinator';
import { scrape as zcg } from './zcg';

const impls: Record<string, () => Promise<ScrapedCompany[]>> = {
	'01a': zeroonea,
	'2150': twentyonefifty,
	'3vc': threevc,
	'500': fivehundred,
	'7percent': sevenpercent,
	'83north': eightythreenorth,
	a16z,
	acapital,
	accel,
	advent,
	aisling,
	alchemist,
	aleph,
	alumni,
	antler,
	apex,
	archventure,
	atomico,
	atlas,
	av8,
	avp,
	aws,
	baincapital,
	balderton,
	b2venture,
	base10,
	battery,
	behold,
	bessemer,
	bluventures,
	blume,
	broocknell,
	calmstorm,
	canapi,
	congruent,
	boxgroup,
	craft,
	credo,
	creandum,
	dcvc,
	draper,
	earlybird,
	eclipse,
	ef,
	episode1,
	eqt,
	felicis,
	filrouge,
	firstround,
	flagship,
	foundersfund,
	fly,
	flybridge,
	g2,
	gv,
	generalatlantic,
	generalcatalyst,
	gigascale,
	glasswing,
	greycroft,
	greylock,
	headline,
	htgf,
	hvcapital,
	indexventures,
	indiebio,
	industrifonden,
	initialized,
	innovestor,
	inovia,
	insight,
	invus,
	ivp,
	khosla,
	kima,
	kleiner,
	kinnevik,
	kurma,
	lakestar,
	lifeline,
	lightspeed,
	menlo,
	mig,
	mouro,
	nea,
	nexus,
	northzone,
	norwest,
	octopus,
	oneequity,
	openocean,
	otb,
	palladium,
	pear,
	pillar,
	plugandplay,
	pointnine,
	polaris,
	prelude,
	push,
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
	southparkcommons,
	spark,
	speedinvest,
	standardindustries,
	superhero,
	targetglobal,
	techstars,
	thomabravo,
	townhall,
	trianglepeak,
	transformation,
	usv,
	venrock,
	viking,
	wellington,
	xyz,
	ycombinator,
	zcg
};

if (Object.keys(impls).length !== FUNDS.length || FUNDS.some((f) => !impls[f.slug]))
	throw new Error('scraper registry and shared FUNDS list are out of sync');

export const scrapers = FUNDS.map((f) => ({ ...f, scrape: impls[f.slug] }));
export const scraperBySlug = new Map(scrapers.map((s) => [s.slug, s]));
export type { ScrapedCompany } from './types';
