// api/fetchSources.js — STRICT PARSER
import axios from "axios";
import * as cheerio from "cheerio";

const SCRAPER_KEY = process.env.SCRAPER_API_KEY || "";
const TIMEOUT = 25000;

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

function buildSourceUrls(slugOrUrl) {
  if (/^https?:\/\//i.test(slugOrUrl)) {
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

// ---------- PARSERS STRICTE ----------
function parseSportyTrader(html, url) {
  const $ = cheerio.load(html);
  const title = $("h1").first().text().trim() || $("title").text().trim();
  const metaDesc = $('meta[name="description"]').attr("content") || "";
  const date =
    $('[itemprop="startDate"]').attr("content") || $("time").first().attr("datetime") || "";

  // echipe (heuristic)
  let teams = title.includes(" - ") ? title.split(" - ") : title.split(" vs ");
  teams = teams.map((s) => s.trim());
  const teamsObj = teams.length >= 2 ? { home: teams[0], away: teams[1] } : null;

  // „Puncte cheie …” – listă numerotată
  const keyPoints = [];
  $('[class*="key"], h2:contains("Puncte cheie"), h3:contains("Puncte cheie")')
    .parent()
    .find("li")
    .each((_, li) => {
      const t = $(li).text().replace(/\s+/g, " ").trim();
      if (t) keyPoints.push(t);
    });
  // fallback: căutăm blocul care conține „Puncte cheie”
  if (keyPoints.length === 0) {
    $('*:contains("Puncte cheie")')
      .parent()
      .find("li")
      .each((_, li) => {
        const t = $(li).text().replace(/\s+/g, " ").trim();
        if (t) keyPoints.push(t);
      });
  }

  // „Pronosticul/Predicția noastră …” – blocul imediat următor
  let prediction = "";
  const predAnchor = $('*:matchesOwn(/Pronosticul nostru|Predic(ț|t)ia noastr(ă|a)|Predic(ț|t)ie/i)')
    .first()
    .closest("section,article,div");
  if (predAnchor && predAnchor.length) {
    const text = predAnchor.text().replace(/\s+/g, " ").trim();
    prediction = text;
  } else {
    // fallback: căutăm „Predicție:” într-un <strong>/<b>
    const txt =
      $('strong:contains("Predic")').first().parent().text().trim() ||
      $('b:contains("Predic")').first().parent().text().trim();
    prediction = txt.replace(/\s+/g, " ");
  }

  // picks (scurte) pentru agregare
  const picks = [];
  if (prediction) picks.push(prediction);
  if (metaDesc) picks.push(metaDesc);

  return {
    source: "SportyTrader",
    url,
    title,
    date,
    teams: teamsObj,
    keyPoints,
    prediction, // text brut – îl interpretăm în chat.js
    picks,
    synopsis: metaDesc,
  };
}

function parsePredictZ(html, url) {
  const $ = cheerio.load(html);
  const title = $("h1").first().text().trim() || $("title").text().trim();
  const metaDesc = $('meta[name="description"]').attr("content") || "";

  const predictionText =
    $('strong:contains("Prediction")').parent().text().trim() ||
    $('b:contains("Prediction")').parent().text().trim();

  const scoreText =
    $("strong")
      .filter((_, el) => /\b\d+\s*-\s*\d+\b/.test($(el).text()))
      .first()
      .text()
      .trim() || "";

  const picks = [];
  if (predictionText) picks.push(predictionText.replace(/\s+/g, " "));
  if (scoreText) picks.push(`Score: ${scoreText}`);

  return {
    source: "PredictZ",
    url,
    title,
    synopsis: metaDesc,
    picks,
    prediction: predictionText || "",
    score: scoreText || "",
  };
}

function parseForebet(html, url) {
  const $ = cheerio.load(html);
  const title = $("h1").first().text().trim() || $("title").text().trim();

  const prediction =
    $('td:contains("Prediction")').first().next().text().trim() ||
    $("div.prediction, span.prediction").first().text().trim();

  const odds = [];
  $("table,div").each((_, el) => {
    const txt = $(el).text();
    if (/1X2|odds|cote/i.test(txt) && txt.length > 30) {
      odds.push(txt.replace(/\s+/g, " ").trim().slice(0, 240));
    }
  });

  const picks = [];
  if (prediction) picks.push(prediction.replace(/\s+/g, " "));

  return {
    source: "Forebet",
    url,
    title,
    picks,
    odds,
    prediction: prediction || "",
  };
}

function parseWinDrawWin(html, url) {
  const $ = cheerio.load(html);
  const title = $("h1").first().text().trim() || $("title").text().trim();

  const block = $('div:contains("Prediction")').first().text().trim();
  const picks = [];
  if (block) picks.push(block.replace(/\s+/g, " "));

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
    form,
    prediction: block || "",
  };
}

export async function fetchAllSources(slugOrUrl) {
  const items = buildSourceUrls(slugOrUrl);
  const results = { sportytrader: null, predictz: null, forebet: null, windrawwin: null };

  for (const it of items) {
    try {
      const html = await getHTML(it.url);
      switch (it.key) {
        case "sportytrader":
          results.sportytrader = parseSportyTrader(html, it.url);
          break;
        case "predictz":
          results.predictz = parsePredictZ(html, it.url);
          break;
        case "forebet":
          results.forebet = parseForebet(html, it.url);
          break;
        case "windrawwin":
          results.windrawwin = parseWinDrawWin(html, it.url);
          break;
      }
    } catch {
      // lăsăm null dacă eșuează
    }
  }
  return results;
}
