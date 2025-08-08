// api/chat.js
// Rol: primește o cerere de analiză, citește sursele externe, apelează modelul OpenAI și salvează în MongoDB.

const axios = require("axios");
const dayjs = require("dayjs");
const { saveAnalysis, saveFeedback } = require("./db");

// —————————————— Config ——————————————
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // OBLIGATORIU
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o"; // poți seta "gpt-5" când e disponibil
const BOT_URL = process.env.BOT_URL; // ex: https://lucyofm-bot.vercel.app (recomandat)

if (!OPENAI_API_KEY) {
  console.warn("⚠️  Lipsă OPENAI_API_KEY în Environment Variables.");
}
if (!BOT_URL) {
  console.warn("⚠️  Lipsă BOT_URL (folosit pentru apel intern /api/fetchSources).");
}

// —————————————— Utils ——————————————
function cleanTeam(s = "") {
  return String(s).replace(/\s+/g, " ").trim();
}

function parseMatchParts(match = "") {
  if (!match) return { home: "", away: "" };
  const parts = String(match)
    .split(/-|vs|–|—|:/i)
    .map(s => s.trim())
    .filter(Boolean);
  return parts.length >= 2
    ? { home: parts[0], away: parts[1] }
    : { home: "", away: "" };
}

function buildPrompt({ match, scheduledDate, sources }) {
  // Context real din surse (rezumat compact)
  const src = sources || {};
  const st = src.sportytrader || {};
  const takeaways = (src.summary?.keyTakeaways || []).slice(0, 4).join(" • ");
  const sampleOdds = (src.summary?.sampleOdds || []).slice(0, 6).join(", ");

  // Instrucțiuni stricte: 10 puncte, cu simbolurile cerute, fără caractere asiatice.
  const sys = `
Ești "LucyOFM – Grok4 Personalizat", expert în analize de meciuri pentru pariori profesioniști.
Scrii în română, stil profesional, concis, direct, fără introduceri inutile.
Reguli OBLIGATORII:
- Fără caractere asiatice (chinezești/japoneze etc.).
- Structură fixă în 10 puncte, cu simboluri: ✅, ⚠️, 📊, 🎯.
- Include surse verificate (ex. SportyTrader / altele) și marchează consensul (✅) sau opiniile parțiale (⚠️).
- Listează toate opțiunile valide la un meci (ex: GG, 1X&GG, câștigă minim o repriză) cu cote separate.
- Include statistici: posesie medie, cornere, cartonașe, faulturi (acasă/deplasare) – dacă lipsesc, marchează lipsa clar și propune estimări prudente.
- Evită erorile de lot (nu menționa jucători plecați sau indisponibili dacă nu ești sigur).
- Încheie cu 3–5 recomandări clare de pariuri (🎯), fiecare cu motivație scurtă.
`;

  const user = `
Meci: ${match}${scheduledDate ? ` (data: ${scheduledDate})` : ""}

Context extern (rezumat scurt):
- Takeaways: ${takeaways || "—"}
- Cote (exemplu): ${sampleOdds || "—"}
- Sursa: SportyTrader${st?.error ? " (fallback parțial)" : ""}

Te rog livrează FIX următoarea structură în 10 puncte:

1) Surse & Predicții (✅/⚠️):
   - SportyTrader: <predicție + scurt motiv>
   - (dacă ai alte surse disponibile) Adaugă-le. Marchează consensul cu ✅, opiniile divergente cu ⚠️.

2) Medie ponderată a predicțiilor (explică în 1–2 fraze metoda și rezultatul)

3) Impactul pe pronostic (forme, stiluri, matchups-cheie) – 3–5 bullet-uri

4) Forma recentă (ultimele 5 meciuri) – tabel/linie succintă pt. fiecare

5) Accidentări & suspendări (doar informații sigure; altfel notează “date insuficiente”)

6) Golgheteri (inclusiv goluri din penalty, dacă se cunosc; altfel “—”)

7) Statistici avansate (acasă/deplasare separat): 
   - Posesie medie
   - Cornere
   - Cartonașe
   - Faulturi
   (Dacă lipsesc, marchează “indispo” și oferă estimări prudente cu explicație.)

8) Scor estimat (1 variantă principală + 1 alternativă scurtă)

9) Recomandări de pariuri – 3–5 linii clare (🎯), fiecare cu:
   - tipul (ex: 1X2, Under/Over, BTTS, Cornere etc.)
   - cotă estimată sau interval
   - motivație în 1 frază

10) Build-up de bilet (3 selecții):
   - Solist sigur (1.4–1.6) – motiv
   - Valoare ascunsă (1.7–2.0) – motiv
   - Surpriză controlată (2.1–2.4) – motiv

IMPORTANT:
- Fii concis, lizibil, compact. Fără fraze redundante.
- Nu inventa surse; dacă informația lipsește, spune clar.
- Nu folosi caractere asiatice.
`;

  return [
    { role: "system", content: sys.trim() },
    { role: "user", content: user.trim() },
  ];
}

// —————————————— OpenAI (REST) ——————————————
async function askOpenAI(messages) {
  const url = "https://api.openai.com/v1/chat/completions";
  const headers = {
    "Authorization": `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  };
  const body = {
    model: OPENAI_MODEL,
    messages,
    temperature: 0.3,
    max_tokens: 1200,
  };
  const resp = await axios.post(url, body, { headers, timeout: 25000 });
  const text = resp.data?.choices?.[0]?.message?.content?.trim() || "";
  return text;
}

// —————————————— Fetch sources ——————————————
async function fetchExternalSources({ match, home, away, date }) {
  // Preferăm apelul către propriul endpoint pentru consistență.
  if (!BOT_URL) {
    // fallback minimal dacă nu există BOT_URL
    return {
      meta: { fetchedAt: new Date().toISOString(), home, away, scheduledDate: date, sourceUrls: {} },
      summary: { keyTakeaways: [], sampleOdds: [] },
      sportytrader: { error: "BOT_URL_MISSING" }
    };
  }
  const url = `${BOT_URL.replace(/\/+$/, "")}/api/fetchSources`;
  // încercăm POST, e mai robust pentru diacritice
  const resp = await axios.post(url, { match, home, away, date }, { timeout: 12000 });
  return resp.data || {};
}

// —————————————— Handler ——————————————
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const body = req.body || {};
    const { action, match, home, away, date, feedback } = body;

    // 1) Feedback direct
    if (action === "feedback") {
      if (!match || !feedback) {
        return res.status(400).json({ error: "Parametri insuficienți pentru feedback" });
      }
      await saveFeedback(match, String(feedback));
      return res.status(200).json({ ok: true, message: "Feedback salvat" });
    }

    // 2) Analiză
    // normalizează echipele
    let _home = cleanTeam(home || "");
    let _away = cleanTeam(away || "");
    if ((!_home || !_away) && match) {
      const parts = parseMatchParts(match);
      _home = _home || cleanTeam(parts.home);
      _away = _away || cleanTeam(parts.away);
    }

    if (!_home || !_away) {
      return res.status(400).json({
        error: "Parametri insuficienți",
        details: "Specifică meciul ca 'Home - Away' sau parametrii 'home' și 'away'."
      });
    }

    const scheduledDate = date ? dayjs(date).format("YYYY-MM-DD") : null;
    const matchLabel = `${_home} - ${_away}${scheduledDate ? ` (${scheduledDate})` : ""}`;

    // 2.1) Citește surse externe (cu retry scurt)
    let sources;
    try {
      sources = await fetchExternalSources({
        match: `${_home} - ${_away}`,
        home: _home,
        away: _away,
        date: scheduledDate
      });
    } catch (e) {
      console.warn("⚠️ fetchSources a eșuat, continui fără:", e?.message);
      sources = { summary: { keyTakeaways: [], sampleOdds: [] }, sportytrader: { error: "FETCH_FAIL" } };
    }

    // 2.2) Compune prompt și apelează OpenAI
    const messages = buildPrompt({
      match: matchLabel,
      scheduledDate,
      sources
    });

    const analysis = await askOpenAI(messages);

    // 2.3) Salvează în DB
    await saveAnalysis(matchLabel, analysis);

    // 2.4) Returnează
    return res.status(200).json({
      ok: true,
      match: matchLabel,
      model: OPENAI_MODEL,
      sourcesMeta: sources?.meta || {},
      analysis
    });
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
