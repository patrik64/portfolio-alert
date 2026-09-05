import { FUNDS } from '../../shared/funds';
import type { ScrapedCompany } from './types';
// these slugs lead with a digit, so the bindings can't be named after them
import { scrape as zeroonea } from './01a';
import { scrape as tend } from './10d';
import { scrape as twentyvc } from './twentyvc';
import { scrape as twentyonefifty } from './twentyonefifty';
import { scrape as threevc } from './3vc';
import { scrape as fivehundred } from './fivehundred';
import { scrape as sevenpercent } from './sevenpercent';
import { scrape as eightythreenorth } from './eightythreenorth';
import { scrape as a16z } from './a16z';
import { scrape as acapital } from './acapital';
import { scrape as accel } from './accel';
import { scrape as advent } from './advent';
import { scrape as airbusventures } from './airbusventures';
import { scrape as aisling } from './aisling';
import { scrape as alchemist } from './alchemist';
import { scrape as aleph } from './aleph';
import { scrape as alumni } from './alumni';
import { scrape as ambition } from './ambition';
import { scrape as antler } from './antler';
import { scrape as apex } from './apex';
import { scrape as archventure } from './archventure';
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
import { scrape as bip } from './bip';
import { scrape as bluventures } from './bluventures';
import { scrape as blume } from './blume';
import { scrape as breakthrough } from './breakthrough';
import { scrape as broocknell } from './broocknell';
import { scrape as calmstorm } from './calmstorm';
import { scrape as canapi } from './canapi';
import { scrape as cherry } from './cherry';
import { scrape as congruent } from './congruent';
import { scrape as boxgroup } from './boxgroup';
import { scrape as craft } from './craft';
import { scrape as credo } from './credo';
import { scrape as creandum } from './creandum';
import { scrape as cyberstarts } from './cyberstarts';
import { scrape as dcvc } from './dcvc';
import { scrape as draper } from './draper';
import { scrape as e14 } from './e14';
import { scrape as earlybird } from './earlybird';
import { scrape as eclipse } from './eclipse';
import { scrape as entree } from './entree';
import { scrape as ef } from './ef';
import { scrape as episode1 } from './episode1';
import { scrape as eqt } from './eqt';
import { scrape as f2 } from './f2';
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
import { scrape as glilot } from './glilot';
import { scrape as greycroft } from './greycroft';
import { scrape as greylock } from './greylock';
import { scrape as grove } from './grove';
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
import { scrape as lux } from './lux';
import { scrape as m12 } from './m12';
import { scrape as m13 } from './m13';
import { scrape as m1c } from './m1c';
import { scrape as mac } from './mac';
import { scrape as magic } from './magic';
import { scrape as mainsequence } from './mainsequence';
import { scrape as makers } from './makers';
import { scrape as mana } from './mana';
import { scrape as mango } from './mango';
import { scrape as mantis } from './mantis';
import { scrape as maple } from './maple';
import { scrape as massive } from './massive';
import { scrape as massmutual } from './massmutual';
import { scrape as material } from './material';
import { scrape as matrix } from './matrix';
import { scrape as maverick } from './maverick';
import { scrape as maveron } from './maveron';
import { scrape as mayfield } from './mayfield';
import { scrape as mcj } from './mcj';
import { scrape as mmv } from './mmv';
import { scrape as mendoza } from './mendoza';
import { scrape as menlo } from './menlo';
import { scrape as mercuri } from './mercuri';
import { scrape as msc } from './msc';
import { scrape as meron } from './meron';
import { scrape as merus } from './merus';
import { scrape as metaplanet } from './metaplanet';
import { scrape as metaprop } from './metaprop';
import { scrape as mfv } from './mfv';
import { scrape as mhs } from './mhs';
import { scrape as mig } from './mig';
import { scrape as mmc } from './mmc';
import { scrape as mizmaa } from './mizmaa';
import { scrape as moderne } from './moderne';
import { scrape as monashees } from './monashees';
import { scrape as moneta } from './moneta';
import { scrape as moonshots } from './moonshots';
import { scrape as morpheus } from './morpheus';
import { scrape as mosaic } from './mosaic';
import { scrape as mouro } from './mouro';
import { scrape as moxxie } from './moxxie';
import { scrape as mubadala } from './mubadala';
import { scrape as mucker } from './mucker';
import { scrape as munichre } from './munichre';
import { scrape as muse } from './muse';
import { scrape as musha } from './musha';
import { scrape as ngpartners } from './ngpartners';
import { scrape as ndcapital } from './ndcapital';
import { scrape as nea } from './nea';
import { scrape as necessary } from './necessary';
import { scrape as neotribe } from './neotribe';
import { scrape as newmarkets } from './newmarkets';
import { scrape as newstack } from './newstack';
import { scrape as newfund } from './newfund';
import { scrape as nextfrontier } from './nextfrontier';
import { scrape as nextplay } from './nextplay';
import { scrape as nextview } from './nextview';
import { scrape as nexus } from './nexus';
import { scrape as nfx } from './nfx';
import { scrape as night } from './night';
import { scrape as nlc } from './nlc';
import { scrape as node } from './node';
import { scrape as noemis } from './noemis';
import { scrape as norrsken } from './norrsken';
import { scrape as northerngritstone } from './northerngritstone';
import { scrape as northpond } from './northpond';
import { scrape as northstar } from './northstar';
import { scrape as northzone } from './northzone';
import { scrape as norwest } from './norwest';
import { scrape as notation } from './notation';
import { scrape as nphard } from './nphard';
import { scrape as nucleus } from './nucleus';
import { scrape as nuwa } from './nuwa';
import { scrape as nxtp } from './nxtp';
import { scrape as nyca } from './nyca';
import { scrape as obvious } from './obvious';
import { scrape as oca } from './oca';
import { scrape as oceanazul } from './oceanazul';
import { scrape as octopus } from './octopus';
import { scrape as offline } from './offline';
import { scrape as okapi } from './okapi';
import { scrape as omers } from './omers';
import { scrape as omnivore } from './omnivore';
import { scrape as oneway } from './oneway';
import { scrape as oneequity } from './oneequity';
import { scrape as onevc } from './onevc';
import { scrape as openocean } from './openocean';
import { scrape as operator } from './operator';
import { scrape as orbimed } from './orbimed';
import { scrape as origin } from './origin';
import { scrape as origins } from './origins';
import { scrape as oss } from './oss';
import { scrape as otb } from './otb';
import { scrape as ourcrowd } from './ourcrowd';
import { scrape as outlander } from './outlander';
import { scrape as outsiders } from './outsiders';
import { scrape as overkill } from './overkill';
import { scrape as overlook } from './overlook';
import { scrape as overture } from './overture';
import { scrape as overwater } from './overwater';
import { scrape as ovni } from './ovni';
import { scrape as owl } from './owl';
import { scrape as p1 } from './p1';
import { scrape as paladin } from './paladin';
import { scrape as palladium } from './palladium';
import { scrape as palmdrive } from './palmdrive';
import { scrape as panache } from './panache';
import { scrape as pangaea } from './pangaea';
import { scrape as pantera } from './pantera';
import { scrape as pareto } from './pareto';
import { scrape as parkwalk } from './parkwalk';
import { scrape as partech } from './partech';
import { scrape as pathbreaker } from './pathbreaker';
import { scrape as patron } from './patron';
import { scrape as peakbridge } from './peakbridge';
import { scrape as pear } from './pear';
import { scrape as pebblebed } from './pebblebed';
import { scrape as picksandshovels } from './picksandshovels';
import { scrape as picus } from './picus';
import { scrape as pillar } from './pillar';
import { scrape as pioneer } from './pioneer';
import { scrape as pitango } from './pitango';
import { scrape as playground } from './playground';
import { scrape as plg } from './plg';
import { scrape as plugandplay } from './plugandplay';
import { scrape as plumalley } from './plumalley';
import { scrape as plural } from './plural';
import { scrape as pointnine } from './pointnine';
import { scrape as p72 } from './p72';
import { scrape as polaris } from './polaris';
import { scrape as prelude } from './prelude';
import { scrape as powerhouse } from './powerhouse';
import { scrape as precursor } from './precursor';
import { scrape as presence } from './presence';
import { scrape as primary } from './primary';
import { scrape as primeimpact } from './primeimpact';
import { scrape as primemovers } from './primemovers';
import { scrape as primetime } from './primetime';
import { scrape as propeller } from './propeller';
import { scrape as psv } from './psv';
import { scrape as push } from './push';
import { scrape as qed } from './qed';
import { scrape as qualcomm } from './qualcomm';
import { scrape as quantonation } from './quantonation';
import { scrape as quest } from './quest';
import { scrape as quiet } from './quiet';
import { scrape as qumra } from './qumra';
import { scrape as quona } from './quona';
import { scrape as race } from './race';
import { scrape as r7 } from './r7';
import { scrape as racap } from './racap';
import { scrape as radian } from './radian';
import { scrape as radical } from './radical';
import { scrape as radius } from './radius';
import { scrape as rainfall } from './rainfall';
import { scrape as rally } from './rally';
import { scrape as rarebreed } from './rarebreed';
import { scrape as reach } from './reach';
import { scrape as recall } from './recall';
import { scrape as redpoint } from './redpoint';
import { scrape as recvc } from './recvc';
import { scrape as recursive } from './recursive';
import { scrape as redbear } from './redbear';
import { scrape as redbud } from './redbud';
import { scrape as redsea } from './redsea';
import { scrape as redswan } from './redswan';
import { scrape as refashiond } from './refashiond';
import { scrape as relay } from './relay';
import { scrape as renegade } from './renegade';
import { scrape as renewal } from './renewal';
import { scrape as resolute } from './resolute';
import { scrape as restive } from './restive';
import { scrape as ret } from './ret';
import { scrape as ribbit } from './ribbit';
import { scrape as riot } from './riot';
import { scrape as riverpark } from './riverpark';
import { scrape as roble } from './roble';
import { scrape as rockhealth } from './rockhealth';
import { scrape as rockies } from './rockies';
import { scrape as rogue } from './rogue';
import { scrape as rootvc } from './rootvc';
import { scrape as rre } from './rre';
import { scrape as rtp } from './rtp';
import { scrape as salesforce } from './salesforce';
import { scrape as sapphire } from './sapphire';
import { scrape as seedcamp } from './seedcamp';
import { scrape as sequoia } from './sequoia';
import { scrape as s2g } from './s2g';
import { scrape as s3vc } from './s3vc';
import { scrape as saasvc } from './saasvc';
import { scrape as salt } from './salt';
import { scrape as sante } from './sante';
import { scrape as schematic } from './schematic';
import { scrape as scifi } from './scifi';
import { scrape as scifounders } from './scifounders';
import { scrape as scout } from './scout';
import { scrape as seedcapital } from './seedcapital';
import { scrape as sentiero } from './sentiero';
import { scrape as seraphim } from './seraphim';
import { scrape as serena } from './serena';
import { scrape as sevensevensix } from './sevensevensix';
import { scrape as shield } from './shield';
import { scrape as shima } from './shima';
import { scrape as shine } from './shine';
import { scrape as shrug } from './shrug';
import { scrape as sierra } from './sierra';
import { scrape as sigmaprime } from './sigmaprime';
import { scrape as signalfire } from './signalfire';
import { scrape as silentvc } from './silentvc';
import { scrape as silversmith } from './silversmith';
import { scrape as sixthirty } from './sixthirty';
import { scrape as sixty8 } from './sixty8';
import { scrape as slow } from './slow';
import { scrape as socialleverage } from './socialleverage';
import { scrape as sofinnova } from './sofinnova';
import { scrape as sogal } from './sogal';
import { scrape as soma } from './soma';
import { scrape as sosv } from './sosv';
import { scrape as southparkcommons } from './southparkcommons';
import { scrape as spacecadet } from './spacecadet';
import { scrape as spark } from './spark';
import { scrape as speedinvest } from './speedinvest';
import { scrape as stageone } from './stageone';
import { scrape as standardindustries } from './standardindustries';
import { scrape as stripes } from './stripes';
import { scrape as spice } from './spice';
import { scrape as springtime } from './springtime';
import { scrape as sprout } from './sprout';
import { scrape as startingline } from './startingline';
import { scrape as story } from './story';
import { scrape as stoutstreet } from './stoutstreet';
import { scrape as straydog } from './straydog';
import { scrape as streamlined } from './streamlined';
import { scrape as strive } from './strive';
import { scrape as strongvc } from './strongvc';
import { scrape as struck } from './struck';
import { scrape as sugar } from './sugar';
import { scrape as superangel } from './superangel';
import { scrape as superhero } from './superhero';
import { scrape as supermoon } from './supermoon';
import { scrape as supernode } from './supernode';
import { scrape as supernova } from './supernova';
import { scrape as supplychange } from './supplychange';
import { scrape as svangel } from './svangel';
import { scrape as systemiq } from './systemiq';
import { scrape as targetglobal } from './targetglobal';
import { scrape as ten13 } from './ten13';
import { scrape as telluride } from './telluride';
import { scrape as teneleven } from './teneleven';
import { scrape as tenoneten } from './tenoneten';
import { scrape as tau } from './tau';
import { scrape as tcg } from './tcg';
import { scrape as tcv } from './tcv';
import { scrape as team8 } from './team8';
import { scrape as techstars } from './techstars';
import { scrape as artemis } from './artemis';
import { scrape as council } from './council';
import { scrape as footprint } from './footprint';
import { scrape as helm } from './helm';
import { scrape as longevity } from './longevity';
import { scrape as venturecity } from './venturecity';
import { scrape as tvc } from './tvc';
import { scrape as thirdprime } from './thirdprime';
import { scrape as thirdrock } from './thirdrock';
import { scrape as thirdsphere } from './thirdsphere';
import { scrape as thomabravo } from './thomabravo';
import { scrape as timon } from './timon';
import { scrape as tlv } from './tlv';
import { scrape as tmv } from './tmv';
import { scrape as tnbaura } from './tnbaura';
import { scrape as toba } from './toba';
import { scrape as toyota } from './toyota';
import { scrape as townhall } from './townhall';
import { scrape as trianglepeak } from './trianglepeak';
import { scrape as transformation } from './transformation';
import { scrape as uncork } from './uncork';
import { scrape as trailhead } from './trailhead';
import { scrape as transition } from './transition';
import { scrape as triatomic } from './triatomic';
import { scrape as tribecap } from './tribecap';
import { scrape as tribecavp } from './tribecavp';
import { scrape as trousdale } from './trousdale';
import { scrape as trueventures } from './trueventures';
import { scrape as truewealth } from './truewealth';
import { scrape as tsvc } from './tsvc';
import { scrape as tusk } from './tusk';
import { scrape as twelvebelow } from './twelvebelow';
import { scrape as twentytwo } from './twentytwo';
import { scrape as twine } from './twine';
import { scrape as typeone } from './typeone';
import { scrape as ulu } from './ulu';
import { scrape as underline } from './underline';
import { scrape as undeterred } from './undeterred';
import { scrape as unicornindia } from './unicornindia';
import { scrape as uniseed } from './uniseed';
import { scrape as unshackled } from './unshackled';
import { scrape as untapped } from './untapped';
import { scrape as unusual } from './unusual';
import { scrape as upfront } from './upfront';
import { scrape as uphonest } from './uphonest';
import { scrape as uppartners } from './uppartners';
import { scrape as upper90 } from './upper90';
import { scrape as upslope } from './upslope';
import { scrape as urban } from './urban';
import { scrape as usv } from './usv';
import { scrape as v1vc } from './v1vc';
import { scrape as valar } from './valar';
import { scrape as valia } from './valia';
import { scrape as valorcapitalgroup } from './valorcapitalgroup';
import { scrape as valorventures } from './valorventures';
import { scrape as vamosventures } from './vamosventures';
import { scrape as vanedge } from './vanedge';
import { scrape as variant } from './variant';
import { scrape as vastvc } from './vastvc';
import { scrape as vendep } from './vendep';
import { scrape as venrock } from './venrock';
import { scrape as venturefriends } from './venturefriends';
import { scrape as venturesplatform } from './venturesplatform';
import { scrape as venturesouq } from './venturesouq';
import { scrape as vertex } from './vertex';
import { scrape as vestigo } from './vestigo';
import { scrape as vibevc } from './vibevc';
import { scrape as viking } from './viking';
import { scrape as villageglobal } from './villageglobal';
import { scrape as vineventures } from './vineventures';
import { scrape as viola } from './viola';
import { scrape as vireo } from './vireo';
import { scrape as virtuevc } from './virtuevc';
import { scrape as visiblehands } from './visiblehands';
import { scrape as visibleventures } from './visibleventures';
import { scrape as voimaventures } from './voimaventures';
import { scrape as voloearth } from './voloearth';
import { scrape as voyagervc } from './voyagervc';
import { scrape as vtfcapital } from './vtfcapital';
import { scrape as vuventurepartners } from './vuventurepartners';
import { scrape as watertower } from './watertower';
import { scrape as wavemaker360 } from './wavemaker360';
import { scrape as waverley } from './waverley';
import { scrape as wellington } from './wellington';
import { scrape as willowgrowth } from './willowgrowth';
import { scrape as windham } from './windham';
import { scrape as wing } from './wing';
import { scrape as wireframe } from './wireframe';
import { scrape as wischoff } from './wischoff';
import { scrape as wndr } from './wndr';
import { scrape as wondervc } from './wondervc';
import { scrape as workbench } from './workbench';
import { scrape as worklife } from './worklife';
import { scrape as worldfund } from './worldfund';
import { scrape as wvvcapital } from './wvvcapital';
import { scrape as wxrfund } from './wxrfund';
import { scrape as xange } from './xange';
import { scrape as xfactorventures } from './xfactorventures';
import { scrape as xfund } from './xfund';
import { scrape as xrcventures } from './xrcventures';
import { scrape as xyz } from './xyz';
import { scrape as ycombinator } from './ycombinator';
import { scrape as yesvc } from './yesvc';
import { scrape as ylventures } from './ylventures';
import { scrape as zcg } from './zcg';
import { scrape as zeal } from './zeal';
import { scrape as zenda } from './zenda';
import { scrape as zetta } from './zetta';
import { scrape as zigg } from './zigg';

const impls: Record<string, () => Promise<ScrapedCompany[]>> = {
	'01a': zeroonea,
	'10d': tend,
	'2150': twentyonefifty,
	'3vc': threevc,
	'500': fivehundred,
	'7percent': sevenpercent,
	'83north': eightythreenorth,
	a16z,
	acapital,
	accel,
	advent,
	airbusventures,
	aisling,
	alchemist,
	aleph,
	alumni,
	ambition,
	antler,
	apex,
	archventure,
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
	bip,
	bluventures,
	blume,
	breakthrough,
	broocknell,
	calmstorm,
	canapi,
	cherry,
	congruent,
	boxgroup,
	craft,
	credo,
	creandum,
	cyberstarts,
	dcvc,
	draper,
	e14,
	earlybird,
	eclipse,
	entree,
	ef,
	episode1,
	eqt,
	f2,
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
	glilot,
	greycroft,
	greylock,
	grove,
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
	lux,
	m12,
	m13,
	m1c,
	mac,
	magic,
	mainsequence,
	makers,
	mana,
	mango,
	mantis,
	maple,
	massive,
	massmutual,
	material,
	matrix,
	maverick,
	maveron,
	mayfield,
	mcj,
	mmv,
	mendoza,
	menlo,
	mercuri,
	msc,
	meron,
	merus,
	metaplanet,
	metaprop,
	mfv,
	mhs,
	mig,
	mmc,
	mizmaa,
	moderne,
	monashees,
	moneta,
	moonshots,
	morpheus,
	mosaic,
	mouro,
	moxxie,
	mubadala,
	mucker,
	munichre,
	muse,
	musha,
	ngpartners,
	ndcapital,
	nea,
	necessary,
	neotribe,
	newmarkets,
	newstack,
	newfund,
	nextfrontier,
	nextplay,
	nextview,
	nexus,
	nfx,
	night,
	nlc,
	node,
	noemis,
	norrsken,
	northerngritstone,
	northpond,
	northstar,
	northzone,
	norwest,
	notation,
	nphard,
	nucleus,
	nuwa,
	nxtp,
	nyca,
	obvious,
	oca,
	oceanazul,
	octopus,
	offline,
	okapi,
	omers,
	omnivore,
	oneway,
	oneequity,
	onevc,
	openocean,
	operator,
	orbimed,
	origin,
	origins,
	oss,
	otb,
	ourcrowd,
	outlander,
	outsiders,
	overkill,
	overlook,
	overture,
	overwater,
	ovni,
	owl,
	p1,
	paladin,
	palladium,
	palmdrive,
	panache,
	pangaea,
	pantera,
	pareto,
	parkwalk,
	partech,
	pathbreaker,
	patron,
	peakbridge,
	pear,
	pebblebed,
	picksandshovels,
	picus,
	pillar,
	pioneer,
	pitango,
	playground,
	plg,
	plugandplay,
	plumalley,
	plural,
	pointnine,
	p72,
	polaris,
	powerhouse,
	precursor,
	prelude,
	presence,
	primary,
	primeimpact,
	primemovers,
	primetime,
	propeller,
	psv,
	push,
	qed,
	qualcomm,
	quantonation,
	quest,
	quiet,
	qumra,
	quona,
	race,
	r7,
	racap,
	radian,
	radical,
	radius,
	rainfall,
	rally,
	rarebreed,
	reach,
	recall,
	redpoint,
	recvc,
	recursive,
	redbear,
	redbud,
	redsea,
	redswan,
	refashiond,
	relay,
	renegade,
	renewal,
	resolute,
	restive,
	ret,
	ribbit,
	riot,
	riverpark,
	roble,
	rockhealth,
	rockies,
	rogue,
	rootvc,
	rre,
	rtp,
	salesforce,
	sapphire,
	seedcamp,
	sequoia,
	s2g,
	s3vc,
	saasvc,
	salt,
	sante,
	schematic,
	scifi,
	scifounders,
	scout,
	seedcapital,
	sentiero,
	seraphim,
	serena,
	sevensevensix,
	shield,
	shima,
	shine,
	shrug,
	sierra,
	sigmaprime,
	signalfire,
	silentvc,
	silversmith,
	sixthirty,
	sixty8,
	slow,
	socialleverage,
	sofinnova,
	sogal,
	soma,
	sosv,
	southparkcommons,
	spacecadet,
	spark,
	speedinvest,
	stageone,
	standardindustries,
	stripes,
	spice,
	springtime,
	sprout,
	startingline,
	story,
	stoutstreet,
	straydog,
	streamlined,
	strive,
	strongvc,
	struck,
	sugar,
	superangel,
	superhero,
	supermoon,
	supernode,
	supernova,
	supplychange,
	svangel,
	systemiq,
	targetglobal,
	ten13,
	telluride,
	teneleven,
	tenoneten,
	tau,
	tcg,
	tcv,
	team8,
	techstars,
	artemis,
	council,
	footprint,
	helm,
	longevity,
	venturecity,
	tvc,
	thirdprime,
	thirdrock,
	thirdsphere,
	thomabravo,
	timon,
	tlv,
	tmv,
	tnbaura,
	toba,
	toyota,
	townhall,
	trianglepeak,
	transformation,
	uncork,
	trailhead,
	transition,
	triatomic,
	tribecap,
	tribecavp,
	trousdale,
	trueventures,
	truewealth,
	tsvc,
	tusk,
	twelvebelow,
	twentyvc,
	twentytwo,
	twine,
	typeone,
	ulu,
	underline,
	undeterred,
	unicornindia,
	uniseed,
	unshackled,
	untapped,
	unusual,
	upfront,
	uphonest,
	uppartners,
	upper90,
	upslope,
	urban,
	usv,
	v1vc,
	valar,
	valia,
	valorcapitalgroup,
	valorventures,
	vamosventures,
	vanedge,
	variant,
	vastvc,
	vendep,
	venrock,
	venturefriends,
	venturesplatform,
	venturesouq,
	vertex,
	vestigo,
	vibevc,
	viking,
	villageglobal,
	vineventures,
	viola,
	vireo,
	virtuevc,
	visiblehands,
	visibleventures,
	voimaventures,
	voloearth,
	voyagervc,
	vtfcapital,
	vuventurepartners,
	watertower,
	wavemaker360,
	waverley,
	wellington,
	willowgrowth,
	windham,
	wing,
	wireframe,
	wischoff,
	wndr,
	wondervc,
	workbench,
	worklife,
	worldfund,
	wvvcapital,
	wxrfund,
	xange,
	xfactorventures,
	xfund,
	xrcventures,
	xyz,
	ycombinator,
	yesvc,
	ylventures,
	zcg,
	zeal,
	zenda,
	zetta,
	zigg
};

if (Object.keys(impls).length !== FUNDS.length || FUNDS.some((f) => !impls[f.slug]))
	throw new Error('scraper registry and shared FUNDS list are out of sync');

export const scrapers = FUNDS.map((f) => ({ ...f, scrape: impls[f.slug] }));
export const scraperBySlug = new Map(scrapers.map((s) => [s.slug, s]));
export type { ScrapedCompany } from './types';
