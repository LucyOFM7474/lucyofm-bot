// api/chat.js (CommonJS, fără ESM/top-level await) – stabil pe Vercel Node 18
// ENV necesare: OPENAI_API_KEY; opțional MONGODB_URI, MONGO_DB (implicit "lucyofm"), BOT_URL

const OpenAI = require("openai");
const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");

// ---- OpenAI ----
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- Mongo ----
const MONGO_URI = process.env.MONGODB_URI || "";
const MONGO_DB = process.env.MONGO_DB || "lucyofm";
const COLLECTION_ANALYSES = "analyses";
const COLLECTION_FEEDBACK = "feedback";

let _mongoClient = null;
async function getMongo() {
  if (!_mongoClient && MONGO_URI) {
    _mongoClient = new MongoClient(MONGO_URI, { maxPoolSize: 5 });
    await _mongoClient.connect();
  }
  return _mongoClient ? _mongoClient.db(MONGO_DB) : null;
}

// ---- fetchSources (opțional) ----
let fetchSources = null;
(function resolveFetchSources() {
  try {
    const p = path.join(__dirname, "fetchSources.js");
    if (fs.existsSync(p)) {
      // Încearcă require clasic; dacă fișierul e ESM și dă eroare, ignorăm.
      // Ideal: fetchSources.js tot CommonJS (module.exports = funcția).
      const mod = require("./fetchSources.js");
      fetchSources = mod.default || mod.fetchSources || mod || null;
    }
  } catch (_e) {
    fetchSources = null;
  }
})();

// ---- Utils ----
function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}
const nowISO = () => new Date().toISOString();
const norm = (s) => (s || "").toString().trim();

function buildSystemPrompt() {
  return `
Ești "LucyOFM – Analize Meciuri", asistent în română (fără caractere asiatice).
Ton: profesionist, direct, eficient, cu concluzii asumate.
Livrează STRICT 10 puncte:

1) Surse & Predicții (SportyTrader, PredictZ, Forebet, WinDrawWin etc.). ✅ consens, ⚠️ parțial. Include link-uri dacă există în context.
2) Medie ponderată a predicțiilor (explică succint).
3) Impactul pe pronostic (formă, absențe, motivație, program).
4) Forma recentă (ultimele 5 meciuri, tendințe).
5) Accidentări/Suspendări (doar absențe relevante).
6) Golgheteri + penalty-uri (spune "Date indisponibile" dacă nu ai).
7) Statistici: posesie, cornere, galbene, faulturi (acasă/deplasare) sau menționează lipsa.
8) Predicție finală ajustată: scor + 3–5 pariuri (1X2, under/over, BTTS, cornere etc.), clar.
9) Build-up bilet:
   – Solist sigur (1.40–1.60)
   – Valoare ascunsă (1.70–2.00)
   – Surpriză controlată (2.10–2.40)
   Cu motivație scurtă.
10) Știri/alerte de ultimă oră (sau "Nu sunt informații suplimentare verificate").

Reguli:
- Nu inventa date. Dacă lipsesc: "Date indisponibile".
- Evită jucători ieșiți din lot; marchează incertitudinile.
- Redă doar în română.
- Încheie cu: "De jucat:" (2–3 selecții prioritare).
`;
}

function buildUserPrompt(payload, sourcesPack) {
  const {
    homeTeam = "",
    awayTeam = "",
    league = "",
    date = "",
    localeDate = "",
    extraNote = "",
  } = payload || {};

  const lines = [];
  lines.push(`MECI: ${homeTeam} vs ${awayTeam}`);
  if (league) lines.push(`Competitie: ${league}`);
  if (date) lines.push(`Data (UTC): ${date}`);
  if (localeDate) lines.push(`Data (local): ${localeDate}`);
  if (extraNote) lines.push(`Observații: ${extraNote}`);

  if (sourcesPack && Array.isArray(sourcesPack.items) && sourcesPack.items.length) {
    lines.push(`\n[Surse externe colectate]`);
    sourcesPack.items.forEach((it, idx) => {
      const t = it.title ? ` – ${it.title}` : "";
      const pr = it.prediction ? ` | Predicție: ${it.prediction}` : "";
      const ct = it.confidence ? ` | Încredere: ${it.confidence}` : "";
      const url = it.url ? ` | ${it.url}` : "";
      lines.push(`${idx + 1}. ${it.source || "Sursă"}${t}${pr}${ct}${url}`);
    });
  } else {
    lines.push(`\n[Surse externe colectate]: Date indisponibile sau fetch dezactivat.`);
  }

  return lines.join("\n");
}

// ---- Handler ----
module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET") {
    return json(res, 200, {
      ok: true,
      service: "LucyOFM – api/chat (CJS)",
      time: nowISO(),
      hasMongo: Boolean(MONGO_URI),
      hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
      botUrl: process.env.BOT_URL || null,
    });
  }

  // parse body safe (în unele runtime-uri body e string)
  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }

  // ---- Feedback
  if (req.method === "PATCH") {
    try {
      const { analysisId, vote, note } = body;
      if (!analysisId || !vote) {
        return json(res, 400, { ok: false, error: "analysisId și vote sunt obligatorii" });
      }
      const db = await getMongo();
      if (!db) return json(res, 501, { ok: false, error: "MongoDB neconfigurat (MONGODB_URI lipsă)" });

      await db.collection(COLLECTION_FEEDBACK).insertOne({
        analysisId,
        vote: vote === "up" ? "up" : "down",
        note: norm(note),
        at: nowISO(),
      });
      return json(res, 200, { ok: true, saved: true });
    } catch (e) {
      return json(res, 500, { ok: false, error: e?.message || "Eroare feedback" });
    }
  }

  // ---- Generare analiză
  if (req.method === "POST") {
    try {
      const {
        homeTeam,
        awayTeam,
        league,
        date,
        localeDate,
        extraNote,
        model,
      } = body;

      if (!homeTeam || !awayTeam) {
        return json(res, 400, { ok: false, error: "homeTeam și awayTeam sunt obligatorii" });
      }

      // 1) Surse (dacă avem fetchSources)
      let sourcesPack = { items: [] };
      if (typeof fetchSources === "function") {
        try {
          sourcesPack = (await fetchSources({ homeTeam, awayTeam, league, date, localeDate })) || { items: [] };
        } catch (e) {
          sourcesPack = { items: [], error: `Eroare fetch surse: ${e?.message || e}` };
        }
      }

      // 2) Prompturi
      const systemPrompt = buildSystemPrompt();
      const userPrompt = buildUserPrompt({ homeTeam, awayTeam, league, date, localeDate, extraNote }, sourcesPack);

      // 3) OpenAI
      if (!process.env.OPENAI_API_KEY) {
        return json(res, 500, { ok: false, error: "OPENAI_API_KEY lipsește la Environment Variables." });
      }
      const useModel = model || "gpt-4o-mini";
      const completion = await openai.chat.completions.create({
        model: useModel,
        temperature: 0.2,
        max_tokens: 1600,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const text = (completion && completion.choices && completion.choices[0] && completion.choices[0].message && completion.choices[0].message.content || "").trim();

      // 4) Salvare în Mongo (dacă e configurat)
      let saved = null;
      const db = await getMongo();
      if (db) {
        const ins = await db.collection(COLLECTION_ANALYSES).insertOne({
          type: "analysis",
          homeTeam: norm(homeTeam),
          awayTeam: norm(awayTeam),
          league: norm(league),
          date: norm(date),
          localeDate: norm(localeDate),
          extraNote: norm(extraNote),
          sourcesPack,
          output: text || "Nu s-a generat conținut.",
          meta: {
            model: useModel,
            created: completion?.created || Math.floor(Date.now() / 1000),
            id: completion?.id || null,
          },
          createdAt: nowISO(),
        });
        saved = { analysisId: ins.insertedId.toString() };
      }

      return json(res, 200, {
        ok: true,
        analysis: text || "Nu s-a generat conținut.",
        sources: sourcesPack,
        meta: {
          model: useModel,
          id: completion?.id || null,
        },
        saved,
      });
    } catch (e) {
      return json(res, 500, { ok: false, error: e?.message || "Eroare generare analiză" });
    }
  }

  return json(res, 405, { ok: false, error: "Method Not Allowed" });
};
