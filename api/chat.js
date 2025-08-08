// api/chat.js — fără suport de dată
const axios = require("axios");
const { saveAnalysis, saveFeedback } = require("./db");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const BOT_URL = process.env.BOT_URL;

if (!OPENAI_API_KEY) console.warn("⚠️ Lipsă OPENAI_API_KEY.");
if (!BOT_URL) console.warn("⚠️ Lipsă BOT_URL (folosit pentru apel intern /api/fetchSources).");

function cleanTeam(s = "") { return String(s).replace(/\s+/g, " ").trim(); }
function parseMatchParts(match = "") {
  if (!match) return { home: "", away: "" };
  const parts = String(match).split(/-|vs|–|—|:/i).map(s => s.trim()).filter(Boolean);
  return parts.length >= 2 ? { home: parts[0], away: parts[1] } : { home: "", away: "" };
}

function buildPrompt({ match, sources }) {
  const src = sources || {};
  const st = src.sportytrader || {};
  const takeaways = (src.summary?.keyTakeaways || []).slice(0, 4).join(" • ");
  const sampleOdds = (src.summary?.sampleOdds || []).slice(0, 6).join(", ");

  const sys = `
Ești "LucyOFM – Grok4 Personalizat", expert în analize de meciuri pentru pariori profesioniști.
Scrii în română, stil profesional, concis, direct, fără introduceri inutile.
Reguli OBLIGATORII:
- Fără caractere asiatice.
- Structură fixă în 10 puncte cu simboluri: ✅, ⚠️, 📊, 🎯.
- Include surse verificate (SportyTrader etc.) și marchează consensul (✅) / opiniile divergente (⚠️).
- Listează toate opțiunile valide (ex: GG, 1X&GG, câștigă minim o repriză) cu cote separate.
- Include statistici: posesie, cornere, cartonașe, faulturi (acasă/deplasare). Dacă lipsesc, semnalează clar și estimează prudent.
- Evită erorile de lot (nu menționa jucători plecați).
- Încheie cu 3–5 recomandări clare (🎯), fiecare cu motivație scurtă.
`;

  const user = `
Meci: ${match}

Context extern (rezumat scurt):
- Takeaways: ${takeaways || "—"}
- Cote (exemplu): ${sampleOdds || "—"}
- Sursa: SportyTrader${st?.error ? " (fallback parțial)" : ""}

Livrează FIX această structură în 10 puncte:

1) Surse & Predicții (✅/⚠️):
   - SportyTrader: <predicție + scurt motiv>
   - (dacă ai alte surse) adaugă-le. Marchează consensul cu ✅, opiniile divergente cu ⚠️.

2) Medie ponderată a predicțiilor (1–2 fraze: metodă + rezultat)

3) Impactul pe pronostic – 3–5 bullet-uri

4) Forma recentă (ultimele 5 meciuri) – succint pt. fiecare

5) Accidentări & suspendări (doar info sigure; altfel “date insuficiente”)

6) Golgheteri (include goluri din penalty, dacă se cunosc; altfel “—”)

7) Statistici avansate (acasă/deplasare):
   - Posesie medie
   - Cornere
   - Cartonașe
   - Faulturi
   (Dacă lipsesc, marchează “indispo” și oferă estimări prudente cu explicație.)

8) Scor estimat (1 principal + 1 alternativ scurt)

9) Recomandări (🎯) – 3–5 linii clare:
   - tipul (1X2/Under-Over/BTTS/Cornere…)
   - cotă estimată/interval
   - motivație scurtă

10) Build-up bilet (3 selecții):
   - Solist sigur (1.4–1.6) – motiv
   - Valoare ascunsă (1.7–2.0) – motiv
   - Surpriză controlată (2.1–2.4) – motiv

IMPORTANT:
- Fii concis, lizibil, compact. Nu inventa surse. Fără caractere asiatice.
`;

  return [
    { role: "system", content: sys.trim() },
    { role: "user", content: user.trim() },
  ];
}

async function askOpenAI(messages) {
  const resp = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    { model: OPENAI_MODEL, messages, temperature: 0.3, max_tokens: 1200 },
    { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, timeout: 25000 }
  );
  return resp.data?.choices?.[0]?.message?.content?.trim() || "";
}

async function fetchExternalSources({ match, home, away }) {
  if (!BOT_URL) {
    return { summary: { keyTakeaways: [], sampleOdds: [] }, sportytrader: { error: "BOT_URL_MISSING" } };
  }
  const url = `${BOT_URL.replace(/\/+$/, "")}/api/fetchSources`;
  const resp = await axios.post(url, { match, home, away }, { timeout: 12000 });
  return resp.data || {};
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const body = req.body || {};
    const { action, match, home, away, feedback } = body;

    // feedback
    if (action === "feedback") {
      if (!match || !feedback) return res.status(400).json({ error: "Parametri insuficienți pentru feedback" });
      await saveFeedback(match, String(feedback));
      return res.status(200).json({ ok: true, message: "Feedback salvat" });
    }

    // analiză
    let _home = cleanTeam(home || "");
    let _away = cleanTeam(away || "");
    if ((!_home || !_away) && match) {
      const parts = parseMatchParts(match);
      _home = _home || cleanTeam(parts.home);
      _away = _away || cleanTeam(parts.away);
    }
    if (!_home || !_away) {
      return res.status(400).json({ error: "Parametri insuficienți", details: "Specifică meciul ca 'Gazde - Oaspeți'." });
    }

    const matchLabel = `${_home} - ${_away}`;

    let sources;
    try {
      sources = await fetchExternalSources({ match: matchLabel, home: _home, away: _away });
    } catch (e) {
      console.warn("⚠️ fetchSources a eșuat, continui fără:", e?.message);
      sources = { summary: { keyTakeaways: [], sampleOdds: [] }, sportytrader: { error: "FETCH_FAIL" } };
    }

    const messages = buildPrompt({ match: matchLabel, sources });
    const analysis = await askOpenAI(messages);
    await saveAnalysis(matchLabel, analysis);

    return res.status(200).json({ ok: true, match: matchLabel, model: OPENAI_MODEL, sourcesMeta: sources?.meta || {}, analysis });
  } catch (error) {
    console.error("chat.js error:", error?.response?.data || error?.message || error);
    const code = error?.response?.status || 500;
    return res.status(code).json({
      error: "INTERNAL_ERROR",
      details: error?.message || "Unknown",
      openai: error?.response?.data || undefined
    });
  }
};
