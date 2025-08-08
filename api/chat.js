// api/chat.js
// Rol: primește cereri de analiză, citește sursele externe, apelează OpenAI și salvează în MongoDB.
// Versiune: v1.1 – PATCH: parsing robust al meciului, dată opțională/ignorată dacă e invalidă, GET permis pentru debug.

const axios = require("axios");
const dayjs = require("dayjs");
const { saveAnalysis, saveFeedback } = require("./db");

// —————————————— Config ——————————————
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // OBLIGATORIU
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o"; // setează în Vercel OPENAI_MODEL=gpt-5 dacă ai acces
const BOT_URL = process.env.BOT_URL; // ex: https://lucyofm-bot.vercel.app (recomandat pentru /api/fetchSources)

if (!OPENAI_API_KEY) {
  console.warn("⚠️  Lipsă OPENAI_API_KEY în Environment Variables.");
}
if (!BOT_URL) {
  console.warn("⚠️  Lipsă BOT_URL (folosit pentru apel intern /api/fetchSources). Se va folosi fallback minimal.");
}

// —————————————— Utils ——————————————
const trimOne = (s = "") => String(s).replace(/\s+/g, " ").trim();

function parseMatchParts(match = "") {
  // Acceptă delimitatori: -, –, —, vs, :
  const parts = String(match)
    .split(/-|–|—|vs|:/i)
    .map((s) => trimOne(s))
    .filter(Boolean);

  // Dacă sunt mai mult de 2 segmente (ex. nume cu liniuțe), păstrăm primele două non-goale
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
  // Acceptă ISO (YYYY-MM-DD) sau formate RO/UE: DD.MM.YYYY, DD/MM/YYYY
  if (!dateStr) return null;
  const raw = String(dateStr).trim();

  // Dacă e goala sau placeholder tipic, ignoră
  if (!raw || /^z{2}\.?\s?l{2}\.?\s?a{4}$/i.test(raw)) return null;

  // ISO direct
  if (dayjs(raw, "YYYY-MM-DD", true).isValid()) {
    return dayjs(raw).format("YYYY-MM-DD");
  }

  // DD.MM.YYYY
  if (dayjs(raw, "DD.MM.YYYY", true).isValid()) {
    return dayjs(raw, "DD.MM.YYYY").format("YYYY-MM-DD");
  }

  // DD/MM/YYYY
  if (dayjs(raw, "DD/MM/YYYY", true).isValid()) {
    return dayjs(raw, "DD/MM/YYYY").format("YYYY-MM-DD");
  }

  // Orice altceva: ignorăm complet (nu aruncăm 400 pentru o dată nevalidă)
  return null;
}

function buildPrompt({ match, scheduledDate, sources }) {
  const src = sources || {};
  const takeaways = (src.summary?.keyTakeaways || []).slice(0, 4).join(" • ");
  const sampleOdds = (src.summary?.sampleOdds || []).slice(0, 6).join(", ");

  const sys = `
Ești "LucyOFM – Grok4 Personalizat", expert în analize de meciuri pentru pariori profesioniști.
Scrii în română, stil profesional, concis, direct.
Reguli OBLIGATORII:
- Fără caractere asiatice.
- Structură fixă în 10 puncte, cu simboluri: ✅, ⚠️, 📊, 🎯.
- Include surse verificate (ex. SportyTrader) și marchează consensul (✅) sau opiniile parțiale (⚠️).
- Listează toate opțiunile valide la un meci (ex: GG, 1X&GG, câștigă minim o repriză) cu cote separate.
- Include statistici: posesie medie, cornere, cartonașe, faulturi (acasă/deplasare) – dacă lipsesc, marchează lipsa clar și propune estimări prudente.
- Evită erorile de lot.
- Încheie cu 3–5 recomandări (🎯), fiecare cu motivație scurtă.
`.trim();

  const user = `
Meci: ${match}${scheduledDate ? ` (data: ${scheduledDate})` : ""}

Context extern (rezumat scurt):
- Takeaways: ${takeaways || "—"}
- Cote (exemplu): ${sampleOdds || "—"}
- Sursa: SportyTrader

Livrează FIX structura în 10 puncte (✅, ⚠️, 📊, 🎯) conform regulilor de mai sus.
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
    max_tokens: 1200,
  };
  const resp = await axios.post(url, body, { headers, timeout: 30000 });
  const text = resp.data?.choices?.[0]?.message?.content?.trim() || "";
  return text;
}

async function fetchExternalSources({ match, home, away, date }) {
  if (BOT_URL) {
    const url = `${BOT_URL.replace(/\/+$/, "")}/api/fetchSources`;
    const resp = await axios.post(url, { match, home, away, date }, { timeout: 15000 });
    return resp.data || {};
  }
  // Fallback minimal dacă nu avem BOT_URL
  return {
    meta: { fetchedAt: new Date().toISOString(), home, away, scheduledDate: date, sourceUrls: {} },
    summary: { keyTakeaways: [], sampleOdds: [] },
    sportytrader: { error: "BOT_URL_MISSING" },
  };
}

// —————————————— Handler ——————————————
module.exports = async (req, res) => {
  // Permit și GET pentru debug rapid din browser
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const payload = req.method === "POST" ? (req.body || {}) : (req.query || {});
    const { action } = payload;

    // — Feedback —
    if (String(action).toLowerCase() === "feedback") {
      const match = trimOne(payload.match || "");
      const feedback = trimOne(payload.feedback || "");
      if (!match || !feedback) {
        return res.status(400).json({ error: "Parametri insuficienți pentru feedback" });
      }
      await saveFeedback(match, feedback);
      return res.status(200).json({ ok: true, message: "Feedback salvat" });
    }

    // — Analiză —
    const matchRaw = trimOne(payload.match || "");
    const { home, away } = normalizeTeams({
      match: matchRaw,
      home: payload.home,
      away: payload.away,
    });

    const hasTeams = Boolean(home && away);
    if (!hasTeams) {
      // Nu mai blocăm pe 400 dacă există text oarecare, dar clar nu putem continua fără 2 echipe.
      return res.status(400).json({
        error: "Parametri insuficienți",
        details:
          "Te rog introdu meciul în formatul „Gazde - Oaspeți” (ex: FC Copenhaga - Aarhus) sau trimite separat câmpurile 'home' și 'away'.",
        received: { match: matchRaw },
      });
    }

    const scheduledDate = normalizeDate(payload.date);
    const matchLabel = `${home} - ${away}${scheduledDate ? ` (${scheduledDate})` : ""}`;

    // 1) surse externe
    let sources;
    try {
      sources = await fetchExternalSources({
        match: `${home} - ${away}`,
        home,
        away,
        date: scheduledDate,
      });
    } catch (e) {
      console.warn("⚠️ fetchSources a eșuat, continui fără:", e?.message);
      sources = { summary: { keyTakeaways: [], sampleOdds: [] }, sportytrader: { error: "FETCH_FAIL" } };
    }

    // 2) prompt + OpenAI
    const messages = buildPrompt({ match: matchLabel, scheduledDate, sources });
    const analysis = await askOpenAI(messages);

    // 3) persist
    try {
      await saveAnalysis(matchLabel, analysis);
    } catch (e) {
      console.warn("⚠️ Nu am putut salva în MongoDB (continui):", e?.message);
    }

    // 4) out
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
