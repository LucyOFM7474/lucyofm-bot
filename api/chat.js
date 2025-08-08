// api/chat.js — generare analiză în 10 puncte (GPT sau fallback local)

function sanitize(s) { return String(s || "").trim().replace(/\s+/g, " "); }

function buildPrompt({ home, away, sources = {} }) {
  const match = `${home} – ${away}`;
  const s = {
    sporty: sources?.sportytrader || sources?.sporty || null,
    forebet: sources?.forebet || null,
    predictz: sources?.predictz || null,
  };
  return `
Ești un analist profesionist de pariuri. Livrează analiza în 10 puncte, concis, cu simboluri:
✅ consens, ⚠️ risc/incert, 📊 statistică, 🎯 recomandare.

Meci: ${match}
Surse (dacă lipsesc, marchează „indisponibil”, nu inventa):
- SportyTrader: ${s.sporty || "indisponibil"}
- Forebet: ${s.forebet || "indisponibil"}
- PredictZ: ${s.predictz || "indisponibil"}

STRUCTURA FIXĂ:
1) Surse & Predicții (✅/⚠️ pe scurt)
2) Medie ponderată a predicțiilor (explică scurt)
3) Consens 1X2 (și BTTS dacă ai semnale)
4) Consens Over/Under (linii principale)
5) Impact formă & absențe (fără invenții)
6) Golgheteri & penalty-uri (dacă lipsesc date, notează)
7) 📊 Posesie, cornere, galbene, faulturi (dacă lipsesc, spune „în lucru”)
8) Tendințe ultimele 5 meciuri (fără invenții)
9) 🎯 Recomandări „de jucat” (3–5 opțiuni, în ordinea încrederii)
10) Note & verificări (atenționări utile)
`.trim();
}

function localFallback({ home, away, sources = {} }) {
  const mk = (x) => (x ? x : "indisponibil");
  return [
    `1) Surse & Predicții`,
    `- SportyTrader: ${mk(sources?.sportytrader)}`,
    `- Forebet: ${mk(sources?.forebet)}`,
    `- PredictZ: ${mk(sources?.predictz)}`,
    ``,
    `2) Medie ponderată: ⚠️ date insuficiente.`,
    `3) Consens 1X2/BTTS: ⚠️ slab.`,
    `4) Over/Under: ⚠️ fără cote stabile.`,
    `5) Impact formă & absențe: ⚠️ lipsă feed.`,
    `6) Golgheteri & penalty-uri: necesită surse.`,
    `7) 📊 Posesie/cornere/galbene/faulturi: în lucru.`,
    `8) Tendințe 5 meciuri: în lucru.`,
    `9) 🎯 De jucat: nimic fără consens minim.`,
    `10) Note: nu inventez când lipsesc date.`,
  ].join("\n");
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, service: "LucyOFM – api/chat" });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { home = "", away = "", sources = {} } = req.body || {};
    const H = sanitize(home), A = sanitize(away);
    if (!H || !A) return res.status(400).json({ error: "Parametrii 'home' și 'away' sunt necesari." });

    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_BOT || "";
    const prompt = buildPrompt({ home: H, away: A, sources });

    if (!apiKey) {
      // Fără cheie: livrăm formatul corect, dar fără recomandări ferme
      return res.status(200).json({ content: localFallback({ home: H, away: A, sources }) });
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: "Ești un analist de pariuri. Răspunde în 10 puncte, concis." },
          { role: "user", content: prompt }
        ]
      })
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({
        warning: data?.error?.message || "OpenAI indisponibil",
        content: localFallback({ home: H, away: A, sources })
      });
    }

    const content = data?.choices?.[0]?.message?.content || localFallback({ home: H, away: A, sources });
    return res.status(200).json({ content });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Eroare internă" });
  }
}
