// api/chat.js
// Endpointul care generează analiza în 10 puncte folosind GPT-4o,
// citind STRICT predicțiile extrase din sursele reale (SportyTrader, PredictZ, Forebet).
//
// - NU inventează predicții: inserează textual ce a găsit fetchSources.
// - Dacă lipsesc datele unei surse, afișează "Date indisponibile" pentru acea sursă.
// - Fără caractere asiatice. Fără "Simbol:" în text. Fundalul negru e tratat în UI (CSS), aici dăm doar conținutul.
// - Formatul fixa: 10 puncte, cu ✅, ⚠️, 📊, 🎯 și text concis, română.

import axios from "axios";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

const TIMEOUT = 30000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// Helper sigur pentru a nu sparge formatul
const t = (s) => String(s || "").replace(/\s+/g, " ").trim();

// Citește sursele din endpointul nostru /api/fetchSources (link absolut prin BOT_URL)
async function fetchSourcesViaAPI({ homeTeam, awayTeam, urls }) {
  const base = process.env.BOT_URL || "http://localhost:3000";
  const url = `${base}/api/fetchSources`;
  const { data } = await axios.post(
    url,
    { homeTeam, awayTeam, urls },
    {
      timeout: TIMEOUT,
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/json",
      },
      validateStatus: (st) => st >= 200 && st < 500,
    }
  );
  if (!data?.ok) {
    throw new Error(data?.error || "fetchSources failed");
  }
  return data;
}

// Normalizează textul predicției pentru afișare 1:1, fără să o „traducă liber”
function formatSourceLine(name, pred) {
  const clean = t(pred || "");
  if (clean) return `${name} — ${clean}`;
  return `${name} — Date indisponibile`;
}

// Construcția promptului pentru model (stil Grok4 personalizat, 10 puncte)
function buildPrompt({ homeTeam, awayTeam, matchDate, sources }) {
  // Linii pentru Surse & Predicții (Punctul 1)
  const sSporty = formatSourceLine("SportyTrader", sources?.sportytrader?.prediction);
  const sPredictz = formatSourceLine("PredictZ", sources?.predictz?.prediction);
  const sForebet = formatSourceLine("Forebet", sources?.forebet?.prediction);

  // Linkuri (vor fi randate în UI ca butoane; aici doar le includem textual dacă vrei să apară și în răspuns)
  const linkSporty = sources?.links?.sportytrader || "";
  const linkPredictz = sources?.links?.predictz || "";
  const linkForebet = sources?.links?.forebet || "";

  // Prompt de sistem ferm (evită halucinații, fără caractere asiatice)
  const system = `
Ești un analist de pariuri sport cu disciplină strictă. Reguli OBLIGATORII:
- Folosește EXCLUSIV informațiile din sursele furnizate; nu inventa.
- Afișează răspunsul în română, fără caractere asiatice.
- Format FIX în 10 puncte, fiecare punct pe rând nou, concis, lizibil.
- Simboluri: ✅ verde (consens), ⚠️ galben (opinii parțiale / riscuri), 📊 albastru (statistici), 🎯 roșu (recomandări finale).
- NU scrie cuvântul "Simbol". Doar folosește simbolurile la începutul fiecărui punct.
- Dacă lipsesc date reale pentru un punct, scrie "Date indisponibile" fără a ghici.
- Punctul 1 trebuie să conțină EXACT predicțiile extrase textual din surse (nu le reformula în alt sens).
- NU inversa echipele. Menține ordinea: ${homeTeam} vs ${awayTeam}.
`.trim();

  // Instrucțiuni pentru conținut (10 puncte). Unele date (forma, absențe etc.) pot fi "Date indisponibile"
  const user = `
Meci: ${homeTeam} vs ${awayTeam}
Data (dacă e cunoscută): ${matchDate || "Date indisponibile"}

SURSE & PREDICȚII (exact ce s-a extras):
- ${sSporty}
- ${sPredictz}
- ${sForebet}

LINKURI (pentru referință, nu comenta dacă lipsesc):
- SportyTrader: ${linkSporty || "n/a"}
- PredictZ: ${linkPredictz || "n/a"}
- Forebet: ${linkForebet || "n/a"}

Cerință: Redă analiza în EXACT 10 puncte, formatul standard:

1) ✅ Surse & Predicții — listează textual cele trei linii de mai sus, nemodificate, pe un singur punct (separate prin " | ").
2) 📊 Medie/Consens — deduce consensul DOAR din cele trei surse (dacă 2+ surse merg în aceeași direcție, notează; altfel "Dispersie").
3) 📊 Impact pe pronostic — explică pe scurt impactul potențial (forma, stil, absențe). Dacă nu ai date reale, scrie "Date indisponibile".
4) 📊 Formă recentă (ultimele 5) — dacă nu există date, scrie "Date indisponibile".
5) 📊 Absențe/indisponibilități — "Date indisponibile" dacă nu sunt din surse.
6) 📊 Golgheteri (cu penalty-uri dacă știi) — altfel "Date indisponibile".
7) 📊 Statistici: posesie medie, cornere, cartonașe, faulturi, acasă/deplasare — "Date indisponibile" dacă lipsesc.
8) 📊 Tendințe piață & cote — doar dacă există în surse; altfel "Date indisponibile".
9) ⚠️ Riscuri specifice — motive scurte pentru care pariul poate pica (ex.: rotație, derby, program dens). Dacă nu știi: "Date indisponibile".
10) 🎯 Recomandări finale (3–5 selecții) — bazează-te STRICT pe consensul din punctele 1–2 (ex.: 1X2/1X/X2, under/over, BTTS). Nu inventa marcatori sau linii care nu apar în surse. Dacă nu există consens minimal, scrie "Date insuficiente pentru recomandări".

IMPORTANT:
- Punctul 1 trebuie să fie: "✅ Surse & Predicții — SportyTrader — <text extras> | PredictZ — <text extras> | Forebet — <text extras>"
- Nu schimba sensul predicțiilor (ex.: dacă SportyTrader spune "Portsmouth câștigă meciul", păstrează EXACT asta).
`.trim();

  return { system, user };
}

// Apel OpenAI
async function askOpenAI({ system, user }) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.2,
    max_tokens: 1100,
  };

  const { data } = await axios.post(`${OPENAI_BASE_URL}/chat/completions`, body, {
    timeout: TIMEOUT,
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    validateStatus: (st) => st >= 200 && st < 500,
  });

  if (!data || !data.choices || !data.choices[0]?.message?.content) {
    throw new Error("OpenAI response invalid");
  }
  return data.choices[0].message.content;
}

// ------------------ Handler ------------------
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { homeTeam, awayTeam, matchDate, urls } = req.body || {};
    if (!homeTeam || !awayTeam) {
      res.status(400).json({ error: "homeTeam and awayTeam are required" });
      return;
    }

    // 1) Citim sursele (cu parserul strict din /api/fetchSources)
    const src = await fetchSourcesViaAPI({ homeTeam, awayTeam, urls });

    // 2) Construim promptul
    const { system, user } = buildPrompt({
      homeTeam: t(homeTeam),
      awayTeam: t(awayTeam),
      matchDate: t(matchDate || ""),
      sources: {
        sportytrader: src?.sources?.sportytrader || null,
        predictz: src?.sources?.predictz || null,
        forebet: src?.sources?.forebet || null,
        links: src?.links || {},
      },
    });

    // 3) Cerem analiza la OpenAI (fără halucinații, format FIX)
    const analysis = await askOpenAI({ system, user });

    // 4) Returnăm tot (inclusiv sursele brute pentru UI/debug)
    res.status(200).json({
      ok: true,
      teams: { home: t(homeTeam), away: t(awayTeam) },
      matchDate: t(matchDate || ""),
      sources: src?.sources || {},
      links: src?.links || {},
      analysis: t(analysis),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
}
