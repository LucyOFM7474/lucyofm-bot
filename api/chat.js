// api/chat.js — ÎNLOCUIEȘTE CODUL
import OpenAI from "openai";
import { fetchAllSources } from "./fetchSources.js";

const MODEL = process.env.OPENAI_MODEL || "gpt-5";
const TIMEOUT_MS = 60000;

const withTimeout = (p, ms, label = "op") =>
  Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error(`${label} timed out`)), ms))]);

function clean(t) {
  return String(t || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// Construim un rezumat „obligatoriu” al predicțiilor ca să nu fie contrazise
function buildSourceSummary(s) {
  const L = [];
  if (s?.sportytrader)
    L.push(`SportyTrader: ${s.sportytrader.prediction || "date insuficiente"}`);
  if (s?.predictz) L.push(`PredictZ: ${s.predictz.prediction || "date insuficiente"}`);
  if (s?.forebet) L.push(`Forebet: ${s.forebet.prediction || "date insuficiente"}`);
  if (s?.windrawwin) L.push(`WinDrawWin: ${s.windrawwin.prediction || "date insuficiente"}`);
  return L.join(" | ");
}

function buildPrompt({ userMatch, sources }) {
  const context = {
    sportytrader: {
      title: sources?.sportytrader?.title || "",
      prediction: sources?.sportytrader?.prediction || "",
      keyPoints: sources?.sportytrader?.keyPoints || [],
      url: sources?.sportytrader?.url || "",
    },
    predictz: {
      title: sources?.predictz?.title || "",
      prediction: sources?.predictz?.prediction || "",
      url: sources?.predictz?.url || "",
    },
    forebet: {
      title: sources?.forebet?.title || "",
      prediction: sources?.forebet?.prediction || "",
      url: sources?.forebet?.url || "",
    },
    windrawwin: {
      title: sources?.windrawwin?.title || "",
      prediction: sources?.windrawwin?.prediction || "",
      url: sources?.windrawwin?.url || "",
    },
  };

  const forceLine = buildSourceSummary(sources);

  const rules = `
Ești un asistent pentru analize fotbal în 10 puncte, în română, format compact pe stilul utilizatorului.
Simboluri: ✅ consens, ⚠️ parțial, 📊 statistici, 🎯 recomandări.
REGULĂ CRITICĂ: NU CONTRAZICE predicțiile explicite extrase din surse. 
Dacă SportyTrader spune "X2", "egal" sau "câștigă [echipa]", reflectează EXACT asta. 
Dacă sursele diferă, marchează "⚠️ opinii divergente". Nu inventa cote sau procente exacte.

Puncte:
1) "Surse & Predicții": listează PE LINIi ce spune fiecare sursă (ex.: "✅ SportyTrader: X2 (Millwall sau egal)").
2) "Medie ponderată": sintetizează tendința generală.
3) "Consens 1X2%": estimare orientativă (fără cote certe).
4) "Consens Over/Under%".
5) "Impact formă & absențe".
6) "Golgheteri & penalty-uri" (dacă lipsesc, spune "date indisponibile").
7) "📊 Posesie, cornere, galbene, faulturi" (dacă lipsesc, "în lucru").
8) "Tendințe ultimele 5 meciuri".
9) "🎯 Recomandări de jucat": 3–5 propuneri (Solist sigur 1.4–1.6, Valoare ascunsă 1.7–2.0, Surpriză controlată 2.1–2.4). Dacă sursele indică X2, nu propune "victorie clară" împotriva acestuia.
10) "Note & verificări".
Fără caractere asiatice. Ton profesionist, concis.
`;

  const user = `
Meci: ${userMatch}
Rezumat predicții extrase (OBLIGATORIU de respectat): ${forceLine}

Context JSON:
${JSON.stringify(context, null, 2)}
`.trim();

  return { system: rules.trim(), user };
}

function ok(res, payload) {
  res.status(200).json({ ok: true, ...payload });
}
function fail(res, code = 500, msg = "Eroare") {
  res.status(code).json({ ok: false, error: msg });
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

    let sources = {};
    try {
      sources = await withTimeout(fetchAllSources(match), TIMEOUT_MS, "fetchAllSources");
    } catch {
      sources = {};
    }

    const { system, user } = buildPrompt({ userMatch: match, sources });
    const client = new OpenAI({ apiKey });

    const completion = await withTimeout(
      client.chat.completions.create({
        model: MODEL,
        temperature: 0.25,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      TIMEOUT_MS,
      "openai"
    );

    const text = completion?.choices?.[0]?.message?.content?.trim() || "Nu am reușit să generez analiza.";
    return ok(res, { model: MODEL, match, analysis: text, sources });
  } catch (err) {
    return fail(res, 500, err?.message || "Eroare server");
  }
}
