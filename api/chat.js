// api/chat.js — CommonJS, complet: surse + OpenAI + Mongo + feedback
// ENV necesare: OPENAI_API_KEY
// Opționale: MONGODB_URI, MONGO_DB (implicit "lucyofm"), BOT_URL

const OpenAI = require("openai");
const { MongoClient } = require("mongodb");
const fetchSources = require("./fetchSources.js");

// ==== OpenAI ====
const openaiKey = process.env.OPENAI_API_KEY || "";
const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

// ==== Mongo ====
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

// ==== Utils ====
const nowISO = () => new Date().toISOString();
const norm = (s) => (s || "").toString().trim();
function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function buildSystemPrompt() {
  return `
Ești "LucyOFM – Analize Meciuri", în română (fără caractere asiatice).
Ton: profesionist, direct, eficient și asumat (ca și cum ai paria tu).
Răspunde STRICT în 10 puncte + concluzie "De jucat:".

1) Surse & Predicții — listează sursele colectate (SportyTrader, PredictZ, Forebet, WinDrawWin etc.). ✅ consens, ⚠️ parțial.
   Dacă nu ai linkuri/date în context: "Date indisponibile".
2) Medie ponderată a predicțiilor — explică în 1–2 fraze cum ai ponderat (consensul cântărește mai mult).
3) Impactul pe pronostic — formă, absențe, motivație, program aglomerat, rotații, stiluri.
4) Forma recentă — ultimele 5 meciuri (tendințe scurte).
5) Accidentări/Suspendări — DOAR absențe cu impact. Dacă nu știi: "Date indisponibile".
6) Golgheteri & penalty-uri — marcatori cheie; dacă nu știi: "Date indisponibile".
7) Statistici — posesie, cornere, galbene, faulturi (acasă/deplasare). Dacă lipsesc: "Date indisponibile".
8) Predicție finală ajustată — scor estimat + 3–5 pariuri (1/X/2, under/over, BTTS, cornere etc.), clar, compact.
9) Build-up bilet (cu motivație scurtă):
   • Solist sigur (1.40–1.60)
   • Valoare ascunsă (1.70–2.00)
   • Surpriză controlată (2.10–2.40)
10) Știri de ultimă oră / alerte indisponibilități — dacă nu există: "Nu sunt informații suplimentare verificate".

Reguli:
- Nu inventa date; dacă lipsesc, scrie "Date indisponibile".
- Evită jucători ieșiți din lot; marchează incertitudinile.
- Redă doar în română. Fără liste goale.
- Încheie cu **"De jucat:"** — 2–3 selecții prioritare.
`;
}

function buildUserPrompt(payload, sourcesPack) {
  const { homeTeam = "", awayTeam = "", league = "", date = "", localeDate = "", extraNote = "" } = payload || {};
  const L = [];
  L.push(`MECI: ${homeTeam} vs ${awayTeam}`);
  if (league) L.push(`Competiție: ${league}`);
  if (date) L.push(`Data (UTC): ${date}`);
  if (localeDate) L.push(`Data (local): ${localeDate}`);
  if (extraNote) L.push(`Observații: ${extraNote}`);
  L.push("");

  if (sourcesPack && Array.isArray(sourcesPack.items) && sourcesPack.items.length) {
    L.push("[Surse externe colectate]");
    sourcesPack.items.forEach((it, i) => {
      const t = it.title ? ` – ${it.title}` : "";
      const pr = it.prediction ? ` | Predicție: ${it.prediction}` : "";
      const cf = it.confidence ? ` | Încredere: ${it.confidence}` : "";
      const url = it.url ? ` | ${it.url}` : "";
      L.push(`${i + 1}. ${it.source || "Sursă"}${t}${pr}${cf}${url}`);
    });
  } else {
    L.push("[Surse externe colectate]: Date indisponibile în acest context.");
  }

  L.push("");
  L.push("Livrează exact structura cerută (10 puncte + 'De jucat:').");
  return L.join("\n");
}

// ==== Handler ====
module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  if (req.method === "GET") {
    return json(res, 200, {
      ok: true,
      service: "LucyOFM – api/chat",
      time: nowISO(),
      hasOpenAI: Boolean(openaiKey),
      hasMongo: Boolean(MONGO_URI),
      botUrl: process.env.BOT_URL || null,
    });
  }

  // body safe
  let body = req.body || {};
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }

  // ---- Feedback
  if (req.method === "PATCH") {
    try {
      const { analysisId, vote, note } = body;
      if (!analysisId || !vote) return json(res, 400, { ok:false, error:"analysisId și vote sunt obligatorii" });

      const db = await getMongo();
      if (!db) return json(res, 501, { ok:false, error:"MongoDB neconfigurat (MONGODB_URI lipsă)" });

      await db.collection(COLLECTION_FEEDBACK).insertOne({
        analysisId, vote: vote === "up" ? "up" : "down", note: norm(note), at: nowISO(),
      });
      return json(res, 200, { ok:true, saved:true });
    } catch (e) {
      return json(res, 500, { ok:false, error: e?.message || "Eroare feedback" });
    }
  }

  // ---- Generare analiză
  if (req.method === "POST") {
    try {
      const { homeTeam, awayTeam, league = "", date = "", localeDate = "", extraNote = "", model = "gpt-4o-mini" } = body;
      if (!homeTeam || !awayTeam) return json(res, 400, { ok:false, error:"homeTeam și awayTeam sunt obligatorii" });
      if (!openai) return json(res, 500, { ok:false, error:"OPENAI_API_KEY lipsește sau este invalid" });

      // 1) Surse externe (cu fallback sigur)
      let sourcesPack = { items: [] };
      try {
        sourcesPack = (await fetchSources({ homeTeam, awayTeam })) || { items: [] };
      } catch (e) {
        sourcesPack = { items: [], error: `Eroare fetch surse: ${e?.message || e}` };
      }

      // 2) Prompturi
      const systemPrompt = buildSystemPrompt();
      const userPrompt = buildUserPrompt({ homeTeam: norm(homeTeam), awayTeam: norm(awayTeam), league: norm(league), date: norm(date), localeDate: norm(localeDate), extraNote: norm(extraNote) }, sourcesPack);

      // 3) OpenAI
      let completion;
      try {
        completion = await openai.chat.completions.create({
          model,
          temperature: 0.2,
          max_tokens: 1600,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        });
      } catch (err) {
        return json(res, 502, { ok:false, error:"Eroare la apelul OpenAI", detail: err?.message || String(err) });
      }

      const text = (completion?.choices?.[0]?.message?.content || "").trim() || "Nu s-a generat conținut.";
      const meta = { model: completion?.model || model, id: completion?.id || null, created: completion?.created || null };

      // 4) Salvare Mongo (opțional)
      let saved = null;
      try {
        const db = await getMongo();
        if (db) {
          const ins = await db.collection(COLLECTION_ANALYSES).insertOne({
            type: "analysis",
            homeTeam: norm(homeTeam), awayTeam: norm(awayTeam), league: norm(league),
            date: norm(date), localeDate: norm(localeDate), extraNote: norm(extraNote),
            sourcesPack, output: text, meta, createdAt: nowISO(),
          });
          saved = { analysisId: ins.insertedId.toString() };
        }
      } catch (_) { /* ignoră dacă nu e configurat DB */ }

      return json(res, 200, { ok:true, analysis: text, sources: sourcesPack, meta, saved });
    } catch (e) {
      return json(res, 500, { ok:false, error: e?.message || "Eroare generare analiză" });
    }
  }

  return json(res, 405, { ok:false, error:"Method Not Allowed" });
};
