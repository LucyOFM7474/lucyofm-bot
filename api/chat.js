// Runtime Node 18 pentru Vercel (obligatoriu pentru compatibilitate)
export const config = { runtime: "nodejs18.x" };

/**
 * API: POST /api/chat
 * Body JSON: { match: "Gazdă – Oaspeți" }
 * Răspuns: { analysis: "text cu 10 puncte" }
 *
 * Comportament:
 * - Dacă există OPENAI_API_KEY => apelează OpenAI (gpt-4o-mini) și generează analiza în 10 puncte (stilul tău cu ✅ ⚠️ 📊 🎯).
 * - Dacă NU există OPENAI_API_KEY sau apare o eroare => fallback local (analiză șablon, fără date inventate).
 *
 * Suportă CORS + preflight.
 */

function allowCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function sanitizeMatch(raw = "") {
  return String(raw).trim().replace(/\s+/g, " ").slice(0, 140);
}

// Prompt sistem – formatul în 10 puncte (stilul cerut)
function buildSystemPrompt() {
  return [
    "Ești un analist de pariuri profesionist. Scrii în ROMÂNĂ, compact, clar, fără emoji în exces.",
    "FORMAT OBLIGATORIU în 10 puncte, cu simboluri:",
    "1) ✅ Surse & Predicții (SportyTrader, PredictZ, Forebet, WinDrawWin etc.) – arată consensul (✅) și opiniile divergente (⚠️).",
    "2) 📊 Medie ponderată a predicțiilor.",
    "3) ⚠️ Impactul pe pronostic (forma, absențe, motivație).",
    "4) 📈 Formă recentă (ultimele 5 meciuri) + tendințe.",
    "5) 🚑 Accidentări/Suspendări (doar relevante, actuale).",
    "6) 🎯 Golgheteri (include goluri din penalty, unde e cazul).",
    "7) 📊 Statistici: posesie medie, cornere, cartonașe, faulturi (acasă/deplasare când e relevant).",
    "8) 🧠 Predicție finală ajustată (scor estimat).",
    "9) 🎯 Recomandări de pariuri (3–5, clare: 1X2, Under/Over, BTTS, cornere etc.).",
    "10) 🆕 Știri de ultimă oră / zvonuri relevante (doar dacă există; altfel menționează „indisponibil”).",
    "",
    "Reguli:",
    "- Nu inventa surse sau date lipsă. Dacă nu ai date, scrie explicit „indisponibil”.",
    "- Stil profesionist, direct, lizibil, fără balast.",
    "- Menține tonul: ferm, dar modest când e cazul. Fii eficient."
  ].join("\n");
}

function buildUserPrompt(match) {
  return [
    `Meci: ${match}`,
    "Generează analiza STRICT în 10 puncte, conform formatului din sistem.",
    "Dacă lipsesc date exacte din surse, marchează „indisponibil”.",
    "Include alternative acolo unde un meci permite mai multe opțiuni (ex: GG, 1X&GG, câștigă minim o repriză), fiecare cu motivație scurtă.",
    "Finalizează cu 3–5 recomandări „de jucat”, argumentate succint."
  ].join("\n");
}

function fallbackAnalysis(match) {
  const m = sanitizeMatch(match) || "Meci indisponibil";
  return [
    `✅ Surse & Predicții: SportyTrader, PredictZ, Forebet, WinDrawWin – consens/controverse: indisponibil.`,
    `📊 Medie ponderată a predicțiilor: indisponibil (fără surse automate).`,
    `⚠️ Impact pe pronostic: forma și absențele cheie – date indisponibile.`,
    `📈 Formă recentă (ultimele 5): indisponibil.`,
    `🚑 Accidentări/Suspendări: indisponibil.`,
    `🎯 Golgheteri (inclusiv penalty-uri): indisponibil.`,
    `📊 Statistici (posesie, cornere, cartonașe, faulturi): indisponibil.`,
    `🧠 Predicție finală ajustată (scor estimat): indisponibil fără date reale.`,
    `🎯 Recomandări de pariuri (orientative, fără garanție):`,
    `   - 1X (acoperire prudentă) – doar orientativ`,
    `   - Under/Over 2.5 – doar orientativ`,
    `   - BTTS – doar orientativ`,
    `🆕 Știri de ultimă oră: indisponibil.`,
    "",
    `Notă: pentru ${m}, datele reale pot fi accesate din butoanele către surse (SportyTrader, PredictZ, Forebet) din interfață.`,
  ].join("\n");
}

async function callOpenAI(messages) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, content: null, error: "OPENAI_API_KEY missing" };
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages
    })
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return { ok: false, content: null, error: `OpenAI HTTP ${resp.status}: ${text}` };
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || "";
  if (!content.trim()) {
    return { ok: false, content: null, error: "OpenAI: răspuns gol" };
  }
  return { ok: true, content, error: null };
}

export default async function handler(req, res) {
  try {
    allowCors(res);

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    if (req.method === "GET") {
      // Health check simplu
      return res.status(200).json({ status: "ok", endpoint: "api/chat" });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed. Use POST." });
    }

    // Acceptă atât body JSON, cât și query string ?match=
    let body = {};
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    } catch {
      body = {};
    }
    const match = sanitizeMatch(body.match || req.query?.match || "");

    if (!match) {
      return res.status(400).json({ error: "Parametrul 'match' este obligatoriu (ex: \"Rapid – FCSB\")." });
    }

    // Construim mesaje pentru OpenAI
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(match);
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    // Încercare OpenAI
    const ai = await callOpenAI(messages);

    if (ai.ok) {
      return res.status(200).json({ analysis: ai.content });
    }

    // Fallback local dacă nu există cheie sau a eșuat apelul
    const fallback = fallbackAnalysis(match);
    return res.status(200).json({
      analysis: fallback,
      note: ai.error ? `Fallback local (motiv: ${ai.error})` : "Fallback local (fără OPENAI_API_KEY)"
    });

  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err || "Eroare necunoscută") });
  }
}
