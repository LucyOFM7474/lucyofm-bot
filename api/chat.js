// api/chat.js — CommonJS + Prompt complet LucyOFM (10 puncte)
// ENV necesară: OPENAI_API_KEY

const OpenAI = require("openai");

// ---- OpenAI ----
const openaiKey = process.env.OPENAI_API_KEY || "";
const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

// ---- Utils ----
const nowISO = () => new Date().toISOString();
const norm = (s) => (s || "").toString().trim();

function buildSystemPrompt() {
  return `
Ești "LucyOFM – Analize Meciuri", asistent în limba română (fără caractere asiatice).
Ton: profesionist, direct, eficient și asumat (ca și cum ai paria tu).
Răspunsul trebuie să respecte STRICT structura de mai jos, în EXACT 10 puncte + concluzie.

1) Surse & Predicții — listează surse populare (SportyTrader, PredictZ, Forebet, WinDrawWin etc.). Marchează: ✅ consens, ⚠️ parțial.
   Dacă nu ai linkuri/date din context, scrie explicit: "Date indisponibile – fără linkuri în acest context".
2) Medie ponderată a predicțiilor — explică în 1–2 fraze cum ai ponderat (ex: consens > 3 surse crește ponderea).
3) Impactul pe pronostic — formă, absențe, motivație, program aglomerat, rotații, stiluri.
4) Forma recentă — ultimele 5 meciuri (tendințe scurte).
5) Accidentări/Suspendări — DOAR absentele cu impact (dacă nu știi, scrie "Date indisponibile").
6) Golgheteri & penalty-uri — marcatori cheie; dacă nu sunt informații: "Date indisponibile".
7) Statistici — posesie medie, cornere, galbene, faulturi (acasă/deplasare) sau menționează lipsa: "Date indisponibile".
8) Predicție finală ajustată — scor estimat + 3–5 pariuri clare (1/X/2, under/over, BTTS, cornere etc.), format compact.
9) Build-up bilet (cu motivație scurtă):
   • Solist sigur (cote ~1.40–1.60)
   • Valoare ascunsă (1.70–2.00)
   • Surpriză controlată (2.10–2.40)
10) Știri de ultimă oră / alerte indisponibilități — dacă nu există: "Nu sunt informații suplimentare verificate".

Reguli:
- Nu inventa date; când lipsesc, scrie "Date indisponibile".
- Evită jucători ieșiți din lot; marchează incertitudinile ca atare.
- Redă strict în română. Fără liste goale. Fără text vag.
- Încheie cu secțiunea **"De jucat:"** cu 2–3 selecții prioritare (cele mai solide), pe scurt.
`;
}

function buildUserPrompt({ homeTeam, awayTeam, league, date, localeDate, extraNote }) {
  const L = [];
  L.push(`MECI: ${homeTeam} vs ${awayTeam}`);
  if (league) L.push(`Competiție: ${league}`);
  if (date) L.push(`Data (UTC): ${date}`);
  if (localeDate) L.push(`Data (local): ${localeDate}`);
  if (extraNote) L.push(`Observații: ${extraNote}`);
  L.push("");
  L.push("Nu ai acces la linkuri live în acest context; când lipsesc date concrete, marchează explicit 'Date indisponibile'.");
  L.push("Livrează exact structura cerută (10 puncte + 'De jucat:').");
  return L.join("\n");
}

// ---- Handler ----
module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      service: "LucyOFM – api/chat (CJS + prompt complet)",
      time: nowISO(),
      hasOpenAI: !!openaiKey
    });
  }

  // body safe
  let body = req.body || {};
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }

  if (req.method === "POST") {
    const {
      homeTeam, awayTeam,
      league = "", date = "", localeDate = "", extraNote = "",
      model = "gpt-4o-mini"
    } = body || {};

    if (!homeTeam || !awayTeam) {
      return res.status(400).json({ ok: false, error: "homeTeam și awayTeam sunt obligatorii" });
    }
    if (!openai) {
      return res.status(500).json({ ok: false, error: "OPENAI_API_KEY lipsește sau este invalid" });
    }

    try {
      const systemPrompt = buildSystemPrompt();
      const userPrompt = buildUserPrompt({
        homeTeam: norm(homeTeam),
        awayTeam: norm(awayTeam),
        league: norm(league),
        date: norm(date),
        localeDate: norm(localeDate),
        extraNote: norm(extraNote)
      });

      const completion = await openai.chat.completions.create({
        model,
        temperature: 0.2,
        max_tokens: 1600,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      });

      const analysis = (completion?.choices?.[0]?.message?.content || "").trim() || "Nu s-a generat conținut.";
      return res.status(200).json({ ok: true, analysis, meta: { model } });
    } catch (err) {
      return res.status(502).json({
        ok: false,
        error: "Eroare la apelul OpenAI",
        detail: err?.message || String(err)
      });
    }
  }

  return res.status(405).json({ ok: false, error: "Method Not Allowed" });
};
