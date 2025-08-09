
// api/chat.mjs — MVP: citește URL-urile primite, extrage textul, face analiza în 10 puncte.
// Fără MongoDB (poate fi adăugat ulterior). ESM + Vercel Node runtime.
//
// ENV necesar în Vercel: OPENAI_API_KEY

import { OpenAI } from "openai";
import * as cheerio from "cheerio";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Fetch cu timeouts sigure */
async function safeFetch(url, opts = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 12000);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        "accept": "text/html,application/xhtml+xml"
      },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

/** Extrage text „curat” din HTML, redus ca mărime */
function extractReadableText(html, maxLen = 20000) {
  const $ = cheerio.load(html);
  // Elimină script/style/nav/aside/footer/ads
  ["script","style","noscript","nav","footer","header","aside"].forEach(sel => $(sel).remove());
  // Încercăm să luăm doar p, li, h1-h4, table celule
  let parts = [];
  $("h1,h2,h3,h4,p,li,td,th").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t && t.length > 30) parts.push(t);
  });
  let text = parts.join("\n");
  // Taie textul enorm
  if (text.length > maxLen) text = text.slice(0, maxLen);
  return text;
}

/** Pipeline: citește URL-urile → extrage textul → întoarce map {url, text} */
async function scrapeSources(urls = []) {
  const out = [];
  for (const url of urls) {
    if (!url || typeof url !== "string") continue;
    try {
      const html = await safeFetch(url);
      const text = extractReadableText(html);
      out.push({ url, ok: true, text });
    } catch (err) {
      out.push({ url, ok: false, error: String(err?.message || err) });
    }
  }
  return out;
}

function buildSystemPrompt() {
  return [
    "Ești botul LucyOFM – Analize meciuri.",
    "FORMAT OBLIGATORIU (fundal negru, text alb în UI; tu livrezi doar text):",
    "10 puncte, cu simboluri: ✅ (consens puternic), ⚠️ (atenție/riscuri), 📊 (statistici), 🎯 (recomandări de jucat).",
    "Fără caractere asiatice. Fără mențiunea «Simbol».",
    "Fii concis, ferm, profesionist. Spune lucrurilor pe nume.",
    "",
    "INTRĂRI:",
    "- Home, Away (echipe).",
    "- Extrase text din surse (PredictZ, Forebet, WinDrawWin, SportyTrader sau ce dă userul).",
    "",
    "REGULI:",
    "- Nu inventa predicții: dacă sursele se contrazic, marchează cu ⚠️ și explică.",
    "- Dacă o sursă sugerează X2, NU transforma în 1 sau 12.",
    "- Listează clar, la început, ce zic sursele (cu ✅/⚠️).",
    "- La final, dă 3–5 recomandări clare de jucat (🎯), fiecare pe o linie.",
    "- Dacă sursele lipsesc sau sunt slabe, spune explicit «Date insuficiente din surse – analiză bazată pe model».",
    "- Fără cote inventate; dacă nu ai cote, nu le pune."
  ].join("\n");
}

export default async (req, res) => {
  // CORS & metode
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
    const urls = Array.isArray(body.urls) ? body.urls.slice(0, 6) : []; // max 6 surse

    if (!home || !away) {
      return res.status(400).json({ error: "Câmpurile 'home' și 'away' sunt obligatorii" });
    }

    // 1) Scrape surse (dacă sunt date)
    const scraped = await scrapeSources(urls);

    // 2) Pregătește contextul pentru model
    const sourcesSummary = scraped.map(s =>
      s.ok
        ? `SRC: ${s.url}\n${s.text}`
        : `SRC: ${s.url}\n[EROARE LA CITIRE: ${s.error}]`
    ).join("\n\n---\n\n");

    // 3) Prompt către model (strict pe baza textului extras)
    const messages = [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content: [
          `Meci: ${home} vs ${away}`,
          urls?.length ? `Sursa(e) primită(e):\n${urls.join("\n")}` : "Nu s-au furnizat URL-uri de surse.",
          scraped.length ? "Mai jos ai TEXTUL EXTRAS din surse (nu inventa concluzii contradictorii):" : "Nu există text din surse – fă o analiză conservatoare.",
          sourcesSummary || "(fără conținut disponibil)"
        ].join("\n\n")
      }
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages
    });

    const out = completion.choices?.[0]?.message?.content || "Nu am putut genera analiza.";
    return res.status(200).json({
      ok: true,
      home, away,
      sourcesTried: urls,
      result: out
    });
  } catch (err) {
    console.error("Eroare API:", err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
};
