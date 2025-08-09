// api/chat.js — căutare direct pe site + ScraperAPI + DIAGNOSTIC clar
// ENV Production necesar: OPENAI_API_KEY, SCRAPER_API_KEY
// Frontend: /public/script.js deja afișează env + diagnostic (nu îl schimba).

const { OpenAI } = require("openai");
const cheerio = require("cheerio");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

async function getHTML(url, { render = true, timeoutMs = 18000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(proxyURL(url, { render }), {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        "accept": "text/html,application/xhtml+xml"
      },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
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

// ---------- CĂUTARE DIRECTĂ PE SITE-URI (fără Google/DDG) ----------
function normTeam(s) {
  return (s||"").toLowerCase().replace(/\s+/g, " ").trim();
}

// SPORTYTRADER: /en/search/?q=home%20away
async function findOnSportyTrader(home, away) {
  const q = encodeURIComponent(`${home} ${away}`);
  const searchURL = `https://www.sportytrader.com/en/search/?q=${q}`;
  const html = await getHTML(searchURL, { render: false, timeoutMs: 15000 });
  const $ = cheerio.load(html);
  const links = new Set();
  $('a[href*="sportytrader.com/en/"]').each((_, a) => {
    const href = $(a).attr("href");
    if (!href) return;
    const url = href.startsWith("http") ? href : `https://www.sportytrader.com${href}`;
    // prioritizăm pagini de tips/predictions/match
    if (/\/en\/(betting-tips|predictions|match)/.test(url)) links.add(url);
  });
  return Array.from(links).slice(0, 2);
}

// FOREBET: /en/search?query=home%20away
async function findOnForebet(home, away) {
  const q = encodeURIComponent(`${home} ${away}`);
  const searchURL = `https://www.forebet.com/en/search?query=${q}`;
  const html = await getHTML(searchURL, { render: false, timeoutMs: 15000 });
  const $ = cheerio.load(html);
  const links = new Set();
  $('a[href*="forebet.com/en/"]').each((_, a) => {
    const href = $(a).attr("href");
    if (!href) return;
    const url = href.startsWith("http") ? href : `https://www.forebet.com${href}`;
    if (/\/en\/(football-tips|predictions|matches|match)/.test(url)) links.add(url);
  });
  return Array.from(links).slice(0, 2);
}

// WINDRAWWIN: /search/?q=home+away
async function findOnWDW(home, away) {
  const q = encodeURIComponent(`${home} ${away}`);
  const searchURL = `https://www.windrawwin.com/search/?q=${q}`;
  const html = await getHTML(searchURL, { render: false, timeoutMs: 15000 });
  const $ = cheerio.load(html);
  const links = new Set();
  $('a[href*="windrawwin.com/"]').each((_, a) => {
    const href = $(a).attr("href");
    if (!href) return;
    const url = href.startsWith("http") ? href : `https://www.windrawwin.com${href}`;
    // pagini de meci (de obicei /matches/ sau /tips/ sau /vs/)
    if (/windrawwin\.com\/(matches|tips|vs|fixtures|predictions)/.test(url)) links.add(url);
  });
  return Array.from(links).slice(0, 2);
}

// PREDICTZ: nu are căutare stabilă → fallback simplu pe home/away în sitemap (posibil să nu returneze mereu)
async function findOnPredictZ(home, away) {
  // încercăm /tips/ + numele echipelor (poate eșua; lăsăm ca supliment)
  const guess = `https://www.predictz.com/search/?q=${encodeURIComponent(`${home} ${away}`)}`;
  try {
    const html = await getHTML(guess, { render: false, timeoutMs: 12000 });
    const $ = cheerio.load(html);
    const links = new Set();
    $('a[href*="predictz.com/"]').each((_, a) => {
      const href = $(a).attr("href");
      if (!href) return;
      const url = href.startsWith("http") ? href : `https://www.predictz.com${href}`;
      if (/predictz\.com\/(predictions|tips|soccer|matches)/.test(url)) links.add(url);
    });
    return Array.from(links).slice(0, 2);
  } catch {
    return [];
  }
}

async function autoFindSources(home, away) {
  const h = normTeam(home);
  const a = normTeam(away);
  const buckets = await Promise.all([
    findOnSportyTrader(h, a),
    findOnForebet(h, a),
    findOnWDW(h, a),
    findOnPredictZ(h, a)
  ]);
  // păstrăm un mix: max 6 linkuri, prioritate SportyTrader/Forebet/WnD
  const all = Array.from(new Set(buckets.flat().filter(Boolean)));
  return all.slice(0, 6);
}

async function scrape(url) {
  try {
    const html = await getHTML(url, { render: true, timeoutMs: 20000 });
    const text = cleanText(html);
    if (!text || text.length < 300) {
      return { url, ok: false, proxied: true, error: "conținut insuficient (<300 chars)" };
    }
    return { url, ok: true, proxied: true, text };
  } catch (e) {
    return { url, ok: false, proxied: true, error: String(e?.message || e) };
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

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metoda nu este permisă" });

  const env = { hasOpenAI, hasScraper, node: process.version };

  try {
    reqEnv("OPENAI_API_KEY");
    reqEnv("SCRAPER_API_KEY");

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const home = (body.home || "").trim();
    const away = (body.away || "").trim();
    let urls = Array.isArray(body.urls) ? body.urls.filter(Boolean) : [];

    if (!home || !away) {
      return res.status(400).json({ ok: false, env, error: "Câmpurile 'home' și 'away' sunt obligatorii" });
    }

    // dacă nu se trimit URL-uri manual, căutăm direct pe site-urile țintă
    if (urls.length === 0) {
      urls = await autoFindSources(home, away);
    }

    const scraped = [];
    for (const u of urls.slice(0, 6)) {
      scraped.push(await scrape(u));
    }

    const diagText = scraped.length
      ? scraped.map(s => (s.ok ? "OK  (proxy) " : "FAIL (proxy) ") + s.url + (s.error ? ` — ${s.error}` : "")).join("\n")
      : "(fără)";

    const srcBlock = scraped.filter(s => s.ok && s.text)
      .map(s => `SRC (proxy): ${s.url}\n${s.text}`).join("\n\n---\n\n");

    const messages = [
      { role: "system", content: sysPrompt() },
      {
        role: "user",
        content:
          `Meci: ${home} vs ${away}\n\n# DIAGNOSTIC SCRAPING\n${diagText}\n\n# TEXT EXTRAS DIN SURSE\n${srcBlock || "(niciun text disponibil)"}`
      }
    ];

    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages
    });

    const text = r.choices?.[0]?.message?.content || "(fără conținut)";
    return res.status(200).json({ ok: true, env, tried: urls, scraped, result: text });
  } catch (e) {
    return res.status(500).json({ ok: false, env, error: String(e?.message || e) });
  }
};
