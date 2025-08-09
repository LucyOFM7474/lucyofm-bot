// api/chat.js — scraping din surse + analiză în 10 puncte ✅⚠️📊🎯
// CommonJS (compat Vercel). ENV: OPENAI_API_KEY (obligatoriu), SCRAPER_API_KEY (opțional, recomandat)

const { OpenAI } = require("openai");
const cheerio = require("cheerio");

// --- OpenAI ---
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Helpers ---
async function safeFetch(url, timeoutMs = 12000, headers = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        "accept": "text/html,application/xhtml+xml",
        ...headers
      },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function viaProxy(url) {
  const key = process.env.SCRAPER_API_KEY;
  if (!key) return null;
  // ScraperAPI format (sau compatibil): https://api.scraperapi.com?api_key=KEY&url=ENCODED
  const encoded = encodeURIComponent(url);
  return `https://api.scraperapi.com?api_key=${key}&url=${encoded}&render=false&country_code=eu`;
}

function extractReadableText(html, maxLen = 20000) {
  const $ = cheerio.load(html);
  ["script","style","noscript","nav","footer","header","aside"].forEach(s => $(s).remove());
  // unele site-uri ascund în aria/role; selectăm blocuri semnificative
  const parts = [];
  $("h1,h2,h3,h4,p,li,td,th").each((_, el) => {
    const txt = $(el).text().replace(/\s+/g, " ").trim();
    if (txt && txt.length > 30) parts.push(txt);
  });
  let text = parts.join("\n");
  if (text.length > maxLen) text = text.slice(0, maxLen);
  return text;
}

async function scrapeOne(url) {
  if (!url) return { url, ok: false, error: "URL gol" };
  try {
    // mai întâi direct
    try {
      const html = await safeFetch(url);
      return { url, ok: true, text: extractReadableText(html) };
    } catch (e1) {
      // apoi prin proxy dacă e disponibil
      const prox = viaProxy(url);
      if (!prox) throw e1;
      const html2 = await safeFetch(prox, 15000);
      return { url, ok: true, text: extractReadableText(html2), proxied: true };
    }
  } catch (err) {
    return { url, ok: false, error: String(err?.message || err) };
  }
}

function systemPrompt() {
  return [
    "Ești botul LucyOFM – Analize meciuri.",
    "FORMAT OBLIGATORIU: 10 puncte, cu ✅ (consens), ⚠️ (riscuri), 📊 (statistici), 🎯 (recomandări de jucat).",
    "Fără caractere asiatice. Fără cuvântul «Simbol». Ton: concis, profesionist, ferm.",
    "Reguli:",
    "- Nu inventa predicții; respectă ce spun sursele. Dacă se contrazic, marchează cu ⚠️ și explică.",
    "- Dacă o sursă sugerează X2, nu o transforma în 1 sau 12.",
    "- La început listează clar ce zice fiecare sursă (✅ când există consens între ≥3 surse).",
    "- Final: 3–5 recomandări 🎯 pe linii separate (ex: 1X2, under/over, BTTS, cornere).",
    "- Dacă sursele nu pot fi citite: menționează «Date insuficiente din surse – analiză bazată pe model».",
  ].join("\n");
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metoda nu este permisă" });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Lipsește OPENAI_API_KEY" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const home = (body.home || "").trim();
    const away = (body.away || "").trim();
    const urls = Array.isArray(body.urls) ? body.urls.filter(Boolean).slice(0, 6) : [];

    if (!home || !away) {
      return res.status(400).json({ error: "Câmpurile 'home' și 'away' sunt obligatorii" });
    }

    // 1) Scrape surse (direct → proxy dacă e nevoie)
    const scraped = [];
    for (const u of urls) scraped.push(await scrapeOne(u));

    // 2) Construiește context din surse
    const sourcesBlock = scraped.length
      ? scraped.map(s => s.ok
          ? `SRC ${s.proxied ? "(proxy)" : ""}: ${s.url}\n${s.text}`
          : `SRC: ${s.url}\n[EROARE la citire: ${s.error}]`
        ).join("\n\n---\n\n")
      : "(fără surse furnizate)";

    // 3) Prompt
    const messages = [
      { role: "system", content: systemPrompt() },
      {
        role: "user",
        content: [
          `Meci: ${home} vs ${away}`,
          urls.length ? `Sursa(e):\n${urls.join("\n")}` : "Nu s-au furnizat URL-uri.",
          "TEXT EXTRAS DIN SURSE (folosește DOAR ce e aici, nu inventa concluzii):",
          sourcesBlock
        ].join("\n\n")
      }
    ];

    // 4) OpenAI
    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: messages
    });

    const text = r.choices?.[0]?.message?.content || "(fără conținut)";

    // 5) Răspuns
    return res.status(200).json({
      ok: true,
      home, away,
      sourcesTried: urls,
      scraped: scraped.map(s => ({ url: s.url, ok: s.ok, proxied: !!s.proxied, error: s.error || null })),
      result: text
    });
  } catch (e) {
    console.error("Eroare chat:", e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
};
