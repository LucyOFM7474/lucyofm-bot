// ÎNLOCUIEȘTE CODUL – api/fetchSources.js
import axios from 'axios';
import * as cheerio from 'cheerio';

const SCRAPER_KEY = process.env.SCRAPER_API_KEY || ''; // cheia ScraperAPI din Vercel
const TIMEOUT = 25000;

// --- 1) Helper: ia HTML (cu sau fără ScraperAPI) ---
async function getHTML(url) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Accept-Language': 'ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7',
  };

  if (SCRAPER_KEY) {
    const apiUrl = `https://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(url)}&keep_headers=true`;
    const { data } = await axios.get(apiUrl, { timeout: TIMEOUT, headers });
    return typeof data === 'string' ? data : String(data || '');
  }

  const { data } = await axios.get(url, { timeout: TIMEOUT, headers });
  return typeof data === 'string' ? data : String(data || '');
}

// --- 2) Construiește linkuri către surse ---
function buildSourceUrls(slugOrUrl) {
  if (/^https?:\/\//i.test(slugOrUrl)) {
    return [{ key: 'sportytrader', url: slugOrUrl }];
  }
  const slug = String(slugOrUrl).trim().replace(/^\/+|\/+$/g, '');
  return [
    { key: 'sportytrader', url: `https://www.sportytrader.com/ro/pronosticuri/${slug}/` },
    { key: 'predictz',     url: `https://www.predictz.com/predictions/${slug}/` },
    { key: 'forebet',      url: `https://www.forebet.com/en/predictions/${slug}` },
    { key: 'windrawwin',   url: `https://www.windrawwin.com/tips/${slug}/` },
  ];
}

// --- 3) Parsere pentru fiecare sursă ---
function parseSportyTrader(html, url) {
  const $ = cheerio.load(html);
  const title = $('h1').first().text().trim() || $('title').text().trim();
  const metaDesc = $('meta[name="description"]').attr('content') || '';
  const date = $('[itemprop="startDate"]').attr('content') || $('time').first().attr('datetime') || '';

  let teams = title.includes(' - ') ? title.split(' - ') : title.split(' vs ');
  teams = teams.map(s => s.trim());
  const teamsObj = teams.length >= 2 ? { home: teams[0], away: teams[1] } : null;

  const picks = [];
  $('section,div,article').each((_, el) => {
    const t = $(el).text().trim();
    if (/pronostic|predict(i|ii)e|pont|pariuri/i.test(t) && t.length > 80) {
      picks.push(t.replace(/\s+/g, ' ').slice(0, 400));
    }
  });

  return { source: 'SportyTrader', url, title, date, teams: teamsObj, synopsis: metaDesc, picks };
}

function parsePredictZ(html, url) {
  const $ = cheerio.load(html);
  const title = $('h1').first().text().trim() || $('title').text().trim();
  const metaDesc = $('meta[name="description"]').attr('content') || '';

  const predictionText =
    $('strong:contains("Prediction")').parent().text().trim() ||
    $('b:contains("Prediction")').parent().text().trim();

  const scoreText = ($('strong').filter((_, el) => /\d+\s*-\s*\d+/.test($(el).text())).first().text().trim()) || '';

  const picks = [];
  if (predictionText) picks.push(predictionText.replace(/\s+/g, ' '));
  if (scoreText) picks.push(`Score: ${scoreText}`);

  return { source: 'PredictZ', url, title, synopsis: metaDesc, picks, date: '', teams: null };
}

function parseForebet(html, url) {
  const $ = cheerio.load(html);
  const title = $('h1').first().text().trim() || $('title').text().trim();

  const prediction =
    $('td:contains("Prediction")').first().next().text().trim() ||
    $('div.prediction, span.prediction').first().text().trim();

  const picks = [];
  if (prediction) picks.push(prediction.replace(/\s+/g, ' '));

  const odds = [];
  $('table,div').each((_, el) => {
    const txt = $(el).text();
    if (/1X2|odds|cote/i.test(txt) && txt.length > 30) {
      odds.push(txt.replace(/\s+/g, ' ').trim().slice(0, 200));
    }
  });

  return { source: 'Forebet', url, title, picks, odds, synopsis: '', date: '', teams: null };
}

function parseWinDrawWin(html, url) {
  const $ = cheerio.load(html);
  const title = $('h1').first().text().trim() || $('title').text().trim();

  const predictionBlock = $('div:contains("Prediction")').first().text().trim();
  const picks = [];
  if (predictionBlock) picks.push(predictionBlock.replace(/\s+/g, ' '));

  const form = [];
  $('table tr').each((_, tr) => {
    const row = $(tr).text().replace(/\s+/g, ' ').trim();
    if (/Form/i.test(row)) form.push(row);
  });

  return { source: 'WinDrawWin', url, title, picks, form, synopsis: '', date: '', teams: null };
}

// --- 4) Agregator ---
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
      let data = null;
      switch (it.key) {
        case 'sportytrader': data = parseSportyTrader(html, it.url); results.sportytrader = data; break;
        case 'predictz': data = parsePredictZ(html, it.url); results.predictz = data; break;
        case 'forebet': data = parseForebet(html, it.url); results.forebet = data; break;
        case 'windrawwin': data = parseWinDrawWin(html, it.url); results.windrawwin = data; break;
        default: break;
      }
    } catch (e) {
      // dacă o sursă pică, o să o ignore și continuă cu restul
    }
  }

  return results;
}
