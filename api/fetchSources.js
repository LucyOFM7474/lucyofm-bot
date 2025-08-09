// api/fetchSources.js (CommonJS)
const axios = require("axios");
const cheerio = require("cheerio");

const TIMEOUT = 25000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const t = (s) => String(s || "").replace(/\s+/g, " ").trim();

async function httpGet(url) {
  const { data, status } = await axios.get(url, {
    timeout: TIMEOUT,
    headers: { "User-Agent": UA, "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8" },
    validateStatus: (st) => st >= 200 && st < 500,
  });
  if (status >= 400) throw new Error(`GET ${status}`);
  return String(data || "");
}

const normalize = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const slugify = (s) => normalize(s).toLowerCase().replace(/\s+/g, "-");

function sportyCandidates(home, away) {
  const h = slugify(home), a = slugify(away);
  return [
    `https://www.sportytrader.com/ro/pronosticuri/${h}-${a}/`,
    `https://www.sportytrader.com/ro/pronosticuri/${a}-${h}/`,
    `https://www.sportytrader.com/ro/pronosticuri/${h}-vs-${a}/`,
    `https://www.sportytrader.com/ro/pronosticuri/${a}-vs-${h}/`,
  ];
}
function predictzCandidates(home, away) {
  const h = slugify(home), a = slugify(away);
  return [
    `https://www.predictz.com/predictions/${h}-vs-${a}/`,
    `https://www.predictz.com/predictions/${a}-vs-${h}/`,
  ];
}
function forebetCandidates(home, away) {
  const h = slugify(home), a = slugify(away);
  return [
    `https://www.forebet.com/en/predictions/${h}-${a}`,
    `https://www.forebet.com/en/predictions/${a}-${h}`,
  ];
}

function parseSportyTrader(html, url) {
  const $ = cheerio.load(html);
  const title = t($("h1").first().text()) || t($("title").text());

  let prediction = "";
  const predH2 = $('h2:contains("Pronosticul nostru"), h2:contains("Predicția noastră"), h2:contains("Our prediction")').first();
  if (predH2.length) {
    const box = predH2.parent();
    const candidates = box.find("p, div, span, strong, em").toArray()
      .map((el) => t($(el).text()))
      .filter(Boolean);
    const pick = candidates.find((x) =>
      /va câștiga|câștigă meciul|câștigă|will win|X2|1X|12|or draw|double chance/i.test(x)
    );
    if (pick) prediction = pick;
  }
  if (!prediction) {
    const full = t($("body").text());
    const mChance = full.match(/\b(X2|1X|12)\b/i);
    const mWin = full.match(/([A-Z][A-Za-z0-9 .'\-]{2,40})\s+(va\s+câștiga|câștigă|will\s+win)\s+(meciul|match)/i);
    const mVict = full.match(/victorie\s+([A-Z][A-Za-z0-9 .'\-]{2,40})/i);
    if (mWin) prediction = `${mWin[1]} câștigă meciul`;
    else if (mVict) prediction = `Victorie ${mVict[1]}`;
    else if (mChance) prediction = mChance[1].toUpperCase();
  }
  return { source: "SportyTrader", url, title, prediction: t(prediction) };
}

function parsePredictZ(html, url) {
  const $ = cheerio.load(html);
  const title = t($("h1").first().text()) || t($("title").text());
  let prediction = "";
  const strongPred = $('strong:contains("Prediction")').parent().text();
  const bPred = $('b:contains("Prediction")').parent().text();
  prediction = t(strongPred || bPred);
  if (!prediction) {
    const body = t($("body").text());
    const m = body.match(/Prediction\s*:\s*([^\n]+)$/im);
    if (m) prediction = t(m[1]);
  }
  return { source: "PredictZ", url, title, prediction: t(prediction) };
}

function parseForebet(html, url) {
  const $ = cheerio.load(html);
  const title = t($("h1").first().text()) || t($("title").text());
  let prediction = "";
  const tdPred = $("td:contains('Prediction')").first().next().text();
  const divPred = $("div.prediction, span.prediction").first().text();
  prediction = t(tdPred || divPred);
  if (!prediction) {
    const body = t($("body").text());
    const m = body.match(/Prediction\s*:\s*([^\n]+)$/im);
    if (m) prediction = t(m[1]);
  }
  return { source: "Forebet", url, title, prediction: t(prediction) };
}

async function resolveAndParse(candidates, parser) {
  for (const url of candidates) {
    try {
      const html = await httpGet(url);
      if (!html || html.length < 1500) continue;
      const data = parser(html, url);
      if (data && (data.prediction || data.title)) return { ok: true, ...data };
    } catch {}
  }
  return { ok: false };
}

async function getSources({ homeTeam, awayTeam, urls }) {
  const h = normalize(homeTeam || "Gazda");
  const a = normalize(awayTeam || "Oaspeții");

  const googleLink = (domain) =>
    `https://www.google.com/search?q=site%3A${encodeURIComponent(domain)}+${encodeURIComponent(h)}+${encodeURIComponent(a)}+pronostic+predictii`;

  let sporty;
  if (urls?.sportytrader) {
    const html = await httpGet(urls.sportytrader);
    sporty = parseSportyTrader(html, urls.sportytrader);
    sporty.ok = true;
  } else {
    sporty = await resolveAndParse(sportyCandidates(h, a), parseSportyTrader);
    if (!sporty?.url) sporty = { ...sporty, url: googleLink("sportytrader.com") };
  }

  let predictz;
  if (urls?.predictz) {
    const html = await httpGet(urls.predictz);
    predictz = parsePredictZ(html, urls.predictz);
    predictz.ok = true;
  } else {
    predictz = await resolveAndParse(predictzCandidates(h, a), parsePredictZ);
    if (!predictz?.url) predictz = { ...predictz, url: googleLink("predictz.com") };
  }

  let forebet;
  if (urls?.forebet) {
    const html = await httpGet(urls.forebet);
    forebet = parseForebet(html, urls.forebet);
    forebet.ok = true;
  } else {
    forebet = await resolveAndParse(forebetCandidates(h, a), parseForebet);
    if (!forebet?.url) forebet = { ...forebet, url: googleLink("forebet.com") };
  }

  return {
    teams: { home: h, away: a },
    sources: { sportytrader: sporty, predictz, forebet },
    links: {
      sportytrader: sporty?.url || googleLink("sportytrader.com"),
      predictz: predictz?.url || googleLink("predictz.com"),
      forebet: forebet?.url || googleLink("forebet.com"),
    },
  };
}

// HTTP handler
module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
    const { homeTeam, awayTeam, urls } = req.body || {};
    if (!homeTeam || !awayTeam) { res.status(400).json({ error: "homeTeam and awayTeam are required" }); return; }
    const out = await getSources({ homeTeam, awayTeam, urls });
    res.status(200).json({ ok: true, ...out });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
};

// export pentru alte module CommonJS
module.exports.getSources = getSources;
