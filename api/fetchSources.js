// api/fetchSources.js — ÎNLOCUIEȘTE CODUL
// Citește surse externe (SportyTrader, PredictZ, Forebet, WinDrawWin)
// și extrage cât mai exact predicțiile. Robust la variații de HTML.

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
    { key: "predictz",     url: `https://www.predictz.com/predictions/${slug}/` },
    { key: "forebet",      url: `https://www.forebet.com/en/predictions/${slug}` },
    { key: "windrawwin",   url: `https://www.windrawwin.com/tips/${slug}/` },
  ];
}

/* =========================
   Parsere pe fiecare sursă
   ========================= */

function parseSportyTrader(html, url) {
  const $ = cheerio.load(html);

  const title = ($("h1").first().text() || $("title").text() || "").trim();
  const metaDesc = $('meta[name="description"]').attr("content") || "";
  const date =
    $('[itemprop="startDate"]').attr("content") ||
    $("time").first().attr("datetime") ||
    "";

  // Echipe din titlu (heuristic)
  let teams = title.includes(" - ") ? title.split(" - ") : title.split(" vs ");
  teams = teams.map((s) => s.trim());
  const teamsObj = teams.length >= 2 ? { home: teams[0], away: teams[1] } : null;

  // 1) „Puncte cheie” – secțiunea numerotată
  const keyPoints = [];
  $(":contains('Puncte cheie')")
    .filter((_, el) => /Puncte cheie/i.test($(el).text()))
    .each((_, anchor) => {
      // după acest heading, luăm lista/box-ul următor
      let box = $(anchor).parent();
      // fallback: căutăm următoarele elemente cu numere 1…5/10
      const texts = [];
      box.find("*").each((_, e) => {
        const t = $(e).text().trim();
        if (/^\d+\s/.test(t) && t.length > 10) texts.push(t.replace(/\s+/g, " "));
      });
      if (!texts.length) {
        // alt fallback: scan global după item-uri numerotate aproape de anchor
        $(anchor)
          .nextAll()
          .slice(0, 10)
          .each((_, e) => {
            const t = $(e).text().trim();
            if (/^\d+\s/.test(t) && t.length > 10) texts.push(t.replace(/\s+/g, " "));
          });
      }
      texts.slice(0, 10).forEach((t) => keyPoints.push(t));
    });

  // 2) „Pronosticul/Predicția noastră” – text exact
  // Căutăm heading-uri paragrafe care conțin „Pronosticul nostru” / „Predicția noastră”
  let prediction = "";
  const predAnchors = $(":contains('Pronosticul nostru'), :contains('Predicția noastră')")
    .filter((_, el) => /Pronosticul nostru|Predicția noastră/i.test($(el).text()));

  if (predAnchors.length) {
    predAnchors.each((_, el) => {
      // Luăm textul din blocul următor sau din același container
      const blk =
        $(el).next().text().trim() ||
        $(el).parent().next().text().trim() ||
        $(el).closest("section,article,div").text().trim();
      if (blk && blk.length > 40 && !prediction) {
        prediction = blk.replace(/\s+/g, " ");
      }
    });
  }

  // 3) Căutăm explicit un bloc cu „Predicție:” / „Predicție” lângă un buton/box albastru
  if (!prediction) {
    const nearPred = $(":contains('Predicție')")
      .filter((_, el) => /Predicție/i.test($(el).text()))
      .first()
      .closest("section,article,div");
    if (nearPred && nearPred.length) {
      const t = nearPred.text().replace(/\s+/g, " ").trim();
      // extragem propoziția dominantă
      const m = t.match(/Predic(ție|tia)[^:]*:\s*([^.]+)\.?/i);
      if (m && m[2]) prediction = m[2].trim();
    }
  }

  // 4) Fallback general pentru „picks”: blocuri care menționează pronostic/pont/pariuri
  const picks = [];
  $("section,div,article").each((_, el) => {
    const t = $(el).text().trim();
    if (/pronostic|predict(i|ii)e|pont|pariuri/i.test(t) && t.length > 100) {
      picks.push(t.replace(/\s+/g, " ").slice(0, 400));
    }
  });

  return {
    source: "SportyTrader",
    url,
    title,
    date,
    teams: teamsObj,
    synopsis: metaDesc,
    keyPoints,
    prediction, // <- textul exact („Câștigă Millwall sau egal” etc.)
    picks,
  };
}

function parsePredictZ(html, url) {
  const $ = cheerio.load(html);
  const title = ($("h1").first().text() || $("title").text() || "").trim();
  const metaDesc = $('meta[name="description"]').attr("content") || "";

  const predictionText =
    $('strong:contains("Prediction")').parent().text().trim() ||
    $('b:contains("Prediction")').parent().text().trim();

  const scoreText =
    $("strong")
      .filter((_, el) => /\d+\s*-\s*\d+/.test($(el).text()))
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
    date: "",
    teams: null,
  };
}

function parseForebet(html, url) {
  const $ = cheerio.load(html);
  const title = ($("h1").first().text() || $("title").text() || "").trim();

  const prediction =
    $('td:contains("Prediction")').first().next().text().trim() ||
    $("div.prediction, span.prediction").first().text().trim();

  const picks = [];
  if (prediction) picks.push(prediction.replace(/\s+/g, " "));

  const odds = [];
  $("table,div").each((_, el) => {
    const txt = $(el).text();
    if (/1X2|odds|cote/i.test(txt) && txt.length > 30) {
      odds.push(txt.replace(/\s+/g, " ").trim().slice(0, 200));
    }
  });

  return {
    source: "Forebet",
    url,
    title,
    picks,
    odds,
    prediction: prediction || "",
    synopsis: "",
    date: "",
    teams: null,
  };
}

function parseWinDrawWin(html, url) {
  const $ = cheerio.load(html);
  const title = ($("h1").first().text() || $("title").text() || "").trim();

  const predictionBlock = $('div:contains("Prediction")').first().text().trim();
  const picks = [];
  if (predictionBlock) picks.push(predictionBlock.replace(/\s+/g, " "));

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
    prediction: predictionBlock || "",
    synopsis: "",
    date: "",
    teams: null,
  };
}

/* =========================
   Agregator
   ========================= */

export async function fetchAllSources(slugOrUrl) {
  const items = buildSourceUrls(slugOrUrl);

  const results = {
    sportytrader: null,
    predictz: null,
    forebet: null,
    windrawwin: null,
  };

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
      // ignorăm individual; continuăm cu ce avem
    }
  }

  return results;
}
