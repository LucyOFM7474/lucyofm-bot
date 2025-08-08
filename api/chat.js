// api/chat.js — versiune corectă fără runtime config, compatibilă cu Vercel
// Primește { match: "Gazdă - Oaspeți" SAU slug/link }, citește surse,
// apoi cere modelului GPT analiza în 10 puncte pe stilul stabilit.

import OpenAI from "openai";
import { fetchAllSources } from "./fetchSources.js";

const MODEL = process.env.OPENAI_MODEL || "gpt-5";
const TIMEOUT_MS = 60000;

// Helper timeout
const withTimeout = (p, ms, label = "operation") =>
  Promise.race([
    p,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timed out`)), ms)
    ),
  ]);

// Curățare text
function clean(t) {
  return String(t || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// Construiește promptul pentru GPT
function buildPrompt({ userMatch, sources }) {
  const ST = sources?.sportytrader || null;
  const PZ = sources?.predictz || null;
  const FB = sources?.forebet || null;
  const WDW = sources?.windrawwin || null;

  const context = {
    sportytrader: {
      title: ST?.title || "",
      date: ST?.date || "",
      synopsis: ST?.synopsis || "",
      picks: (ST?.picks || []).slice(0, 3),
      url: ST?.url || "",
      teams: ST?.teams || null,
    },
    predictz: {
      title: PZ?.title || "",
      synopsis: PZ?.synopsis || "",
      picks: (PZ?.picks || []).slice(0, 3),
      url: PZ?.url || "",
    },
    forebet: {
      title: FB?.title || "",
      picks: (FB?.picks || []).slice(0, 3),
      odds: (FB?.odds || []).slice(0, 2),
      url: FB?.url || "",
    },
    windrawwin: {
      title: WDW?.title || "",
      picks: (WDW?.picks || []).slice(0, 3),
      form: (WDW?.form || []).slice(0, 2),
      url: WDW?.url || "",
    },
  };

  const ctxString = "SURSE_BRUTE_JSON:\n" + JSON.stringify(context, null, 2);

  const rules = `
Ești un asistent care livrează exclusiv analiză fotbal în 10 puncte, în română, format compact, fără caractere asiatice.
Folosește simboluri: ✅ consens, ⚠️ parțial, 📊 statistici, 🎯 recomandări.

1) "Surse & Predicții": compară SportyTrader / PredictZ / Forebet / WinDrawWin. Marchează consensul cu ✅, opiniile parțiale cu ⚠️.
2) "Medie ponderată a predicțiilor": explică tendința generală.
3) "Consens 1X2%": procent orientativ pe 1 / X / 2.
4) "Consens Over/Under%": estimare generală.
5) "Impact formă & absențe": dacă lipsesc date, spune "date insuficiente".
6) "Golgheteri & penalty-uri": dacă lipsesc date, spune explicit.
7) "📊 Posesie, cornere, galbene, faulturi": dacă lipsesc date, marchează "în lucru".
8) "Tendințe ultimele 5 meciuri": rezumă forma.
9) "🎯 Recomandări de jucat": 3–5 selecții clare (1X2 / Over/Under / BTTS / Cornere etc.) cu etichetele "Solist sigur", "Valoare ascunsă", "Surpriză controlată".
10) "Note & verificări": atenționează la absențe/meteo/motivații.

Reguli:
- Fără paragrafe lungi; liste numerotate 1→10.
- Leagă concluziile de surse.
- Nu inventa statistici; dacă lipsesc, marchează.
- Ton profesionist, direct, compact.
`;

  const userTask = `
Meci: ${userMatch}
Furnizez mai jos conținutul extras din surse. Folosește-le pentru sinteză și dă analiza în 10 puncte.

${ctxString}
  `.trim();

  return { system: rules.trim(), user: userTask };
}

// Răspuns JSON standard
function ok(res, payload) {
  res.status(200).json({ ok: true, ...payload });
}
function fail(res, code = 500, message = "Eroare") {
  res.status(code).json({ ok: false, error: message });
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return fail(res, 405, "Method Not Allowed");
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return fail(res, 500, "OPENAI_API_KEY lipsă");

    const body = req.body || {};
    const match = clean(body.match || body.meci || body.query || "");
    if (!match) return fail(res, 400, "Parametrul 'match' este obligatoriu");

    // 1) Citește sursele externe
    let sources = {};
    try {
      sources = await withTimeout(fetchAllSources(match), TIMEOUT_MS, "fetchAllSources");
    } catch {
      sources = {};
    }

    // 2) Construiește promptul
    const { system, user } = buildPrompt({ userMatch: match, sources });

    const client = new OpenAI({ apiKey });

    // 3) Cere analiza modelului
    const completion = await withTimeout(
      client.chat.completions.create({
        model: MODEL,
        temperature: 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      TIMEOUT_MS,
      "openai"
    );

    const text =
      completion?.choices?.[0]?.message?.content?.trim() ||
      "Nu am reușit să generez analiza.";

    // 4) Trimite răspunsul la UI
    return ok(res, {
      model: MODEL,
      match,
      analysis: text,
      sources: {
        sportytrader: sources?.sportytrader || null,
        predictz: sources?.predictz || null,
        forebet: sources?.forebet || null,
        windrawwin: sources?.windrawwin || null,
      },
    });
  } catch (err) {
    return fail(res, 500, err?.message || "Eroare server");
  }
}
