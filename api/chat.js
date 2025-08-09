// api/chat.js — Auto-căutare cu Bing Web Search (fără proxy), scraping direct, DIAGNOSTIC clar
// ENV (Production): OPENAI_API_KEY, BING_API_KEY
// Runtime: Node 22 (CJS)

module.exports.config = { runtime: "nodejs22.x" };

const { OpenAI } = require("openai");
const cheerio = require("cheerio");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function reqEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`ENV lipsă: ${name} (setează în Vercel → Settings → Environment Variables → PRODUCTION)`);
  return v;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const ALLOWED = ["sportytrader.com", "predictz.com", "forebet.com", "windrawwin.com"];

function isAllowed(u) {
  try {
    const h = new URL(u).hostname.replace(/^www\./, "");
    return ALLOWED.some((d) => h.endsWith(d));
  } catch {
    return false;
  }
}

async function getHTML(url, timeoutMs = 16000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9,ro;q=0.8",
        "cache-control": "no-cache",
        pragma: "no-cache",
        "upgrade-insecure-requests": "1",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`HTTP ${res.status}${text ? " — " + text.slice(0, 200) : ""}`);
    return text;
  } finally {
    clearTimeout(t);
  }
}

function cleanText(html, maxLen = 22000) {
  const $ = cheerio.load(html);
  ["script", "style", "noscript", "nav", "footer", "header", "aside"].forEach((s) => $(s).remove());
  const parts = [];
  $("h1,h2,h3,h4,p,li,td,th").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t && t.length > 30) parts.push(t);
  });
  let text = parts.join("\n");
  if (text.length > maxLen) text = text.slice(0, maxLen);
  return text;
}

/** --- Căutare cu Bing Web Search --- */
async function bingSearch(query, count = 20, mkt = "en-US") {
  const key = reqEnv("BING_API_KEY");
  const u = new URL("https://api.bing.microsoft.com/v7.0/search");
  u.searchParams.set("q", query);
  u.searchParams.set("mkt", mkt);
  u.searchParams.set("count", String(count));
  u.searchParams.set("safeSearch", "Off");

  const res = await fetch(u.toString(), {
    headers: { "Ocp-Apim-Subscription-Key": key },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.message || json?._type || JSON.stringify(json).slice(0, 200);
    throw new Error(`Bing ${res.status} — ${msg}`);
  }
  const items = json?.webPages?.value || [];
  const urls = items.map((it) => it.url).filter((u) => typeof u === "string");
  return Array.from(new Set(urls)).filter(isAllowed);
}

async function autoFindSources(home, away) {
  const base = `${home} vs ${away} prediction`;
  const queries = [
    `site:sportytrader.com ${base}`,
    `site:forebet.com ${base}`,
    `site:windrawwin.com ${base}`,
    `site:predictz.com ${base}`,
    base,
  ];

  let found = [];
  for (const q of queries) {
    try {
      const got = await bingSearch(q, 20, "en-US");
      found = found.concat(got);
      if (found.length >= 6) break;
    } catch {
      // continuăm cu următoarea interogare
    }
  }
  // prioritate pe ordinea din ALLOWED
  const score = (u) => {
    try {
      const h = new URL(u).hostname.replace(/^www\./, "");
      const i = ALLOWED.findIndex((d) => h.endsWith(d));
      return i === -1 ? 99 : i;
    } catch {
      return 99;
    }
  };
  const uniq = Array.from(new Set(found));
  return uniq.sort((a, b) => score(a) - score(b)).slice(0, 6);
}

/** --- Scraping direct --- */
async function scrape(url) {
  try {
    const html = await getHTML(url, 18000);
    const text = cleanText(html);
    if (!text || text.length < 300) return { url, ok: false, direct: true, error: "conținut insuficient (<300 chars)" };
    return { url, ok: true, direct: true, text };
  } catch (e) {
    return { url, ok: false, direct: true, error: String(e?.message || e) };
  }
}

function sysPrompt() {
  return [
    "Ești botul LucyOFM – Analize meciuri.",
    "FORMAT: 10 puncte cu ✅ ⚠️ 📊 🎯. Fără caractere asiatice. Fără cuvântul «Simbol». Ton ferm, concis.",
    "Nu inventa; folosește DOAR textul extras. Dacă sursele se contrazic, marchează cu ⚠️.",
    "Început: ce spune fiecare sursă (✅ dacă ≥3 coincid). Final: 3–5 recomandări 🎯, fiecare pe linie.",
    "Dacă n-ai text din surse: «Date insuficiente din surse – analiză bazată pe model».",
  ].join("\n");
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metoda nu este permisă" });

  const env = {
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    hasBing: !!process.env.BING_API_KEY,
    node: process.version,
  };

  try {
    reqEnv("OPENAI_API_KEY");
    reqEnv("BING_API_KEY");

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const home = (body.home || "").trim();
    const away = (body.away || "").trim();
    let urls = Array.isArray(body.urls) ? body.urls.filter(Boolean) : [];

    if (!home || !away) {
      return res.status(400).json({ ok: false, env, error: "Câmpurile 'home' și 'away' sunt obligatorii" });
    }

    if (urls.length === 0) urls = await autoFindSources(home, away);

    const scraped = [];
    for (const u of urls.slice(0, 6)) scraped.push(await scrape(u));

    const diag = scraped.length
      ? scraped
          .map((s) => (s.ok ? "OK  (direct) " : "FAIL (direct) ") + s.url + (s.error ? ` — ${s.error}` : ""))
          .join("\n")
      : "(fără)";

    const srcBlock = scraped
      .filter((s) => s.ok && s.text)
      .map((s) => `SRC (direct): ${s.url}\n${s.text}`)
      .join("\n\n---\n\n");

    if (!srcBlock) {
      return res.status(200).json({
        ok: true,
        env,
        tried: urls,
        scraped,
        result: `# DIAGNOSTIC SCRAPING\n${diag}\n\n# ANALIZĂ\nDate insuficiente din surse – analiză bazată pe model.`,
      });
    }

    const messages = [
      { role: "system", content: sysPrompt() },
      {
        role: "user",
        content: `Meci: ${home} vs ${away}\n\n# DIAGNOSTIC SCRAPING\n${diag}\n\n# TEXT EXTRAS DIN SURSE\n${srcBlock}`,
      },
    ];

    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages,
    });

    const text = r.choices?.[0]?.message?.content || "(fără conținut)";
    return res.status(200).json({ ok: true, env, tried: urls, scraped, result: text });
  } catch (e) {
    return res.status(500).json({ ok: false, env, error: String(e?.message || e) });
  }
};
