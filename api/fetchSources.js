// api/fetchSources.js
// Rol: colectează date din surse externe (SportyTrader în principal) și le normalizează pentru prompt.
// Notă: rulează server-side pe Vercel, deci CORS nu te afectează aici.

const axios = require("axios");
const cheerio = require("cheerio");
const dayjs = require("dayjs");

// —————————————— Utilitare ——————————————
function removeDiacritics(str = "") {
  // elimină diacriticele românești și alte accente
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ăâ]/gi, "a")
    .replace(/[î]/gi, "i")
    .replace(/[șş]/gi, "s")
    .replace(/[țţ]/gi, "t");
}

function slugifyTeam(name = "") {
  return removeDiacritics(String(name))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildSportyTraderUrl(home = "", away = "") {
  const formatted = `${slugifyTeam(home)}-${slugifyTeam(away)}`;
  // IMPORTANT: exact format cerut anterior de tine
  return `https://www.sportytrader.com/ro/pronosticuri/${formatted}/`;
}

// caută text util în pagină fără să depindem 100% de clase fragile
function extractSportyTrader($) {
  const out = {};

  // titlu
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("title").text().trim() ||
    $("h1").first().text().trim();
  if (title) out.title = title;

  // meta descriere
  const description =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content");
  if (description) out.description = description.trim();

  // încearcă să găsești o secțiune cu pronostic
  let prediction = "";
  $('[class*="pronostic"], [class*="prediction"], h2, h3, p, li').each((_, el) => {
    const t = $(el).text().trim();
    if (!prediction && /pronostic|pont|pariuri|prediction/i.test(t) && t.length < 240) {
      prediction = t;
    }
  });
  if (prediction) out.predictionSnippet = prediction;

  // caută cote (foarte aproximativ)
  const odds = [];
  $('table, div, section')
    .find("td, span, strong, b")
    .each((_, el) => {
      const v = $(el).text().trim();
      if (/^\d+(\.\d{1,2})?$/.test(v)) {
        const num = parseFloat(v);
        if (num >= 1.2 && num <= 20) odds.push(num);
      }
    });
  if (odds.length) out.sampleOdds = [...new Set(odds)].slice(0, 10);

  return out;
}

// fallback simplu dacă scraping-ul eșuează
function fallbackSource(home, away) {
  return {
    title: `${home} vs ${away} – date limitate`,
    description:
      "Nu am putut extrage conținutul complet din sursa externă. Folosesc fallback minimal.",
    predictionSnippet: "Verifică forma echipelor, absențele și cotele curente.",
    sampleOdds: [],
  };
}

// —————————————— Handler Vercel ——————————————
module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    // Acceptă fie body JSON (POST), fie query (GET)
    const payload = req.method === "POST" ? req.body || {} : req.query || {};
    const { match, home, away, date } = payload;

    // Parsare simplă “Home-Away” dacă a venit în câmpul match
    let _home = home;
    let _away = away;

    if (match && (!home || !away)) {
      // separatori uzuali
      const parts = String(match).split(/-|vs|–|—|:/i).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        _home = _home || parts[0];
        _away = _away || parts[1];
      }
    }

    if (!_home || !_away) {
      return res.status(400).json({
        error: "Parametri insuficienți",
        details: "Trebuie să specifici cel puțin echipele: home și away (sau match = 'Home - Away').",
      });
    }

    const scheduled = date ? dayjs(date).format("YYYY-MM-DD") : null;
    const stUrl = buildSportyTraderUrl(_home, _away);

    // timeout agresiv ca să nu blocheze funcția
    const http = axios.create({
      timeout: 8000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      // acceptă gzip/deflate implicit
      maxRedirects: 2,
      validateStatus: (s) => s >= 200 && s < 400,
    });

    let sportyData;
    try {
      const resp = await http.get(stUrl);
      const $ = cheerio.load(resp.data);
      sportyData = extractSportyTrader($);
    } catch (err) {
      sportyData = fallbackSource(_home, _away);
      sportyData.error = "SPORTY_FETCH_ERROR";
    }

    // Alte surse (opțional – le lăsăm pregătite pentru extindere)
    // const predictzUrl = "...";
    // const forebetUrl = "...";
    // TODO: adăugăm când ai OK pentru scraping extins

    const normalized = {
      meta: {
        fetchedAt: new Date().toISOString(),
        scheduledDate: scheduled,
        home: _home,
        away: _away,
        sourceUrls: {
          sportytrader: stUrl,
          // predictz: predictzUrl,
          // forebet: forebetUrl,
        },
      },
      sources: {
        sportytrader: sportyData,
        // predictz: predictzData,
        // forebet: forebetData,
      },
      // rezumat minimal ce poate intra în prompt ca “context real”
      summary: {
        keyTakeaways: [
          sportyData?.predictionSnippet || "Nu există un pronostic clar extras automat.",
          sportyData?.title || "Titlu limitat",
        ].filter(Boolean),
        sampleOdds: sportyData?.sampleOdds || [],
      },
    };

    // Cache scurt pentru a nu spama sursa
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=300");
    return res.status(200).json(normalized);
  } catch (error) {
    console.error("fetchSources error:", error?.message);
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      details: error?.message || "Unknown",
    });
  }
};
