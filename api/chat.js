// api/chat.js — ÎNLOCUIEȘTE CODUL
// Serverless (Vercel). Primește { match: "Gazdă - Oaspeți" SAU slug/link }, citește surse,
// apoi cere modelului GPT să livreze analiza în 10 puncte pe stilul stabilit de Florin.

import OpenAI from "openai";
import { fetchAllSources } from "./fetchSources.js";

// ---------- CONFIG ----------
const MODEL = process.env.OPENAI_MODEL || "gpt-5"; // fallback: gpt-5 (sau schimbă în gpt-4o dacă preferi)
const TIMEOUT_MS = 60000;

// Mic utilitar de timeout pentru orice promisiune
const withTimeout = (p, ms, label = "operation") =>
  Promise.race([
    p,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timed out`)), ms)
    ),
  ]);

// Normalizează textul (scapă de spații duble, linii foarte lungi)
function clean(t) {
  return String(t || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// Construiește promptul pentru GPT (stil Florin – 10 puncte, surse, build-up)
function buildPrompt({ userMatch, sources }) {
  // Extragem rapid din surse ce avem
  const ST = sources?.sportytrader || null;
  const PZ = sources?.predictz || null;
  const FB = sources?.forebet || null;
  const WDW = sources?.windrawwin || null;

  // „Baza factuală” (nu e listă pentru utilizator; e context pentru model)
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

  // Instrucțiuni stricte de format (stilul tău Grok4 personalizat)
  const rules = `
Ești un asistent care livrează EXCLUSIV analiză fotbal în 10 puncte, în română, format compact, fără caractere asiatice.
Folosește simboluri: ✅ consens, ⚠️ parțial, 📊 statistici, 🎯 recomandări.

1) "Surse & Predicții": compară SportyTrader / PredictZ / Forebet / WinDrawWin. Marchează consensul cu ✅, opiniile parțiale cu ⚠️. Citează pe scurt sursa între paranteze pătrate. Exemplu: "✅ SportyTrader (victorie gazde), ⚠️ Forebet (echilibrat)".
2) "Medie ponderată a predicțiilor": explică tendința generală (ex: avantaj oaspeți).
3) "Consens 1X2%": procent orientativ pe 1 / X / 2 bazat pe ce au spus sursele (fără a inventa cote exacte).
4) "Consens Over/Under%": estimare (ex: Over 2.5 probabil).
5) "Impact formă & absențe": folosește orice indicii din context; dacă nu există, spune "date insuficiente".
6) "Golgheteri & penalty-uri": dacă lipsesc date, menționează explicit că nu sunt disponibile.
7) "📊 Posesie, cornere, galbene, faulturi": dacă nu există date brute, marchează "în lucru". Nu inventa cifre!
8) "Tendințe ultimele 5 meciuri": rezumă forma (ex: 4/5 în formă bună).
9) "🎯 Recomandări de jucat": 3–5 selecții clare, fiecare pe linie: 1X2 / Over/Under / BTTS / Cornere, etc. 
   • include build-up-ul: "Solist sigur (1.4–1.6)", "Valoare ascunsă (1.7–2.0)", "Surpriză controlată (2.1–2.4)". 
   • Dacă nu ai cote, lasă tipul fără cotă exactă, dar păstrează etichetele.
10) "Note & verificări": atenționează la absențe de ultim moment / meteo / motivații.

Reguli:
- Fără paragrafe lungi; liste numerotate 1→10.
- Evită generalitățile; leagă concluziile de surse.
- NU inventa statistici sau jucători. Când nu există date, spune scurt "date indisponibile" sau "în lucru".
- Păstrează ton profesionist, direct, compact.
`;

  const userTask = `
Meci: ${userMatch}
Furnizez mai jos conținutul extras din surse. Folosește-le pentru sinteză, apoi dă analiza în 10 puncte pe formatul de mai sus.

${ctxString}
  `.trim();

  return { system: rules.trim(), user: userTask };
}

// Răspuns JSON standard pentru frontend
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

    // 1) Citește surse (SportyTrader, PredictZ, Forebet, WinDrawWin) prin fetchSources.js
    let sources = {};
    try {
      sources = await withTimeout(fetchAllSources(match), TIMEOUT_MS, "fetchAllSources");
    } catch (e) {
      // dacă pică sursele, mergem doar cu GPT (dar semnalăm „date limitate”)
      sources = {};
    }

    // 2) Construiește promptul strict pe formatul Florin (10 puncte + simboluri)
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

    // 4) Răspuns către UI — includ și sursele brute ca să le poți afișa / debuga
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
