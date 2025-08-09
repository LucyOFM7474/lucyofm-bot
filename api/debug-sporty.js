// api/debug-sporty.js
import axios from "axios";
import * as cheerio from "cheerio";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const t = (s) => String(s || "").replace(/\s+/g, " ").trim();

function parseSportyTrader(html, url) {
  const $ = cheerio.load(html);
  let prediction = "";
  const predH2 = $('h2:contains("Pronosticul nostru"), h2:contains("Predicția noastră"), h2:contains("Our prediction")').first();
  if (predH2.length) {
    const box = predH2.parent();
    const candidates = box.find("p, div, span, strong, em").toArray().map(el => t($(el).text())).filter(Boolean);
    const pick = candidates.find(x => /va câștiga|câștigă meciul|câștigă|will win|X2|1X|12|or draw|double chance/i.test(x));
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
  return { url, prediction: t(prediction) };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
    const { url } = req.body || {};
    if (!url) { res.status(400).json({ error: "url is required (SportyTrader match page)" }); return; }
    const { data } = await axios.get(url, { headers: { "User-Agent": UA } });
    const out = parseSportyTrader(String(data || ""), url);
    res.status(200).json({ ok: true, ...out });
  } catch (err) { res.status(500).json({ ok: false, error: err?.message || String(err) }); }
}
