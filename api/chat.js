// api/chat.js — Auto-search + scraping prin ScraperAPI + analiză în 10 puncte
// ENV necesare: OPENAI_API_KEY (obligatoriu), SCRAPER_API_KEY (recomandat puternic)

const { OpenAI } = require("openai");
const cheerio = require("cheerio");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ALLOWED = [
  "sportytrader.com",
  "predictz.com",
  "forebet.com",
  "windrawwin.com"
];

function buildProxy(url, opts = {}) {
  const key = process.env.SCRAPER_API_KEY;
  if (!key) return null;
  const u = new URL("https://api.scraperapi.com/");
  u.searchParams.set("api_key", key);
  u.searchParams.set("url", url);
  u.searchParams.set("render", String(opts.render ?? true));
  u.searchParams.set("country_code", opts.country ?? "eu");
  return u.toString();
}

async function safeFetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
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
    clearTimeout(t);
  }
}

function cleanText(html, maxLen = 22000) {
  const $ = cheerio.load(html);
  ["script","style","noscript","nav","footer","header","aside"].forEach(s => $(s).remove());
  const parts = [];
  $("h1,h2,h3,h4,p,li,td,th").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t && t.length > 30) parts.push(t);
  });
  let text = parts.join("\n");
  if (text.length > maxLen) text = text.slice(0, maxLen);
  return text;
}

// --- căutare: încearcă DuckDuckGo HTML și fallback Google SERP --- //
function ddgQuery(q) {
  const base = "https://duckduckgo.com/html/";
  const u = new URL(base);
  u.searchParams.set("q", q);
  return u.toString();
}
function googleQuery(q) {
  const base = "https://www.google.com/search";
  const u = new URL(base);
  u.searchParams.set("q", q);
  u.searchParams.set("hl", "en");
  return u.toString();
}

function isAllowed(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    return ALLOWED.some(d => h.endsWith(d));
  } catch { return false; }
}

function normalizeGoogleHref(href) {
  // Google dă /url?q=DEST&...
  if (href.startsWith("/url?q=")) {
    try {
      const real = decodeURIComponent(href.split("/url?q=")[1].split("&")[0]);
      return real;
    } catch { return href; }
  }
  return href;
}

async function searchOnce(engineUrl) {
  const proxy = buildProxy(engineUrl, { render: true });
  const html = await safeFetchText(proxy || engineUrl);
  const $ = cheerio.load(html);
  const links = [];

  // DuckDuckGo
  $(".result__a, a.result__a").each((_, a) => {
    const href = $(a).attr("href");
    if (href && href.startsWith("http") && isAllowed(href)) links.push(href);
  });

  // Google
  if (links.length === 0) {
    $("a").each((_, a) => {
      const raw = $(a).attr("href") || "";
      const href = normalizeGoogleHref(raw);
      if (href.startsWith("http") && isAllowed(href)) links.push(href);
    });
  }

  // Unice și primele 6
  return Array.from(new Set(links)).slice(0, 6);
}

async function autoFindSources(home, away) {
  const qBase = `${home} vs ${away} prediction`;
  const queries = [
    `site:sportytrader.com ${qBase}`,
    `site:predictz.com ${qBase}`,
    `site:forebet.com ${qBase}`,
    `site:windrawwin.com ${qBase}`,
    qBase
  ];

  let found = [];
  for (const q of queries) {
    try {
      const links =
        (await searchOnce(ddgQuery(q))).length
          ? await searchOnce(ddgQuery(q))
          : await searchOnce(googleQuery(q));
      found = found.concat(links);
    } catch { /* ignoră */ }
    if (found.length >= 6) break;
  }
  // deduplicate + preferă domeniile ALLOWED mai întâi
  const uniq = Array.from(new Set(found));
  const score = url => {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const idx = ALLOWED.findIndex(d => host.endsWith(d));
    return idx === -1 ? 99 : idx; // mai mic = mai prioritar
  };
  return uniq.sort((a,b) => score(a) - score(b)).slice(0, 6);
}

async function scrapeUrl(url) {
  const direct = async () => cleanText(await safeFetchText(url));
  try {
    // încearcă prin proxy randat întâi (evită 401/JS)
    const p = buildProxy(url, { render: true });
    if (p) return { url, ok: true, text: cleanText(await safeFetchText(p)), proxied: true };
    // apoi direct
    return { url, ok: true, text: await direct(), proxied: false };
  } catch (e1) {
    // fallback direct dacă proxy a picat
    try {
      return { url, ok: true, text: await direct(), proxied: false };
    } catch (e2) {
      return { url, ok: false, error: String(e2?.message || e2) };
    }
  }
}

function systemPrompt() {
  return [
    "Ești botul LucyOFM – Analize meciuri.",
    "FORMAT OBLIGATORIU: 10 puncte, cu ✅ (consens), ⚠️ (riscuri), 📊 (statistici), 🎯 (recomandări).",
    "Fără caractere asiatice. Fără cuvântul «Simbol». Ton: ferm, concis, profesionist.",
    "Reguli:",
    "- Nu inventa; folosește DOAR textul extras. Dacă sursele se contrazic, marchează cu ⚠️ și explică.",
    "- Dacă o sursă indică X2, nu transforma în 1/12.",
    "- La început listează ce spune fiecare sursă (cu ✅ dacă ≥3 susțin aceeași idee).",
    "- La final oferă 3–5 recomandări 🎯 pe linii separate.",
    "- Dacă n-ai text din surse: «Date insuficiente din surse – analiză bazată pe model»."
  ].join("\n");
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metoda nu este permisă" });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "Lipsește OPENAI_API_KEY" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const home = (body.home || "").trim();
    const away = (body.away || "").trim();
    let urls = Array.isArray(body.urls) ? body.urls.filter(Boolean) : [];

    if (!home || !away) return res.status(400).json({ error: "Câmpurile 'home' și 'away' sunt obligatorii" });

    // 1) dacă nu ai dat URL-uri, caut eu
    if (urls.length === 0) {
      urls = await autoFindSources(home, away);
    }

    // 2) scrape
    const scraped = [];
    for (const u of urls.slice(0, 6)) scraped.push(await scrapeUrl(u));

    const diag = scraped.map(s =>
      s.ok ? `OK  ${s.proxied ? "(proxy)" : ""}  ${s.url}` : `FAIL ${s.url}\nEroare: ${s.error}`
    ).join("\n");

    const sourcesBlock = scraped
      .filter(s => s.ok && s.text)
      .map(s => `SRC ${s.proxied ? "(proxy)" : ""}: ${s.url}\n${s.text}`)
      .join("\n\n---\n\n");

    const messages = [
      { role: "system", content: systemPrompt() },
      {
        role: "user",
        content: [
          `Meci: ${home} vs ${away}`,
          urls.length ? `Surse încercate (${urls.length}):\n${urls.join("\n")}` : "Nu s-au furnizat URL-uri.",
          "# DIAGNOSTIC SCRAPING",
          diag || "(fără)",
          "",
          "# TEXT EXTRAS DIN SURSE",
          sourcesBlock || "(niciun text disponibil)"
        ].join("\n")
      }
    ];

    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages
    });

    const text = r.choices?.[0]?.message?.content || "(fără conținut)";
    return res.status(200).json({
      ok: true,
      home, away,
      tried: urls,
      scraped: scraped.map(s => ({ url: s.url, ok: s.ok, proxied: !!s.proxied, error: s.error || null })),
      result: text
    });
  } catch (e) {
    console.error("Eroare chat:", e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
};
