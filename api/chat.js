// api/chat.js — Composează analiza în 10 puncte pe baza fragmentelor extrase (ocolire API).
// Domenii acoperite: SportyTrader, PredictZ, Forebet, WinDrawWin, Betsloaded, plus generic.

import OpenAI from "openai";
import { collectSources } from "./extractors.js";

export const config = { runtime: "nodejs20.x" };

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const STYLE = `
- Fundal negru (UI randată dark), text alb, concis, fără caractere asiatice.
- Simboluri: ✅, ⚠️, 📊, 🎯 (fără a scrie cuvântul „Simbol”).
- Structură fixă în 10 puncte, ton profesionist, verdict asumat.
- Dacă o informație NU apare în fragmente, scrie „Nu știu / Date insuficiente”.
`;

function promptFrom({ home, away, when, sources }) {
  const s = sources.map(v => {
    if (!v.ok) return `• ${v.url} — EROARE: ${v.error}`;
    const notes = (v.notes && v.notes.length)
      ? v.notes.map(n => `  - ${n}`).join("\n")
      : "  - (nicio propoziție utilă găsită)";
    return `• ${v.source} (${v.url}) [${v.confidence}]\n${notes}`;
  }).join("\n");

  return `
Meci: ${home} vs ${away}${when ? `, data: ${when}` : ""}.
Folosești DOAR fragmentele de predicții extrase mai jos. Nu inventa date despre loturi/cote.

FRAGMENTE EXTRASE:
${s}

Cerințe de formatare și stil:
${STYLE}

Scrie strict în 10 puncte:
1) ✅ Surse & consens (menționează acordul real; dacă nu există, delimitează taberele).
2) 📊 Medie ponderată a predicțiilor (tendință 1/X/2, Under/Over, BTTS, dacă reiese).
3) 📊 Impact pe pronostic (formă/motivație/absențe — doar dacă apar).
4) 📊 Forma recentă (doar ce reiese din fragmente; altfel „Nu știu / Date insuficiente”).
5) 📊 Absențe-cheie (NUMAI dacă sunt în fragmente).
6) 📊 Golgheteri / pattern goluri (NUMAI dacă apar).
7) 📊 Posesie, cornere, cartonașe, faulturi (NUMAI dacă apar).
8) 🎯 Predicție finală ajustată (3–5 pariuri concrete: 1X2, Under/Over, BTTS, etc.).
9) ⚠️ Riscuri & alternative (divergențe între surse).
10) ✅ Verdict final (ce aș juca eu).
`;
}

async function readBody(req) {
  // Vercel Node20 ESM: folosim fallback pentru req.body
  try {
    if (req.body) return req.body;
    const raw = await new Promise((resolve) => {
      let data = ""; req.on("data", c => data += c);
      req.on("end", () => resolve(data || "{}"));
    });
    return JSON.parse(raw);
  } catch { return {}; }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { home = "", away = "", when = "", urls = [] } = await readBody(req);
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY lipsă" });
    if (!home || !away) return res.status(400).json({ error: "Parametri lipsă: 'home' și 'away'." });

    const targetUrls = Array.isArray(urls) ? urls.slice(0, 8) : [];
    const sources = await collectSources(targetUrls);

    const prompt = promptFrom({ home, away, when, sources });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.15,
      messages: [
        { role: "system", content: "Ești un analist de pariuri profesionist. Scrie concis, onest, fără umplutură." },
        { role: "user", content: prompt }
      ]
    });

    const analysis = completion.choices?.[0]?.message?.content?.trim() || "Nu știu / Date insuficiente.";
    res.status(200).json({ ok: true, home, away, when, usedUrls: targetUrls, sources, analysis });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
}
