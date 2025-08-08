// api/chat.js — ÎNLOCUIEȘTE CODUL
// Generează analiza în 10 puncte. NU contrazice sursele.
// La punctul 1 listează clar fiecare sursă cu predicția ei.

import OpenAI from "openai";
import { fetchAllSources } from "./fetchSources.js";

const MODEL = process.env.OPENAI_MODEL || "gpt-5";
const TIMEOUT_MS = 60000;

const withTimeout = (p, ms, label = "op") =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out`)), ms)),
  ]);

function clean(t) {
  return String(t || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// ——— Mapare rough a unei fraze în etichete 1/X/2/1X/X2/12/Over/Under
function classifyPick(text = "") {
  const s = text.toLowerCase();
  if (!s) return null;

  // priorități pe dublu / X2
  if (/\b1x\b/.test(s) || /gazde sau egal|egal sau gazde/i.test(s)) return "1X";
  if (/\bx2\b/.test(s) || /victorie.*(oaspe|millwall).*sau egal|câștigă.*sau egal/i.test(s)) return "X2";
  if (/\b12\b/.test(s) || /fără egal/i.test(s)) return "12";

  // simple
  if (/victorie\s+gazd(e|a)|câștigă\s+gazd(e|a)|win\s*home|home\s*win/i.test(s)) return "1";
  if (/\begal\b|draw/i.test(s)) return "X";
  if (/victorie\s+oaspe|câștigă\s+oaspe|win\s*away|away\s*win/.test(s)) return "2";

  // linii de goluri
  if (/over\s*2\.?5|peste\s*2\.?5/.test(s)) return "Over2.5";
  if (/under\s*2\.?5|sub\s*2\.?5/.test(s)) return "Under2.5";

  return null;
}

function perSourceSummary(s) {
  const out = [];
  const push = (name, obj) => {
    if (!obj) return;
    const pred = clean(obj.prediction || obj.picks?.[0] || "");
    const tag = classifyPick(pred) || "date limitate";
    out.push(`${name}: ${tag}${pred ? ` — ${pred.slice(0, 80)}` : ""}`);
  };
  push("SportyTrader", s?.sportytrader);
  push("PredictZ", s?.predictz);
  push("Forebet", s?.forebet);
  push("WinDrawWin", s?.windrawwin);
  return out;
}

// ——— Reguli stricte pentru GPT
function buildPrompt({ userMatch, sources }) {
  const ctx = {
    sportytrader: {
      prediction: sources?.sportytrader?.prediction || "",
      keyPoints: sources?.sportytrader?.keyPoints || [],
      url: sources?.sportytrader?.url || "",
      title: sources?.sportytrader?.title || "",
    },
    predictz: {
      prediction: sources?.predictz?.prediction || "",
      url: sources?.predictz?.url || "",
    },
    forebet: {
      prediction: sources?.forebet?.prediction || "",
      url: sources?.forebet?.url || "",
    },
    windrawwin: {
      prediction: sources?.windrawwin?.prediction || "",
      url: sources?.windrawwin?.url || "",
    },
    perSource: perSourceSummary(sources),
  };

  const HARD_RULES = `
REGULI DURE (OBLIGATORII):
- NU contrazice sursele. Dacă SportyTrader are "X2" (sau menționează "egal"), NU afirma "victorie gazde".
- La punctul 1 listezi CLAR fiecare sursă pe o linie: "✅/⚠️ NumeSursă: etichetă (1, X, 2, 1X, X2, 12, Over/Under) – scurt motiv".
- Dacă două sau mai multe surse spun "X2", tratează tendința ca avantaj oaspeți (evită "victorie gazde").
- Dacă datele lipsesc, scrie "date limitate" sau "în lucru". NU inventa cote/jucători/statistici.
- Folosește formatarea în 10 puncte, cu simboluri: ✅ consens, ⚠️ parțial, 📊 statistici, 🎯 recomandări.
`;

  const FORMAT = `
1) "Surse & Predicții" – line-by-line: SportyTrader / PredictZ / Forebet / WinDrawWin (✅ dacă există acord cu tendința finală, ⚠️ altfel).
2) "Medie ponderată a predicțiilor" – concluzie generală (fără cote inventate).
3) "Consens 1X2%" – procente orientative (ex.: 1:40% / X:30% / 2:30%) bazate pe surse.
4) "Consens Over/Under%" – estimare generală (Over/Under 2.5).
5) "Impact formă & absențe" – dacă lipsesc date: menționezi lipsa.
6) "Golgheteri & penalty-uri" – dacă lipsesc date: menționezi lipsa.
7) "📊 Posesie, cornere, galbene, faulturi" – dacă lipsesc date: "în lucru".
8) "Tendințe ultimele 5 meciuri" – sinteză.
9) "🎯 Recomandări de jucat" – 3–5 selecții; marchează: Solist sigur (1.4–1.6), Valoare ascunsă (1.7–2.0), Surpriză controlată (2.1–2.4). Fără cote exacte dacă nu le ai.
10) "Note & verificări" – avertismente de ultim moment (absențe/meteo).
`;

  const system = `
Ești un analist de fotbal. Răspunzi STRICT în română, compact, fără caractere asiatice.
Respectă întocmai REGULILE DURE și FORMATUL.
${HARD_RULES}
${FORMAT}
`.trim();

  const user = `
Meci: ${userMatch}
DATE EXTRASE DIN SURSE (nu le repeta integral, doar folosește-le corect):
${JSON.stringify(ctx, null, 2)}
`.trim();

  return { system, user };
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

    // 1) Surse
    let sources = {};
    try {
      sources = await withTimeout(fetchAllSources(match), TIMEOUT_MS, "fetchSources");
    } catch {
      sources = {};
    }

    // 2) Prompt
    const { system, user } = buildPrompt({ userMatch: match, sources });

    // 3) GPT
    const client = new OpenAI({ apiKey });
    const completion = await withTimeout(
      client.chat.completions.create({
        model: MODEL,
        temperature: 0.2,
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
