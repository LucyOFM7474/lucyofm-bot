// api/chat.js — scraping prin proxy pentru domeniile blocate + 10 puncte ✅⚠️📊🎯
const { OpenAI } = require("openai");
const cheerio = require("cheerio");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BLOCKED_DOMAINS = ["sportytrader.com","predictz.com","forebet.com","windrawwin.com"];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

function needsProxy(url) {
  try { const h = new URL(url).hostname.replace(/^www\./,""); return BLOCKED_DOMAINS.some(d => h.endsWith(d)); }
  catch { return false; }
}
function proxyUrl(url) {
  const key = process.env.SCRAPER_API_KEY;
  if (!key) return null;
  const u = encodeURIComponent(url);
  // compat ScraperAPI (sau similar). render=true ajută la site-uri JS.
  return `https://api.scraperapi.com?api_key=${key}&url=${u}&render=true&country_code=eu`;
}

async function safeFetch(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, signal: controller.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

function extractText(html, max = 24000) {
  const $ = cheerio.load(html);
  ["script","style","noscript","nav","footer","header","aside","svg"].forEach(s => $(s).remove());
  const chunks = [];
  $("h1,h2,h3,h4,p,li,td,th,article,section").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t && t.length > 30) chunks.push(t);
  });
  let txt = chunks.join("\n");
  if (txt.length > max) txt = txt.slice(0, max);
  return txt;
}

async function scrape(url) {
  if (!url) return { url, ok:false, error:"URL gol" };
  const mustProxy = needsProxy(url);
  const via = proxyUrl(url);
  try {
    if (mustProxy && via) {
      const html = await safeFetch(via);
      return { url, ok:true, proxied:true, text: extractText(html) };
    }
    try {
      const html = await safeFetch(url);
      return { url, ok:true, proxied:false, text: extractText(html) };
    } catch (e1) {
      if (!via) throw e1;
      const html2 = await safeFetch(via);
      return { url, ok:true, proxied:true, text: extractText(html2) };
    }
  } catch (err) {
    return { url, ok:false, error:String(err?.message||err) };
  }
}

function systemPrompt() {
  return [
    "Ești LucyOFM – Analize meciuri.",
    "FORMAT: 10 puncte cu ✅ (consens), ⚠️ (riscuri), 📊 (statistici), 🎯 (recomandări).",
    "Fără caractere asiatice. Ton: concis, ferm, profesionist.",
    "Reguli: respectă sursele, nu inventa; dacă se contrazic, marchează cu ⚠️ și explică; finalizează cu 3–5 recomandări 🎯.",
    "Dacă sursele sunt slabe, spune clar «Date insuficiente din surse – analiză bazată pe model»."
  ].join("\n");
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error:"Metoda nu este permisă" });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error:"Lipsește OPENAI_API_KEY" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body||"{}") : (req.body||{});
    const home = (body.home||"").trim();
    const away = (body.away||"").trim();
    const urls = Array.isArray(body.urls) ? body.urls.filter(Boolean).slice(0,6) : [];
    if (!home || !away) return res.status(400).json({ error:"Câmpurile 'home' și 'away' sunt obligatorii" });

    // scrape toate sursele
    const scraped = [];
    for (const u of urls) scraped.push(await scrape(u));

    const sourcesBlock = scraped.length
      ? scraped.map(s => s.ok
          ? `SRC ${s.proxied?"(proxy)":""}: ${s.url}\n${s.text}`
          : `SRC: ${s.url}\n[EROARE: ${s.error}]`
        ).join("\n\n---\n\n")
      : "(fără surse furnizate)";

    const messages = [
      { role:"system", content: systemPrompt() },
      { role:"user", content: `Meci: ${home} vs ${away}\n\nSursa(e):\n${urls.join("\n") || "(none)"}\n\nTEXT EXTRAS DIN SURSE:\n${sourcesBlock}` }
    ];

    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages
    });

    const text = r.choices?.[0]?.message?.content || "(fără conținut)";
    return res.status(200).json({
      ok:true, home, away,
      sourcesTried: urls,
      scraped: scraped.map(s => ({ url:s.url, ok:s.ok, proxied:!!s.proxied, error:s.error||null, preview: (s.text||"").slice(0,160) })),
      result: text
    });
  } catch (e) {
    console.error("Eroare chat:", e);
    return res.status(500).json({ error:String(e?.message||e) });
  }
};
