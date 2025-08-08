// api/fetchSources.js — CommonJS
// Încearcă SportyTrader (RO). Dacă nu găsește, întoarce items:[] fără a arunca eroare.

const cheerio = require("cheerio");

// normalizează text pentru slug (fără diacritice)
function slugify(s) {
  return (s || "")
    .toString()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // fără diacritice
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function trySportyTrader(homeTeam, awayTeam) {
  const formatted = slugify(`${homeTeam}-${awayTeam}`);
  const url = `https://www.sportytrader.com/ro/pronosticuri/${formatted}/`;

  try {
    const r = await fetch(url, { method: "GET", redirect: "follow" });
    if (!r.ok) return null; // 404/other: renunțăm politicos

    const html = await r.text();
    const $ = cheerio.load(html);

    // Căutăm un heading/predictie; fallback: titlul paginii
    const title = ($("h1").first().text() || $("title").first().text() || "").trim();
    // Nu riscăm "predicția" — site-ul se schimbă des; lăsăm doar titlul + url
    return {
      source: "SportyTrader",
      title: title || "Pagină pronostic",
      url,
      prediction: null,
      confidence: null
    };
  } catch {
    return null; // niciodată nu aruncăm – doar null
  }
}

module.exports = async function fetchSources({ homeTeam, awayTeam }) {
  const items = [];
  const st = await trySportyTrader(homeTeam, awayTeam);
  if (st) items.push(st);

  return { items };
};
