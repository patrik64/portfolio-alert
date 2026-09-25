import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.engineeringcapital.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the home page holds the portfolio as two grids of logos, one
// headed "Portfolio" for the companies held and one headed "Previous
// Investments" for those the fund is out of. every logo is a snippet of code
// — an image, and a click that asks before leaving for an address: the
// company's site in the first grid and, in the second, the news of how it
// went (an acquirer's release, an ipo filing). nothing names a company but
// the image's file name ("Coderabbit_840_560.png"), so the names — and how
// the previous investments went, which the page tells only by where it
// links — are kept here by that file name's stem; a logo not yet known is
// named off its file.

const SECTION = /(?=<section\b)/;
const HEADING = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/;
const LOGO = /getYourDecision\(\s*[`'"]([^`'"]+)[`'"]\s*\)[^>]*>\s*<img\b[^>]*\bsrc="([^"]+)"/g;
const STEALTH = /^stealth\b/i;

// by the file's stem, lowercased, joined with underscores and shorn of the
// sizes and notes the files are named with ("Nimbella_840_560_acq")
const KNOWN: Record<string, { name: string; outcome?: string }> = {
	allgood: { name: 'AllGood' },
	asimily: { name: 'Asimily' },
	auditoria: { name: 'Auditoria.AI' },
	cloudexe: { name: 'CloudExe' },
	coderabbit: { name: 'CodeRabbit' },
	collinear: { name: 'Collinear AI' },
	concentric_ai: { name: 'Concentric AI' },
	curie: { name: 'Curie' },
	ctrlstack: { name: 'CtrlStack' },
	dataworkz: { name: 'Dataworkz' },
	elmai: { name: 'Elm AI' },
	evinced: { name: 'Evinced' },
	fireproof: { name: 'Fireproof' },
	guickly: { name: 'Guickly' },
	hawcx: { name: 'Hawcx' },
	highscore: { name: 'Highscore' },
	inductor: { name: 'Inductor' },
	irisagent: { name: 'IrisAgent' },
	joshu: { name: 'Joshu' },
	kahuna: { name: 'Kahuna Labs' },
	kipo: { name: 'Kipo AI' },
	kognitos: { name: 'Kognitos' },
	konfer: { name: 'Konfer AI' },
	leadbeam: { name: 'Leadbeam' },
	menlo: { name: 'Menlo Security' },
	metlasai: { name: 'Metlas AI' },
	misalabs: { name: 'MisaLabs' },
	nexla: { name: 'Nexla' },
	onymos: { name: 'Onymos' },
	oodle: { name: 'Oodle AI' },
	sail: { name: 'Sail Internet' },
	scoop: { name: 'Scoop Analytics' },
	sensible: { name: 'Sensible' },
	spacewalk: { name: 'Spacewalk AI' },
	specific_ai: { name: 'Specific AI' },
	supermetal: { name: 'Supermetal' },
	tidalwave: { name: 'Tidalwave AI' },
	trustero: { name: 'Trustero' },
	vfunction: { name: 'vFunction' },
	walt: { name: 'WALT' },
	xano: { name: 'Xano' },
	zep: { name: 'Zep' },
	// the previous investments, each linked to the news of how it went
	airgap: { name: 'Airgap Networks', outcome: 'Acquired by Zscaler' },
	cortex: { name: 'Cortex Labs', outcome: 'Acquired by Databricks' },
	dioptra_icertis: { name: 'Dioptra', outcome: 'Acquired by Icertis' },
	gyroscope: { name: 'Gyroscope', outcome: 'Acquired by BlueVoyant' },
	insurgrid: { name: 'InsurGrid', outcome: 'Acquired by Helium Ventures' },
	kentik_infoblox: { name: 'Kentik', outcome: 'Acquired by Infoblox' },
	mirantis_iren: { name: 'Mirantis', outcome: 'Acquired by IREN' },
	netsil: { name: 'Netsil', outcome: 'Acquired by Nutanix' },
	nimbella: { name: 'Nimbella', outcome: 'Acquired by DigitalOcean' },
	palerra: { name: 'Palerra', outcome: 'Acquired by Oracle' },
	passage: { name: 'Passage AI', outcome: 'Acquired by ServiceNow' },
	reshuffle: { name: 'Reshuffle', outcome: 'Acquired by Twitter' },
	robust: { name: 'Robust Intelligence', outcome: 'Acquired by Cisco' },
	rubrik: { name: 'Rubrik', outcome: 'IPO' },
	shiftright: { name: 'ShiftRight', outcome: 'Acquired by Zscaler' },
	shipa: { name: 'Shipa', outcome: 'Acquired by Mirantis' },
	signalfx: { name: 'SignalFx', outcome: 'Acquired by Splunk' },
	stackstorm: { name: 'StackStorm', outcome: 'Acquired by Brocade' },
	stemma: { name: 'Stemma', outcome: 'Acquired by Teradata' },
	tignis: { name: 'Tignis', outcome: 'Acquired by Cohu' },
	widefield_cisco: { name: 'WideField Security', outcome: 'Acquired by Cisco' }
};

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the stem of a logo's file: "Kipo_840_560+copy.png" is kipo
function stemOf(src: string): string {
	const file = unescape(src).split(/[?#]/)[0].split('/').pop() ?? '';
	let stem = file;
	try {
		stem = decodeURIComponent(file.replace(/\+/g, ' '));
	} catch {
		// a file named with a stray percent sign stays as it is
	}
	return stem
		.replace(/\.[a-z0-9]+$/i, '')
		.toLowerCase()
		.replace(/[\s_]+/g, '_')
		.replace(/_840_560/g, '')
		.replace(/_(copy|acq|acquired|ipo)(?=_|$)/g, '');
}

// a name read off a stem, for a logo not yet known
const nameOf = (stem: string) =>
	stem
		.split('_')
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(SECTION).slice(1)) {
		const section = chunk.split('</section>')[0];
		const heading = clean(section.match(HEADING)?.[1] ?? '');
		const previous = /^previous investments$/i.test(heading);
		if (!previous && !/^portfolio$/i.test(heading)) continue;
		for (const [, link, src] of section.matchAll(LOGO)) {
			const stem = stemOf(src);
			const known = KNOWN[stem];
			const name = known?.name ?? nameOf(stem);
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			companies.push({
				name,
				category: previous ? [known?.outcome ?? 'Previous investment', 'Exited'].join(', ') : '',
				url: unescape(link).trim()
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('engineeringcapital: no logos under the portfolio headings');
	}

	return companies;
}
