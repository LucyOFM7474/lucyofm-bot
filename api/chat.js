// api/chat.js (Node 20, ESM). Composează analiza în 10 puncte pe baza extraselor țintite.
// Evităm API-urile site-urilor: luăm doar fragmentele cu „Pronostic/Pont/Prediction”.

import OpenAI from "openai";
import { collectSources } from "./extractors.js";

export const config = { runtime: "nodejs20.x" };

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Set implicit: stil „GPT-5 Thinking (extins, argumentat)” – fundal negru, text alb, ✅⚠️📊🎯, fără caractere asiatice.
const STYLE_INSTRUCTIONS = `
- Răspuns pe fundal negru (text simplu ce va fi randat într-un container dark).
- Folosește simboluri: ✅, ⚠️, 📊, 🎯 (fără a menționa cuvântul „Simbol”).
- Structură fixă în 10 puncte, concis, fără caractere asiatice.
- Română, ton profesionist, direct, asumat. Verdict clar.
`;

function buildPrompt({ home, away, when, sources }) {
  const srcTxt = sources.map(s => {
    if (!s.ok) return `• ${s.url} — EROARE: ${s.error}`;
    const notes = s.notes && s.notes.length ? s.notes.map(n => `  - ${n}`).join("\n") : "  - (fără bloc util găsit)";
    return `• ${s.source} (${s.url}) [${s.confidence}]\n${notes}`;
  }).join("\n");

  return `
Ești un analist de pariuri profesionist. Meci: ${home} vs ${away}${when ? `, data: ${when}` : ""}.
Ai voie să folosești doar fragmentele de PREDICȚII extrase mai jos (nu inventa, nu „citi” restul paginii).

FRAGMENTE EXTRASE (țintit pe Pronostic/Pont/Prediction):
${srcTxt}

Cerințe:
${STYLE_INSTRUCTIONS}

Format obligatoriu în 10 puncte:
1) ✅ Surse & consens (marchează consensul real; dacă diferă, explică scurt).
2) 📊 Medie ponderată a predicțiilor (arătă tendința 1/X/2, Under/Over).
3) 📊 Impact pe pronostic (forma, motivația, absențe – DOAR dacă reies din fragmente).
4) 📊 Forma recentă (tendință din ce ai, fără a inventa).
5) 📊 Absențe-cheie (NUMAI dacă apar în fragmente).
6) 📊 Golgheteri / pattern goluri (NUMAI dacă apar în fragmente).
7) 📊 Posesie, cornere, cartonașe, faulturi (NUMAI dacă apar în fragmente).
8) 🎯 Predicție finală ajustată (3–5 pariuri clare).
9) ⚠️ Riscuri & alternative (unde există divergențe între surse).
10) ✅ Verdict final (ce aș juca eu, pe scurt).

IMPORTANT:
- Dacă o informație NU apare în fragmente, spune „Nu știu / Date insuficiente”.
- Nu inventa cote, marcatori sau liste de indisponibilități.
- Păstrează totul compact, „no fluff”.
`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { home = "", away = "", when = "", urls = [] } = await (async () => {
      try { return await req.json?.() || await new Promise(r => {
          let data = ""; req.on("data", c => data += c);
          req.on("end", () => r(JSON.parse(data || "{}")));
        });
      } catch { return {}; }
    })();

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY lipsă în Vercel" });
    }
    if (!home || !away) {
      return res.status(400).json({ error: "Parametri lipsă: 'home', 'away' sunt obligatorii" });
    }

    // Surse implicite dacă nu trimiți tu explicit
    const defaultUrls = [
      // Adaugă pagina de preview a meciului pe SportyTrader (RO/EN/FR – merge orice limbă)
      // Exemplu: "https://www.sportytrader.com/en/betting-tips/..."
    ];
    const targetUrls = (Array.isArray(urls) && urls.length ? urls : defaultUrls).slice(0, 5);

    // 1) colectăm fragmentele țintite (pronostic/pont/prediction)
    const sources = await collectSources(targetUrls);

    // 2) compunem promptul
    const prompt = buildPrompt({ home, away, when, sources });

    // 3) generăm răspunsul
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // rapid și suficient pentru acest pas; poți schimba în gpt-4o
      temperature: 0.2,
      messages: [
        { role: "system", content: "Ești un analist de pariuri profesionist, concis, onest, fără înflorituri." },
        { role: "user", content: prompt }
      ]
    });

    const text = completion.choices?.[0]?.message?.content?.trim() || "Nu am primit conținut.";
    return res.status(200).json({
      ok: true,
      home, away, when,
      usedUrls: targetUrls,
      sources,
      analysis: text
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
