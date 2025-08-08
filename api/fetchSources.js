// api/fetchSources.js — ÎNLOCUIEȘTE CODUL
import axios from "axios";
import * as cheerio from "cheerio";

const SCRAPER_KEY = process.env.SCRAPER_API_KEY || "";
const TIMEOUT = 25000;

// ---------------- HTTP (cu/fără ScraperAPI) ----------------
async function getHTML(url) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7",
  };
  if (SCRAPER_KEY) {
    const apiUrl = `https://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(
      url
    )}&keep_headers=true`;
    const { data } = await axios.get(apiUrl, { timeout: TIMEOUT, headers });
    return typeof data === "string" ? data : String(data || "");
  }
  const { data } = await axios.get(url, { timeout: TIMEOUT, headers });
  return typeof data === "string" ? data : String(data || "");
}

// ---------------- URL builder ----------------
function buildSourceUrls(slugOrUrl) {
  if (/^https?:\/\//i.test(slugOrUrl)) {
    // dacă e link direct, îl tratăm ca SportyTrader
    return [{ key: "sportytrader", url: slugOrUrl }];
  }
  const slug = String(slugOrUrl).trim().replace(/^\/+|\/+$/g, "");
  return [
    { key: "sportytrader", url: `https://www.sportytrader.com/ro/pronosticuri/${slug}/` },
    { key: "predictz", url: `https://www.predictz.com/predictions/${slug}/` },
    { key: "forebet", url: `https://www.forebet.com/en/predictions/${slug}` },
    { key: "windrawwin", url: `https://www.windrawwin.com/tips/${slug}/` },
  ];
}

// ---------------- Parsere ----------------
function textClean(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function parseSportyTrader(html, url) {
  const $ = cheerio.load(html);
  const title = $("h1").first().text().trim() || $("title").text().trim();
  const metaDesc = $('meta[name="description"]').attr("content") || "";
  const date =
    $('[itemprop="startDate"]').attr("content") || $("time").first().attr("datetime") || "";

  // Echipe din titlu
  let teams = title.includes(" - ") ? title.split(" - ") : title.split(" vs ");
  teams = teams.map((s) => s.trim());
  const teamsObj = teams.length >= 2 ? { home: teams[0], away: teams[1] } : null;

  // --- 1) Puncte cheie (blocul numerotat 1..5) ---
  const keyPoints = [];
  // căutăm heading „Puncte cheie” (RO/EN) și luăm elementele enumerate din secțiunea următoare
  $('h2:contains("Puncte cheie"), h2:contains("Key points")')
    .first()
    .parent()
    .find("li, .list li, p")
    .each((_, el) => {
      const t = textClean($(el).text());
      if (t && /\d/.test(t)) keyPoints.push(t);
    });
  if (!keyPoints.length) {
    // fallback: căutăm „Puncte cheie” ca text și colectăm paragrafele din container
    $('*:contains("Puncte cheie")')
      .filter((_, el) => /Puncte cheie/i.test($(el).text()))
      .first()
      .parent()
      .find("li, p")
      .each((_, el) => {
        const t = textClean($(el).text());
        if (t) keyPoints.push(t);
      });
  }

  // --- 2) Predicția noastră (blocul cu butonul „Predicție”) ---
  let prediction = "";
  // căutăm heading „Pronosticul nostru / Predicția noastră / Our prediction”
  const predSection =
    $('h2:contains("Pronosticul nostru"), h2:contains("Predicția noastră"), h2:contains("Our prediction")')
      .first()
      .parent();
  if (predSection && predSection.length) {
    // textul din paragraf + eventual butonul „Predicție”
    const paragraph = textClean(predSection.find("p").first().text());
    // buton/box cu textul predicției
    const btnText =
      textClean(
        predSection
          .find('button, a, div:contains("Predic")')
          .filter((_, el) => /Predic/i.test($(el).text()))
          .first()
          .text()
      ) || "";
    prediction = btnText || paragraph;
  }
  if (!prediction) {
    // fallback global: orice text „Predicție:” vizibil pe pagină
    prediction = textClean($('*:contains("Predicție")').first().text());
  }

  // Adunăm câteva „picks” (inclusiv predicția) pentru uniformizare
  const picks = [];
  if (prediction) picks.push(prediction);
  keyPoints.slice(0, 5).forEach((pp) => picks.push(pp));

  return {
    source: "SportyTrader",
    url,
    title,
    date,
    teams: teamsObj,
    synopsis: metaDesc,
    keyPoints,
    prediction, // <- câmp fix, cu „X2 / victorie / etc.”
    picks,
  };
}

function parsePredictZ(html, url) {
  const $ = cheerio.load(html);
  const title = $("h1").first().text().trim() || $("title").text().trim();
  const metaDesc = $('meta[name="description"]').attr("content") || "";
  const predictionText =
    $('strong:contains("Prediction")').parent().text().trim() ||
    $('b:contains("Prediction")').parent().text().trim();
  const scoreText = ($("strong")
    .filter((_, el) => /\d+\s*-\s*\d+/.test($(el).text()))
    .first()
    .text()
    .trim()) || "";
  const picks = [];
  if (predictionText) picks.push(textClean(predictionText));
  if (scoreText) picks.push(`Score: ${scoreText}`);
  return {
    source: "PredictZ",
    url,
    title,
    synopsis: metaDesc,
    picks,
    prediction: predictionText ? textClean(predictionText) : "",
    date: "",
    teams: null,
  };
}

function parseForebet(html, url) {
  const $ = cheerio.load(html);
  const title = $("h1").first().text().trim() || $("title").text().trim();
  const prediction =
    $("td:contains('Prediction')").first().next().text().trim() ||
    $("div.prediction, span.prediction").first().text().trim();
  const picks = [];
  if (prediction) picks.push(textClean(prediction));
  const odds = [];
  $("table,div").each((_, el) => {
    const txt = $(el).text();
    if (/1X2|odds|cote/i.test(txt) && txt.length > 30) {
      odds.push(textClean(txt).slice(0, 200));
    }
  });
  return {
    source: "Forebet",
    url,
    title,
    picks,
    prediction: prediction ? textClean(prediction) : "",
    odds,
    synopsis: "",
    date: "",
    teams: null,
  };
}

function parseWinDrawWin(html, url) {
  const $ = cheerio.load(html);
  const title = $("h1").first().text().trim() || $("title").text().trim();
  const predictionBlock = $("div:contains('Prediction')").first().text().trim();
  const picks = [];
  if (predictionBlock) picks.push(textClean(predictionBlock));
  const form = [];
  $("table tr").each((_, tr) => {
    const row = $(tr).text().replace(/\s+/g, " ").trim();
    if (/Form/i.test(row)) form.push(row);
  });
  return {
    source: "WinDrawWin",
    url,
    title,
    picks,
    prediction: predictionBlock ? textClean(predictionBlock) : "",
    form,
    synopsis: "",
    date: "",
    teams: null,
  };
}

// ---------------- Agregator ----------------
export async function fetchAllSources(slugOrUrl) {
  const items = buildSourceUrls(slugOrUrl);
  const results = { sportytrader: null, predictz: null, forebet: null, windrawwin: null };

  for (const it of items) {
    try {
      const html = await getHTML(it.url);
      let data = null;
      switch (it.key) {
        case "sportytrader":
          data = parseSportyTrader(html, it.url);
          results.sportytrader = data;
          break;
        case "predictz":
          data = parsePredictZ(html, it.url);
          results.predictz = data;
          break;
        case "forebet":
          data = parseForebet(html, it.url);
          results.forebet = data;
          break;
        case "windrawwin":
          data = parseWinDrawWin(html, it.url);
          results.windrawwin = data;
          break;
        default:
          break;
      }
    } catch {
      // ignorăm sursa care pică; continuăm cu restul
    }
  }
  return results;
}
