// api/chat.js
// Rol: primește cereri de analiză, citește sursele externe, apelează OpenAI și salvează în MongoDB.
// Versiune: v1.2 – PATCH: parsing robust, dată opțională, GET permis pentru debug, max_completion_tokens pentru GPT-5.

const axios = require("axios");
const dayjs = require("dayjs");
const { saveAnalysis, saveFeedback } = require("./db");

// —————————————— Config ——————————————
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // OBLIGATORIU
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o"; // setează în Vercel OPENAI_MODEL=gpt-5 dacă ai acces
const BOT_URL = process.env.BOT_URL; // ex: https://lucyofm-bot.vercel.app

if (!OPENAI_API_KEY) {
  console.warn("⚠️  Lipsă OPENAI_API_KEY în Environment Variables.");
}
if (!BOT_URL) {
  console.warn("⚠️  Lipsă BOT_URL – fetchSources va folosi fallback minimal.");
}

// —————————————— Utils ——————————————
const trimOne = (s = "") => String(s).replace(/\s+/g, " ").trim();

function parseMatchParts(match = "") {
  const parts = String(match)
    .split(/-|–|—|vs|:/i)
    .map((s) => trimOne(s))
    .filter(Boolean);
  if (parts.length >= 2) return { home: parts[0], away: parts[1] };
  return { home: "", away: "" };
}

function normalizeTeams({ match, home, away }) {
  let _home = trimOne(home || "");
  let _away = trimOne(away || "");
  if ((!_home || !_away) && match) {
    const p = parseMatchParts(match);
    _home = _home || p.home;
    _away = _away || p.away;
  }
  return { home: _home, away: _away };
}

function normalizeDate(dateStr) {
  if (!dateStr) return null;
  const raw = String(dateStr).trim();
  if (!raw || /^z{2}\.?\s?l{2}\.?\s?a{4}$/i.test(raw)) return null;
  if (dayjs(raw, "YYYY-MM-DD", true).isValid()) return dayjs(raw).format("YYYY-MM-DD");
  if (dayjs(raw, "DD.MM.YYYY", true).isValid()) return dayjs(raw, "DD.MM.YYYY").format("YYYY-MM-DD");
  if (dayjs(raw, "DD/MM/YYYY", true).isValid()) return dayjs(raw, "DD/MM/YYYY").format("YYYY-MM-DD");
  return null;
}

function buildPrompt({ match, scheduledDate, sources }) {
  const takeaways = (sources.summary?.keyTakeaways || []).slice(0, 4).join(" • ");
  const sampleOdds = (sources.summary?.sampleOdds || []).slice(0, 6).join(", ");

  const sys = `
Ești "LucyOFM – Grok4 Personalizat", expert în analize de meciuri pentru pariori profesioniști.
Scrii în română, stil profesional, concis, direct.
Reguli:
- Fără caractere asiatice.
- Structură fixă în 10 puncte, cu simboluri: ✅, ⚠️, 📊, 🎯.
- Include surse verificate (ex. SportyTrader) cu consens (✅) sau opinii divergente (⚠️).
- Listează toate opțiunile valide (ex: GG, 1X&GG, câștigă repriză) cu cote separate.
- Statistici: posesie, cornere, cartonașe, faulturi (acasă/deplasare) – dacă lipsesc, marchează lipsa și estimează prudent.
- Evită erorile de lot.
- Încheie cu 3–5 recomandări (🎯) cu motivație scurtă.
`.trim();

  const user = `
Meci: ${match}${scheduledDate ? ` (data: ${scheduledDate})` : ""}

Context:
- Takeaways: ${takeaways || "—"}
- Cote: ${sampleOdds || "—"}
- Sursa: SportyTrader

Livrează FIX structura în 10 puncte conform regulilor.
`.trim();

  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}

async function askOpenAI(messages) {
  const url = "https://api.openai.com/v1/chat/completions";
  const headers = {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  };
  const body = {
    model: OPENAI_MODEL,
    messages,
    temperature: 0.3,
    max_completion_tokens: 1200 // <- modificat pentru GPT-5
  };
  const resp = await axios.post(url, body, { headers, timeout: 30000 });
  return resp.data?.choices?.[0]?.message?.content?.trim() || "";
}

async function fetchExternalSources({ match, home, away, date }) {
  if (BOT_URL) {
    const url = `${BOT_URL.replace(/\/+$/, "")}/api/fetchSources`;
    const resp = await axios.post(url, { match, home, away, date }, { timeout: 15000 });
    return resp.data || {};
  }
  return {
    meta: { fetchedAt: new Date().toISOString(), home, away, scheduledDate: date, sourceUrls: {} },
    summary: { keyTakeaways: [], sampleOdds: [] },
    sportytrader: { error: "BOT_URL_MISSING" },
  };
}

// —————————————— Handler ——————————————
module.exports = async (req, res) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const payload = req.method === "POST" ? (req.body || {}) : (req.query || {});
    const { action } = payload;

    // Feedback
    if (String(action).toLowerCase() === "feedback") {
      const match = trimOne(payload.match || "");
      const feedback = trimOne(payload.feedback || "");
      if (!match || !feedback) {
        return res.status(400).json({ error: "Parametri insuficienți pentru feedback" });
      }
      await saveFeedback(match, feedback);
      return res.status(200).json({ ok: true, message: "Feedback salvat" });
    }

    // Analiză
    const matchRaw = trimOne(payload.match || "");
    const { home, away } = normalizeTeams({
      match: matchRaw,
      home: payload.home,
      away: payload.away,
    });

    if (!home || !away) {
      return res.status(400).json({
        error: "Parametri insuficienți",
        details: "Format corect: 'Gazde - Oaspeți'.",
        received: { match: matchRaw },
      });
    }

    const scheduledDate = normalizeDate(payload.date);
    const matchLabel = `${home} - ${away}${scheduledDate ? ` (${scheduledDate})` : ""}`;

    let sources;
    try {
      sources = await fetchExternalSources({ match: `${home} - ${away}`, home, away, date: scheduledDate });
    } catch {
      sources = { summary: { keyTakeaways: [], sampleOdds: [] }, sportytrader: { error: "FETCH_FAIL" } };
    }

    const messages = buildPrompt({ match: matchLabel, scheduledDate, sources });
    const analysis = await askOpenAI(messages);

    try {
      await saveAnalysis(matchLabel, analysis);
    } catch (e) {
      console.warn("⚠️ Salvare MongoDB eșuată:", e.message);
    }

    return res.status(200).json({
      ok: true,
      match: matchLabel,
      model: OPENAI_MODEL,
      sourcesMeta: sources?.meta || {},
      analysis,
    });
  } catch (error) {
    const code = error?.response?.status || 500;
    const details = error?.response?.data || error?.message || "Unknown";
    console.error("chat.js error:", details);
    return res.status(code).json({
      error: "INTERNAL_ERROR",
      details: typeof details === "string" ? details : JSON.stringify(details),
    });
  }
};
