// api/chat.js
import axios from "axios";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const TIMEOUT = 30000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const t = (s) => String(s || "").replace(/\s+/g, " ").trim();

async function fetchSourcesViaAPI({ homeTeam, awayTeam, urls }) {
  const base = process.env.BOT_URL || "http://localhost:3000";
  const url = `${base}/api/fetchSources`;
  const { data } = await axios.post(url, { homeTeam, awayTeam, urls }, {
    timeout: TIMEOUT,
    headers: { "User-Agent": UA, "Content-Type": "application/json" },
    validateStatus: (st) => st >= 200 && st < 500,
  });
  if (!data?.ok) throw new Error(data?.error || "fetchSources failed");
  return data;
}

function formatSourceLine(name, pred) {
  const clean = t(pred || "");
  return clean ? `${name} — ${clean}` : `${name} — Date indisponibile`;
}

function buildPrompt({ homeTeam, awayTeam, matchDate, sources }) {
  const sSporty   = formatSourceLine("SportyTrader", sources?.sportytrader?.prediction);
  const sPredictz = formatSourceLine("PredictZ",    sources?.predictz?.prediction);
  const sForebet  = formatSourceLine("Forebet",     sources?.forebet?.prediction);

  const system = `
Ești un analist disciplinat. Reguli:
- Folosești EXCLUSIV textele furnizate din surse, fără invenții.
- Română, fără caractere asiatice.
- EXACT 10 puncte, fiecare pe rând nou, cu simboluri: ✅ ⚠️ 📊 🎯 (fără cuvântul "Simbol").
- Punctul 1 reproduce textual liniile de mai jos (nu reformula).
- Menții ordinea echipelor: ${homeTeam} vs ${awayTeam}.
- Dacă lipsesc date, scrie "Date indisponibile".
`.trim();

  const user = `
Meci: ${homeTeam} vs ${awayTeam}
Data: ${matchDate || "Date indisponibile"}

SURSE & PREDICȚII (TEXT EXACT):
- ${sSporty}
- ${sPredictz}
- ${sForebet}

Scrie analiză în EXACT 10 puncte:
1) ✅ Surse & Predicții — SportyTrader — ${sources?.sportytrader?.prediction ? t(sources.sportytrader.prediction) : "Date indisponibile"} | PredictZ — ${sources?.predictz?.prediction ? t(sources.predictz.prediction) : "Date indisponibile"} | Forebet — ${sources?.forebet?.prediction ? t(sources.forebet.prediction) : "Date indisponibile"}
2) 📊 Medie/Consens (doar din cele 3 surse; dacă nu e consens, scrie "Dispersie" sau "Date insuficiente").
3) 📊 Impact pe pronostic (dacă nu ai date reale: "Date indisponibile").
4) 📊 Formă recentă (ultimele 5) — "Date indisponibile" dacă nu există.
5) 📊 Absențe — "Date indisponibile" dacă nu există.
6) 📊 Golgheteri/penalty — "Date indisponibile" dacă nu există.
7) 📊 Statistici: posesie, cornere, galbene, faulturi — "Date indisponibile" dacă lipsesc.
8) 📊 Tendințe & cote — doar dacă sunt în surse, altfel "Date indisponibile".
9) ⚠️ Riscuri specifice — "Date indisponibile" dacă nu știi.
10) 🎯 Recomandări finale (3–5 selecții) — STRICT pe consensul 1–2; dacă nu e consens: "Date insuficiente pentru recomandări".
`.trim();

  return { system, user };
}

async function askOpenAI({ system, user }) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
  const body = { model: MODEL, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.2, max_tokens: 1100 };
  const { data } = await axios.post(`${OPENAI_BASE_URL}/chat/completions`, body, {
    timeout: TIMEOUT,
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    validateStatus: (st) => st >= 200 && st < 500,
  });
  if (!data?.choices?.[0]?.message?.content) throw new Error("OpenAI response invalid");
  return data.choices[0].message.content;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
    const { homeTeam, awayTeam, matchDate, urls } = req.body || {};
    if (!homeTeam || !awayTeam) { res.status(400).json({ error: "homeTeam and awayTeam are required" }); return; }

    const src = await fetchSourcesViaAPI({ homeTeam: t(homeTeam), awayTeam: t(awayTeam), urls });
    const { system, user } = buildPrompt({
      homeTeam: t(homeTeam), awayTeam: t(awayTeam), matchDate: t(matchDate || ""),
      sources: { sportytrader: src?.sources?.sportytrader || null, predictz: src?.sources?.predictz || null, forebet: src?.sources?.forebet || null }
    });

    const analysis = await askOpenAI({ system, user });
    res.status(200).json({ ok: true, analysis: t(analysis), sources: src?.sources || {}, links: src?.links || {} });
  } catch (err) { res.status(500).json({ ok: false, error: err?.message || String(err) }); }
}
