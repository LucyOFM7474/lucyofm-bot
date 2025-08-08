// api/chat.js
// Vercel Serverless Function – Analize meciuri (10 puncte) + salvare MongoDB + feedback
// Cerințe ENV: OPENAI_API_KEY, MONGODB_URI (opțional), MONGO_DB=lucyofm (implicit), BOT_URL (opțional)

import OpenAI from "openai";
import { MongoClient } from "mongodb";

// Dacă ai fișierul local de surse, îl folosim; dacă nu, continuăm fără el.
let fetchSources = null;
try {
  const mod = await import("./fetchSources.js");
  fetchSources = mod.default || mod.fetchSources || null;
} catch (_) {
  // Fără fetch extern – continuăm cu fallback.
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ------- Mongo -------

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

// ------- Utils -------

function json(res, status, data) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function getNowISO() {
  return new Date().toISOString();
}

function normalizeText(s) {
  return (s || "").toString().trim();
}

function buildSystemPrompt() {
  // Prompt sistem – stil Grok4 personalizat pentru Florin.
  return `
Ești "LucyOFM – Analize Meciuri", un asistent care livrează analize în 10 puncte, în limba română, fără caractere asiatice.
Ton: profesionist, direct, eficient, cu concluzii asumate (ca și cum ai paria tu).
Respectă STRICT structura în 10 puncte de mai jos.

1) Surse & Predicții (inclusiv SportyTrader, PredictZ, Forebet, WinDrawWin etc.). Marchează: ✅ consens, ⚠️ opinii parțiale. Include link-urile, dacă au fost furnizate în contextul funcției de fetch.
2) Medie ponderată a predicțiilor (explică pe scurt cum ai ponderat).
3) Impactul pe pronostic (formă, absențe, motivație, program).
4) Forma recentă (ultimele 5 meciuri, tendințe).
5) Accidentări/Suspendări – doar absențe cu impact real.
6) Golgheteri + penalty-uri (dacă lipsesc datele, spune explicit "Date indisponibile").
7) Statistici avansate: posesie medie, cornere, cartonașe galbene, faulturi – separat acasă/deplasare dacă există date. Dacă nu, menționează clar lipsa.
8) Predicție finală ajustată: scor estimat + 3–5 pariuri (1X2, under/over, BTTS, cornere etc.), clar și compact.
9) Build-up bilet: 
   – Solist sigur (cote ~1.40–1.60)
   – Valoare ascunsă (1.70–2.00)
   – Surpriză controlată (2.10–2.40)
   Fiecare cu motivație scurtă.
10) Știri de ultimă oră / alertă indisponibilități / motivații speciale (dacă nu există, notează: "Nu sunt informații suplimentare verificate").

Reguli:
- Fără "2" (victorie oaspeți) în recomandări dacă datele nu justifică (nu inventa).
- Evită jucători plecați din loturi; dacă e incert, marchează ca incertitudine.
- Când lipsesc date de la surse, menționează explicit "Date indisponibile".
- Redă strict în română, fără emoji non-latine.
- La final, oferă o concluzie scurtă: "De jucat:" cu 2–3 selecții prioritare.
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

  if (sourcesPack && sourcesPack.items && sourcesPack.items.length) {
    lines.push(`\n[Surse externe colectate]`);
    sourcesPack.items.forEach((it, idx) => {
      const t = it.title ? ` – ${it.title}` : "";
      const pr = it.prediction ? ` | Predicție: ${it.prediction}` : "";
      const ct = it.confidence ? ` | Încredere: ${it.confidence}` : "";
      lines.push(`${idx + 1}. ${it.source || "Sursă"}${t}${pr}${ct}${it.url ? ` | ${it.url}` : ""}`);
    });
  } else {
    lines.push(`\n[Surse externe colectate]: Date indisponibile sau fetch dezactivat.`);
  }

  return lines.join("\n");
}

// ------- Core handler -------

export default async function handler(req, res) {
  // CORS simplu
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method === "GET") {
    return json(res, 200, {
      ok: true,
      service: "LucyOFM – api/chat",
      time: getNowISO(),
      hasMongo: Boolean(MONGO_URI),
      hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
      botUrl: process.env.BOT_URL || null,
    });
  }

  // ------- FEEDBACK (PATCH) -------
  if (req.method === "PATCH") {
    try {
      const body = req.body || {};
      const { analysisId, vote, note } = body;

      if (!analysisId || !vote) {
        return json(res, 400, { ok: false, error: "analysisId și vote sunt obligatorii" });
      }

      const db = await getMongo();
      if (!db) {
        return json(res, 501, { ok: false, error: "MongoDB neconfigurat (MONGODB_URI lipsă)" });
      }

      const fb = {
        analysisId,
        vote: vote === "up" ? "up" : "down",
        note: normalizeText(note),
        at: getNowISO(),
      };

      await db.collection(COLLECTION_FEEDBACK).insertOne(fb);
      return json(res, 200, { ok: true, saved: true });
    } catch (err) {
      return json(res, 500, { ok: false, error: err?.message || "Eroare feedback" });
    }
  }

  // ------- GENERARE ANALIZĂ (POST) -------
  if (req.method === "POST") {
    try {
      const body = req.body || {};
      const {
        homeTeam,
        awayTeam,
        league,
        date,        // ISO (opțional)
        localeDate,  // ex: "08.08.2025" (opțional)
        extraNote,   // notițe utilizator
        model,       // opțional (default: gpt-4o-mini)
      } = body;

      if (!homeTeam || !awayTeam) {
        return json(res, 400, { ok: false, error: "homeTeam și awayTeam sunt obligatorii" });
      }

      // 1) Colectare surse (dacă există modulul)
      let sourcesPack = { items: [] };
      if (typeof fetchSources === "function") {
        try {
          sourcesPack = (await fetchSources({ homeTeam, awayTeam, league, date, localeDate })) || { items: [] };
        } catch (e) {
          sourcesPack = { items: [], error: `Eroare fetch surse: ${e?.message || e}` };
        }
      }

      // 2) Pregătire prompturi
      const systemPrompt = buildSystemPrompt();
      const userPrompt = buildUserPrompt(
        { homeTeam, awayTeam, league, date, localeDate, extraNote },
        sourcesPack
      );

      // 3) Apel OpenAI
      const useModel = model || "gpt-4o-mini"; // stabil, rapid; poți schimba la "gpt-4o" dacă vrei
      const completion = await openai.chat.completions.create({
        model: useModel,
        temperature: 0.2,
        max_tokens: 1600,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const text = completion?.choices?.[0]?.message?.content?.trim() || "Nu s-a generat conținut.";
      const meta = {
        model: useModel,
        created: completion?.created || Math.floor(Date.now() / 1000),
        id: completion?.id || null,
      };

      // 4) Salvare Mongo (dacă e configurat)
      let saved = null;
      const db = await getMongo();
      if (db) {
        const doc = {
          type: "analysis",
          homeTeam: normalizeText(homeTeam),
          awayTeam: normalizeText(awayTeam),
          league: normalizeText(league),
          date: normalizeText(date),
          localeDate: normalizeText(localeDate),
          extraNote: normalizeText(extraNote),
          sourcesPack,
          output: text,
          meta,
          createdAt: getNowISO(),
        };
        const ins = await db.collection(COLLECTION_ANALYSES).insertOne(doc);
        saved = { analysisId: ins.insertedId.toString() };
      }

      return json(res, 200, {
        ok: true,
        analysis: text,
        sources: sourcesPack,
        meta,
        saved: saved || null,
      });
    } catch (err) {
      return json(res, 500, { ok: false, error: err?.message || "Eroare generare analiză" });
    }
  }

  return json(res, 405, { ok: false, error: "Method Not Allowed" });
}

// ------- Vercel config (opțional) -------
// export const config = { runtime: "nodejs18.x" };
