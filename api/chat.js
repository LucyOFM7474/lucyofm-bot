// api/chat.js — fix 401 ScraperAPI + căutare directă pe site + fallback direct
// ENV Production: OPENAI_API_KEY, SCRAPER_API_KEY

const { OpenAI } = require("openai");
const cheerio = require("cheerio");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Forțează Node runtime 22 pe Vercel (CJS)
module.exports.config = { runtime: "nodejs22.x" };

function reqEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`ENV lipsă: ${name} (setează în Vercel → Settings → Environment Variables → PRODUCTION)`);
  return v;
}
const hasOpenAI = !!process.env.OPENAI_API_KEY;
const hasScraper = !!process.env.SCRAPER_API_KEY;

// Notă: folosim HTTP (nu HTTPS) — ScraperAPI cu https produce frecvent 401
const SCRAPER_BASE = "http://api.scraperapi.com";

function proxyURL(raw, { render = true, country = "eu" } = {}) {
  const key = reqEnv("SCRAPER_API_KEY");
  const u = new URL(SCRAPER_BASE + "/");
  u.searchParams.set("api_key", key);
  u.searchParams.set("url", raw);
  u.searchParams.set("render", String(render));
  u.searchParams.set("country_code", country);
  // u.searchParams.set("keep_headers","true"); // opțional, dacă vrei header pass-through
  return u.toString();
}

async function probeScraper() {
  const key = reqEnv("SCRAPER_API_KEY");
  const url = `${SCRAPER_BASE}/account?api_key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  const txt = await res.text().catch(() => "");
  return { status: res.status, body: txt.slice(0, 400) };
}

async function getHTMLViaProxy(rawUrl, { render = true, timeoutMs = 18000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(proxyURL(rawUrl, { render }), {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        "accept": "text/html,application/xhtml+xml"
      },
      signal: controller.signal
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      // include body pentru 401/403 debugging
      throw new Error(`HTTP ${res.status}${text ? " — " + text.slice(0, 260) : ""}`);
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function getHTMLDirect(rawUrl, { timeoutMs = 12000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(rawUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        "accept": "text/html,application/xhtml+xml"
      },
      signal: controller.signal
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`HTTP ${res.status}${text ? " — " + text.slice(0, 200) : ""}`);
    return text;
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

function normTeam(s){ return (s||"").toLowerCase().replace(/\s+/g," ").trim(); }

// --- Căutare directă pe site-uri (fără Google/DDG) ---
async function findOnSportyTrader(home, away) {
  const q = encodeURIComponent(`${home} ${away}`);
  const searchURL = `https://www.sportytrader.com/en/search/?q=${q}`;
  const html = await getHTMLViaProxy(searchURL, { render: false, timeoutMs: 15000 });
  const $ = cheerio.load(html);
  const links = new Set();
  $('a[href*="sportytrader.com/en/"]').each((_, a) => {
    const href = $(a).attr("href"); if (!href) return;
    const url = href.startsWith("http") ? href : `https://www.sportytrader.com${href}`;
    if (/\/en\/(betting-tips|predictions|match)/.test(url)) links.add(url);
  });
  return Array.from(links).slice(0, 2);
}

async function findOnForebet(home, away) {
  const q = encodeURIComponent(`${home} ${away}`);
  const searchURL = `https://www.forebet.com/en/search?query=${q}`;
  const html = await getHTMLViaProxy(searchURL, { render: false, timeoutMs: 15000 });
  const $ = cheerio.load(html);
  const links = new Set();
  $('a[href*="forebet.com/en/"]').each((_, a) => {
    const href = $(a).attr("href"); if (!href) return;
    const url = href.startsWith("http") ? href : `https://www.forebet.com${href}`;
    if (/\/en\/(football-tips|predictions|matches|match)/.test(url)) links.add(url);
  });
  return Array.from(links).slice(0, 2);
}

async function findOnWDW(home, away) {
  const q = encodeURIComponent(`${home} ${away}`);
  const searchURL = `https://www.windrawwin.com/search/?q=${q}`;
  const html = await getHTMLViaProxy(searchURL, { render: false, timeoutMs: 15000 });
  const $ = cheerio.load(html);
  const links = new Set();
  $('a[href*="windrawwin.com/"]').each((_, a) => {
    const href = $(a).attr("href"); if (!href) return;
    const url = href.startsWith("http") ? href : `https://www.windrawwin.com${href}`;
    if (/windrawwin\.com\/(matches|tips|vs|fixtures|predictions)/.test(url)) links.add(url);
  });
  return Array.from(links).slice(0, 2);
}

async function findOnPredictZ(home, away) {
  const guess = `https://www.predictz.com/search/?q=${encodeURIComponent(`${home} ${away}`)}`;
  try {
    const html = await getHTMLViaProxy(guess, { render: false, timeoutMs: 12000 });
    const $ = cheerio.load(html);
    const links = new Set();
    $('a[href*="predictz.com/"]').each((_, a) => {
      const href = $(a).attr("href"); if (!href) return;
      const url = href.startsWith("http") ? href : `https://www.predictz.com${href}`;
      if (/predictz\.com\/(predictions|tips|soccer|matches)/.test(url)) links.add(url);
    });
    return Array.from(links).slice(0, 2);
  } catch { return []; }
}

async function autoFindSources(home, away) {
  const h = normTeam(home), a = normTeam(away);
  const buckets = await Promise.allSettled([
    findOnSportyTrader(h, a),
    findOnForebet(h, a),
    findOnWDW(h, a),
    findOnPredictZ(h, a)
  ]);
  const all = [];
  for (const b of buckets) if (b.status === "fulfilled") all.push(...b.value);
  return Array.from(new Set(all)).slice(0, 6);
}

async function scrape(url) {
  // 1) încearcă proxy (cu render)
  try {
    const html = await getHTMLViaProxy(url, { render: true, timeoutMs: 20000 });
    const text = cleanText(html);
    if (text && text.length >= 300) return { url, ok: true, proxied: true, text };
    // dacă e prea scurt, încearcă direct
    const html2 = await getHTMLDirect(url, { timeoutMs: 10000 });
    const text2 = cleanText(html2);
    if (text2 && text2.length >= 300) return { url, ok: true, proxied: false, text: text2 };
    return { url, ok: false, proxied: true, error: "conținut insuficient (<300 chars)" };
  } catch (e) {
    const msg = String(e?.message || e);
    // 401/403 la proxy → încearcă direct
    if (/HTTP 401|HTTP 403/i.test(msg)) {
      try {
        const html = await getHTMLDirect(url, { timeoutMs: 10000 });
        const text = cleanText(html);
        if (text && text.length >= 300) return { url, ok: true, proxied: false, text };
      } catch (e2) {
        return { url, ok: false, proxied: false, error: `fallback direct failed — ${String(e2?.message || e2)}` };
      }
    }
    return { url, ok: false, proxied: true, error: msg };
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

    // 0) probă cheie Scraper (ca să explicăm 401 vs. altceva)
    const probe = await probeScraper(); // {status, body}
    const probeNote = `(probe ScraperAPI: ${probe.status}${probe.body ? " — " + probe.body : ""})`;

    if (urls.length === 0) urls = await autoFindSources(home, away);

    const scraped = [];
    for (const u of urls.slice(0, 6)) {
      scraped.push(await scrape(u));
    }

    const diagHead = `ENV probe: ${probeNote}`;
    const diagRows = scraped.length
      ? scraped.map(s => {
          const tag = s.ok ? "OK " : "FAIL";
          const via = s.proxied ? "(proxy)" : "(direct)";
          return `${tag} ${via} ${s.url}${s.error ? ` — ${s.error}` : ""}`;
        }).join("\n")
      : "(fără)";

    const srcBlock = scraped.filter(s => s.ok && s.text)
      .map(s => `SRC ${s.proxied ? "(proxy)" : "(direct)"}: ${s.url}\n${s.text}`).join("\n\n---\n\n");

    // dacă n-avem text din surse, nu mai chemăm OpenAI ca să nu irosim tokeni
    if (!srcBlock) {
      return res.status(200).json({
        ok: true,
        env,
        tried: urls,
        scraped,
        result: `# DIAGNOSTIC SCRAPING\n${diagHead}\n${diagRows}\n\n# ANALIZĂ\nDate insuficiente din surse – analiză bazată pe model.`
      });
    }

    const messages = [
      { role: "system", content: sysPrompt() },
      {
        role: "user",
        content:
          `Meci: ${home} vs ${away}\n\n# DIAGNOSTIC SCRAPING\n${diagHead}\n${diagRows}\n\n# TEXT EXTRAS DIN SURSE\n${srcBlock}`
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
