// api/chat.js — auto-search + ScraperAPI obligatoriu + DIAGNOSTIC complet
// ENV (Production): OPENAI_API_KEY, SCRAPER_API_KEY

const { OpenAI } = require("openai");
const cheerio = require("cheerio");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ALLOWED = ["sportytrader.com","predictz.com","forebet.com","windrawwin.com"];

function reqEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`ENV lipsă: ${name} (setează în Vercel → Settings → Environment Variables → PRODUCTION)`);
  return v;
}
const hasOpenAI = !!process.env.OPENAI_API_KEY;
const hasScraper = !!process.env.SCRAPER_API_KEY;

function proxyURL(raw, { render = true, country = "eu" } = {}) {
  const key = reqEnv("SCRAPER_API_KEY");
  const u = new URL("https://api.scraperapi.com/");
  u.searchParams.set("api_key", key);
  u.searchParams.set("url", raw);
  u.searchParams.set("render", String(render));
  u.searchParams.set("country_code", country);
  return u.toString();
}

async function getHTML(url, timeoutMs = 18000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        "accept":"text/html,application/xhtml+xml"
      },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(t); }
}

function cleanText(html, maxLen = 22000) {
  const $ = cheerio.load(html);
  ["script","style","noscript","nav","footer","header","aside"].forEach(s => $(s).remove());
  const parts = [];
  $("h1,h2,h3,h4,p,li,td,th").each((_, el) => {
    const t = $(el).text().replace(/\s+/g," ").trim();
    if (t && t.length > 30) parts.push(t);
  });
  let text = parts.join("\n");
  if (text.length > maxLen) text = text.slice(0, maxLen);
  return text;
}

// --- căutare (prin proxy) ---
const ddg = q => { const u=new URL("https://duckduckgo.com/html/"); u.searchParams.set("q",q); return u.toString(); };
const ggl = q => { const u=new URL("https://www.google.com/search"); u.searchParams.set("q",q); u.searchParams.set("hl","en"); return u.toString(); };
const isAllowed = u => { try{ const h=new URL(u).hostname.replace(/^www\./,""); return ALLOWED.some(d=>h.endsWith(d)); }catch{ return false; } };
const normG = h => (h && h.startsWith("/url?q=")) ? decodeURIComponent(h.split("/url?q=")[1].split("&")[0]) : (h||"");

async function searchEngine(url) {
  const html = await getHTML(proxyURL(url,{render:true}));
  const $ = cheerio.load(html);
  const links = [];
  $(".result__a, a.result__a").each((_,a)=>{ const href=$(a).attr("href"); if(href?.startsWith("http") && isAllowed(href)) links.push(href); });
  if (!links.length) {
    $("a").each((_,a)=>{ const href=normG($(a).attr("href")); if(href.startsWith("http") && isAllowed(href)) links.push(href); });
  }
  return Array.from(new Set(links)).slice(0,6);
}

async function autoFindSources(home,away) {
  const base = `${home} vs ${away} prediction`;
  const queries = [
    `site:sportytrader.com ${base}`,
    `site:predictz.com ${base}`,
    `site:forebet.com ${base}`,
    `site:windrawwin.com ${base}`,
    base
  ];
  let found = [];
  for (const q of queries) {
    try { found = found.concat(await searchEngine(ddg(q))); } catch {}
    if (found.length < 6) { try { found = found.concat(await searchEngine(ggl(q))); } catch {} }
    if (found.length >= 6) break;
  }
  const uniq = Array.from(new Set(found));
  const score = u => { const h=new URL(u).hostname.replace(/^www\./,""); const i=ALLOWED.findIndex(d=>h.endsWith(d)); return i===-1?99:i; };
  return uniq.sort((a,b)=>score(a)-score(b)).slice(0,6);
}

async function scrape(url) {
  try {
    const html = await getHTML(proxyURL(url,{render:true}));
    return { url, ok:true, proxied:true, text: cleanText(html) };
  } catch (e) {
    return { url, ok:false, error:String(e?.message||e) };
  }
}

function sysPrompt() {
  return [
    "Ești botul LucyOFM – Analize meciuri.",
    "FORMAT: 10 puncte cu ✅ ⚠️ 📊 🎯. Fără caractere asiatice. Fără cuvântul «Simbol». Ton ferm, concis.",
    "Nu inventa; folosește DOAR textul extras. Dacă sursele se contrazic, marchează cu ⚠️.",
    "Început: ce spune fiecare sursă (✅ dacă ≥3 coincid). Final: 3–5 recomandări 🎯, fiecare pe linie.",
    "Dacă n-ai text din surse: «Date insuficiente din surse – analiză bazată pe model»."
  ].join("\n");
}

module.exports = async (req,res)=>{
  // CORS
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if (req.method==="OPTIONS") return res.status(200).end();
  if (req.method!=="POST") return res.status(405).json({ error: "Metoda nu este permisă" });

  const env = { hasOpenAI, hasScraper, node: process.version };

  try {
    reqEnv("OPENAI_API_KEY");
    reqEnv("SCRAPER_API_KEY");

    const body = typeof req.body === "string" ? JSON.parse(req.body||"{}") : (req.body||{});
    const home = (body.home||"").trim();
    const away = (body.away||"").trim();
    let urls = Array.isArray(body.urls) ? body.urls.filter(Boolean) : [];
    if (!home || !away) return res.status(400).json({ error:"Câmpurile 'home' și 'away' sunt obligatorii", env });

    if (urls.length === 0) urls = await autoFindSources(home, away);

    const scraped = [];
    for (const u of urls.slice(0,6)) scraped.push(await scrape(u));

    const diagText = scraped.length
      ? scraped.map(s => (s.ok ? "OK  (proxy) " : "FAIL ") + s.url + (s.error ? ` — ${s.error}` : "")).join("\n")
      : "(fără)";

    const srcBlock = scraped.filter(s=>s.ok && s.text)
      .map(s=>`SRC (proxy): ${s.url}\n${s.text}`).join("\n\n---\n\n");

    const messages = [
      { role:"system", content: sysPrompt() },
      { role:"user", content:
        `Meci: ${home} vs ${away}\n\n# DIAGNOSTIC SCRAPING\n${diagText}\n\n# TEXT EXTRAS DIN SURSE\n${srcBlock || "(niciun text disponibil)"}`
      }
    ];

    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages
    });

    const text = r.choices?.[0]?.message?.content || "(fără conținut)";
    return res.status(200).json({ ok:true, env, tried: urls, scraped, result: text });
  } catch (e) {
    return res.status(500).json({ ok:false, env, error: String(e?.message||e) });
  }
};
