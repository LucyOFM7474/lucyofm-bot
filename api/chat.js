// api/chat.js (CommonJS)
const axios = require("axios");
const { getSources } = require("./fetchSources.js");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const TIMEOUT = 30000;
const t = (s) => String(s || "").replace(/\s+/g, " ").trim();

function fmt(name, pred){ const c=t(pred||""); return c?`${name} — ${c}`:`${name} — Date indisponibile`; }

function buildPrompt({ homeTeam, awayTeam, matchDate, sources }) {
  const s1 = fmt("SportyTrader", sources?.sportytrader?.prediction);
  const s2 = fmt("PredictZ",     sources?.predictz?.prediction);
  const s3 = fmt("Forebet",      sources?.forebet?.prediction);

  const system = `
Ești analist strict. Reguli:
- Folosești doar textele furnizate; nu inventa.
- Română, fără caractere asiatice.
- EXACT 10 puncte cu simboluri ✅ ⚠️ 📊 🎯.
- Punctul 1 reproduce textual liniile din surse (nu reformula).
- Menții ordinea: ${homeTeam} vs ${awayTeam}.
- Dacă lipsesc date: "Date indisponibile".
`.trim();

  const user = `
Meci: ${homeTeam} vs ${awayTeam}
Data: ${matchDate || "Date indisponibile"}

SURSE (TEXT EXACT):
- ${s1}
- ${s2}
- ${s3}

Scrie în EXACT 10 puncte:
1) ✅ Surse & Predicții — ${s1} | ${s2} | ${s3}
2) 📊 Medie/Consens (doar din cele 3 surse; dacă nu e consens: "Dispersie" / "Date insuficiente").
3) 📊 Impact pe pronostic — "Date indisponibile" dacă nu ai date.
4) 📊 Formă (ultimele 5) — "Date indisponibile".
5) 📊 Absențe — "Date indisponibile".
6) 📊 Golgheteri/penalty — "Date indisponibile".
7) 📊 Statistici: posesie, cornere, galbene, faulturi — "Date indisponibile".
8) 📊 Tendințe & cote — "Date indisponibile".
9) ⚠️ Riscuri specifice — "Date indisponibile".
10) 🎯 Recomandări finale (3–5) — STRICT pe consensul 1–2; fără invenții.
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

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
    const { homeTeam, awayTeam, matchDate, urls } = req.body || {};
    if (!homeTeam || !awayTeam) { res.status(400).json({ error: "homeTeam and awayTeam are required" }); return; }

    const src = await getSources({ homeTeam: t(homeTeam), awayTeam: t(awayTeam), urls });
    const { system, user } = buildPrompt({
      homeTeam: t(homeTeam), awayTeam: t(awayTeam), matchDate: t(matchDate || ""), sources: src?.sources || {}
    });
    const analysis = await askOpenAI({ system, user });

    res.status(200).json({ ok: true, analysis: t(analysis), sources: src?.sources || {}, links: src?.links || {} });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
};
