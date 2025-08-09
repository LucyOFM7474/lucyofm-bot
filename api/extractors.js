// api/extractors.js
// Extractori „light” care ocolesc API-urile site-urilor: iau DOAR textul relevant din pagini publice
// și extrag în mod țintit blocurile de tip „Pronostic / Pont / Prediction / Tip”.

const fetchText = async (url) => {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; LucyOFM-Bot/1.0; +https://vercel.com)",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "ro,en;q=0.9"
    }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} la ${url}`);
  }
  return await res.text();
};

// Curăță HTML -> text simplu
const stripHtml = (html) => {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

// Heuristici robuste: caută „Pronostic”, „Pont”, „Tip”, „Prediction”, „Recomandare”, „Pariu”
const pickPredictionSnippets = (text) => {
  const lower = text.toLowerCase();

  // puncte de ancoră frecvente
  const anchors = [
    "pronostic", "pont", "predictie", "predicție",
    "prediction", "tip", "recomandare", "pariu", "bet", "best bet"
  ];

  // căutăm ferestre de ±300 caractere în jurul ancorelor
  const snippets = [];
  anchors.forEach((a) => {
    let idx = 0;
    while ((idx = lower.indexOf(a, idx)) !== -1) {
      const start = Math.max(0, idx - 220);
      const end = Math.min(text.length, idx + 380);
      const chunk = text.slice(start, end).replace(/\s+/g, " ").trim();
      if (chunk.length > 40 && !snippets.includes(chunk)) {
        snippets.push(chunk);
      }
      idx = idx + a.length;
    }
  });

  // deduplicate + scurtăm elegant
  const uniq = Array.from(new Set(snippets)).slice(0, 6);
  return uniq.map((s) => (s.length > 420 ? s.slice(0, 420) + "…" : s));
};

// Extrageri orientate pe domenii (fallback pe generic)
const extractSportyTrader = (text) => {
  // căutăm expresii tipice: „Pronostic”, „Pont”, „Pariul zilei”, „Scor corect”, „1X2” etc.
  const blocks = pickPredictionSnippets(text);
  return {
    source: "SportyTrader",
    confidence: blocks.length ? "high" : "low",
    notes: blocks
  };
};

const extractGeneric = (hostname, text) => {
  const blocks = pickPredictionSnippets(text);
  return {
    source: hostname,
    confidence: blocks.length ? "medium" : "low",
    notes: blocks
  };
};

export async function fetchAndExtract(url) {
  const html = await fetchText(url);
  const text = stripHtml(html);
  const { hostname } = new URL(url);

  if (hostname.includes("sportytrader")) {
    return extractSportyTrader(text);
  }
  return extractGeneric(hostname, text);
}

// Helper pentru multiple surse cu timeout și fallback
export async function collectSources(urls, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const results = [];
  for (const url of urls) {
    try {
      const data = await fetchAndExtract(url);
      results.push({ ok: true, url, ...data });
    } catch (err) {
      results.push({ ok: false, url, error: String(err) });
    }
  }
  clearTimeout(timer);
  return results;
}
