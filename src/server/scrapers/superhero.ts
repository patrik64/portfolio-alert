import type { ScrapedCompany } from './types';

const BASE_URL = "https://superherocapital.com";
const PAGE_URL = `${BASE_URL}/portfolio/`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// The portfolio page never writes a company's name down: every card is a logo
// image (all of them alt="Company Logo"), a tagline and a country. The logo's
// filename is the only per-company identifier in the markup, so names are
// resolved through this list, each one read off the company's own website where
// it has one. A logo that isn't listed still imports, under the name derived
// from its filename — see deriveName.
const NAMES: Record<string, string> = {
  aispeco: "AISPECO",
  annie: "Annie Advisor",
  arcticrobotics: "Arcticrobotics",
  arilyn: "Arilyn",
  attractive: "Attractive",
  battleboxes: "BattleBoxes",
  behavix: "Behavix",
  bh: "Builderhead",
  cactos: "Cactos",
  callstreamai: "CallStream AI",
  camment: "Camment",
  cloudfactory: "Cloud Factory",
  codescoop: "Codescoop",
  copla: "Copla",
  creagent: "Creagent",
  custobar: "Custobar",
  deepfin: "DeepFin",
  doublepoint: "Doublepoint",
  dripit: "Dripit",
  emabler: "eMabler",
  envelope: "Envelope",
  epicbrief: "Epicbrief",
  flow: "Flow Computing",
  flowplayer: "Flowplayer",
  fractory: "Fractory",
  hamina: "Hamina Wireless",
  homiesc: "Homie",
  koll: "Koll",
  leadfeeder: "Leadfeeder",
  linear: "Linear",
  lygg: "LYGG",
  maplet: "Maplet",
  mjuk: "Mjuk",
  mydello: "MyDello",
  neverthink: "Neverthink",
  ouna: "Ounas Health",
  phaver: "Phaver",
  pricer: "Pricen",
  printonpack: "PrintOnPack",
  receipthero: "ReceiptHero",
  relancer: "Relancer",
  renow: "Renow",
  rise: "Rise",
  screenshot20250805at0958: "Furro",
  screenshot20251016at2315: "Supernaut",
  senzolive: "Senzolive",
  shenai: "Shen AI",
  sigvi: "Sigvi",
  singa: "Singa",
  skeneai: "Skene AI",
  speakly: "Speakly",
  steerpath: "Steerpath",
  surgeryvision: "Surgeryvision",
  thestorage: "TheStorage",
  tophatch: "Tophatch",
  valohai: "Valohai",
  vapaus: "Vapaus",
  vibecatch: "VibeCatch",
  videobot: "Videobot",
  voyaxes: "Voyaxes",
  vugene: "VUGENE",
  xceed: "XCEED",
  zadaa: "Zadaa",
  zenniz: "Zenniz",
  ziosec: "ZioSec",
  ziticity: "Ziticity",
};

const decode = (s: string) =>
  s
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&#x27;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// logos are re-exported and re-uploaded over time, which only ever changes the
// decoration around the name ("Portfolio_Logo_Vapaus-1", "mjuk-logo-website")
function logoStem(src: string) {
  return src
    .replace(/^.*\//, "")
    .replace(/\.(png|jpe?g|svg|webp|gif)$/i, "")
    .replace(/^(SH[_-])?Portfolio[_-]Logo[_-]/i, "")
    .replace(/[_-]?logo.*$/i, "")
    .replace(/[_-]?\d+$/, "");
}

// last resort for a logo the list doesn't know: the filename, or the linked
// domain when the filename says nothing (an initialism, a screenshot dump)
function deriveName(stem: string, url: string) {
  const domain = url
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .replace(/^(www|en)\./, "")
    .replace(/\.[a-z][a-z.]+$/i, "");
  const base =
    stem.length < 3 || /^screenshot/i.test(stem) ? domain || stem : stem.replace(/[_-]+/g, " ");
  return base === base.toLowerCase() ? base.charAt(0).toUpperCase() + base.slice(1) : base;
}

// the tagline's last line is the country, shouted
const titleCase = (country: string) =>
  country
    .split("/")
    .map((part) => part.trim())
    .map((part) => (part.length <= 3 ? part : part[0] + part.slice(1).toLowerCase()))
    .join("/");

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();

  // the split keeps the optional status class, so the parts alternate
  // status, card, status, card…
  const parts = html.split(/<div class="company( has-exited)?">/);
  for (let i = 1; i < parts.length; i += 2) {
    const [status, item] = [parts[i], parts[i + 1] ?? ""];
    const exited = Boolean(status);
    const logo = item.match(/class="company__logo">[\s\S]*?<img src="([^"]+)"/)?.[1] ?? "";
    if (!logo) continue;
    const url = item.match(/class="company__logo">\s*<a href="(https?:\/\/[^"]+)"/)?.[1] ?? "";

    const stem = logoStem(logo);
    const name = NAMES[stem.toLowerCase().replace(/[^a-z0-9]/g, "")] ?? deriveName(stem, url);
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const lines = (item.match(/class="company__desc">\s*<p>([\s\S]*?)<\/p>/)?.[1] ?? "")
      .split(/<br\s*\/?>/i)
      .map((line) => decode(line.replace(/<[^>]+>/g, " ")))
      .filter(Boolean);
    const last = lines[lines.length - 1] ?? "";
    const country = /^[A-Z]+(?:\s*\/\s*[A-Z]+)*$/.test(last) ? titleCase(last) : "";

    companies.push({
      name,
      category: [country, exited ? "Exited" : ""].filter(Boolean).join(", "),
      url,
    });
  }

  if (companies.length === 0) {
    throw new Error("superhero: no companies found in the portfolio grid");
  }

  return companies;
}
