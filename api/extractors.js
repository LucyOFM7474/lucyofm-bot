// api/extractors.js
// Extractori „light” pentru site-uri populare. Ocolesc API-urile și iau DOAR textul relevant (predicții).
// Domenii: SportyTrader, PredictZ, Forebet, WinDrawWin, Betsloaded (+ fallback generic).

const UA = "Mozilla/5.0 (compatible; LucyOFM-Bot/1.0; +https://vercel.com)";

const fetchText = async (url) => {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "ro,en;q=0.9"
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} la ${url}`);
  return await res.text();
};

const stripHtml = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Heuristici: ferestre scurte în jurul ancorelor semantice.
const pickPredictionSnippets = (text, extraAnchors = []) => {
  const anchors = [
    "pronostic", "pont", "predictie", "predicție", "prediction",
    "tip", "picks", "pick", "recomandare", "pariu", "bet",
    "1x2", "btts", "both teams to score", "over", "under",
    "main pick", "best bet", "value bet", "correct score",
    ...extraAnchors
  ];
  const lower = text.toLowerCase();
  const out = [];
  for (const a of anchors) {
    let i = 0;
    while ((i = lower.indexOf(a, i)) !== -1) {
      const start = Math.max(0, i - 260);
      const end = Math.min(text.length, i + 420);
      const chunk = text.slice(start, end).replace(/\s+/g, " ").trim();
      if (chunk.length > 40) out.push(chunk);
      i += a.length;
    }
  }
  // deduplicate + limit
  const uniq = Array.from(new Set(out));
  return uniq.slice(0, 8).map(s => (s.length > 440 ? s.slice(0, 440) + "…" : s));
};

// Domeniu: SportyTrader
const extractSportyTrader = (text) => {
  const blocks = pickPredictionSnippets(text, [
    "pariul zilei", "analiza meciului", "ponturi", "pont principal"
  ]);
  return { source: "SportyTrader", confidence: blocks.length ? "high" : "low", notes: blocks };
};

// Domeniu: PredictZ (de obicei are „Prediction: 2-1”, „Tips”, „Home Win/Draw/Away Win”)
const extractPredictZ = (text) => {
  const blocks = pickPredictionSnippets(text, [
    "prediction:", "predicția:", "home win", "away win", "draw",
    "tip:", "tips:", "correct score"
  ]);
  return { source: "PredictZ", confidence: blocks.length ? "medium-high" : "low", notes: blocks };
};

// Domeniu: Forebet (conține „Forebet prediction”, scor probabil, 1X2, over/under)
const extractForebet = (text) => {
  const blocks = pickPredictionSnippets(text, [
    "forebet", "forebet prediction", "probable score", "over/under", "1x2"
  ]);
  return { source: "Forebet", confidence: blocks.length ? "medium-high" : "low", notes: blocks };
};

// Domeniu: WinDrawWin (are „WinDrawWin Pick”, „Main Pick”, „Under/Over Tips”)
const extractWinDrawWin = (text) => {
  const blocks = pickPredictionSnippets(text, [
    "windrawwin pick", "main pick", "under/over", "btts", "correct score"
  ]);
  return { source: "WinDrawWin", confidence: blocks.length ? "medium" : "low", notes: blocks };
};

// Domeniu: Betsloaded (adesea „Pick: Over 2.5”, „Best Bet”, „Confidence”)
const extractBetsloaded = (text) => {
  const blocks = pickPredictionSnippets(text, [
    "pick:", "best bet", "confidence", "value", "over", "under", "btts"
  ]);
  return { source: "Betsloaded", confidence: blocks.length ? "medium" : "low", notes: blocks };
};

const extractGeneric = (hostname, text) => {
  const blocks = pickPredictionSnippets(text);
  return { source: hostname, confidence: blocks.length ? "medium" : "low", notes: blocks };
};

export async function fetchAndExtract(url) {
  const html = await fetchText(url);
  const text = stripHtml(html);
  const { hostname } = new URL(url);
  const h = hostname.toLowerCase();

  if (h.includes("sportytrader")) return extractSportyTrader(text);
  if (h.includes("predictz"))    return extractPredictZ(text);
  if (h.includes("forebet"))     return extractForebet(text);
  if (h.includes("windrawwin"))  return extractWinDrawWin(text);
  if (h.includes("betsloaded"))  return extractBetsloaded(text);

  return extractGeneric(hostname, text);
}

export async function collectSources(urls, timeoutMs = 10000) {
  const results = [];
  for (const url of urls.slice(0, 8)) {
    try {
      const data = await fetchAndExtract(url);
      results.push({ ok: true, url, ...data });
    } catch (err) {
      results.push({ ok: false, url, error: String(err) });
    }
  }
  return results;
}
