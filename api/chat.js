// api/chat.js
// Analiză în 10 puncte. Acceptă GET (healthcheck) și POST (analiză).

export const config = { runtime: "nodejs20.x" };

function sanitize(s) {
  return String(s || "").trim().replace(/\s+/g, " ");
}

function buildPrompt({ home, away, sources = {} }) {
  const match = `${home} – ${away}`;
  const s = {
    sporty: sources?.sportytrader || sources?.sporty || null,
    forebet: sources?.forebet || null,
    predictz: sources?.predictz || null,
  };

  return `
Ești un analist profesionist de pariuri. Dă analiza în 10 puncte, concis, cu bullet-uri.
Simboluri: ✅ (puternic), ⚠️ (incert), 📊 (statistici), 🎯 (recomandare). Nu inventa surse.

Meci: ${match}

Surse:
- SportyTrader: ${s.sporty || "indisponibil"}
- Forebet: ${s.forebet || "indisponibil"}
- PredictZ: ${s.predictz || "indisponibil"}

STRUCTURA (exact 10 puncte):
1) Surse & Predicții (pe scurt; ✅/⚠️)
2) Medie ponderată a predicțiilor (2–3 rânduri)
3) Consens 1X2 / BTTS
4) Consens Over/Under (linii principale)
5) Impact formă & absențe
6) Golgheteri & penalty-uri
7) 📊 Statistici: posesie, cornere, galbene, faulturi (dacă lipsesc, marchează)
8) Tendințe ultimele 5 meciuri
9) 🎯 Recomandări „de jucat” (3–5 opțiuni, în ordinea încrederii)
10) Note & verificări (atenționări utile)

Format: liste cu „- ”, text scurt, clar.
  `.trim();
}

function localFallback({ sources = {} }) {
  const mk = (x) => (x ? x : "indisponibil");
  return [
    `1) Surse & Predicții`,
    `- SportyTrader: ${mk(sources?.sportytrader)}`,
    `- Forebet: ${mk(sources?.forebet)}`,
    `- PredictZ: ${mk(sources?.predictz)}`,
    ``,
    `2) Medie ponderată a predicțiilor`,
    `- ⚠️ Date insuficiente pentru o medie robustă.`,
    ``,
    `3) Consens 1X2 / BTTS`,
    `- ⚠️ Fără consens ferm (lipsă date).`,
    ``,
    `4) Consens Over/Under`,
    `- ⚠️ Lipsă cote/estimări confirmate.`,
    ``,
    `5) Impact formă & absențe`,
    `- ⚠️ Necesită feed echipe/absențe.`,
    ``,
    `6) Golgheteri & penalty-uri`,
    `- 📌 Necesită surse dedicate marcatorilor.`,
    ``,
    `7) 📊 Statistici`,
    `- În lucru – se vor popula când sursele devin stabile.`,
    ``,
    `8) Tendințe ultimele 5 meciuri`,
    `- În lucru – necesită agregare istoric.`,
    ``,
    `9) 🎯 Recomandări „de jucat”`,
    `- ⚠️ Nicio recomandare fără consens minim.`,
    ``,
    `10) Note & verificări`,
    `- Dacă o sursă e blocată, analiza degradează elegant (fără a inventa).`,
  ].join("\n");
}

export default async function handler(req, res) {
  try {
    // Healthcheck rapid la GET
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, service: "LucyOFM – api/chat", node: process.version });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { home = "", away = "", sources = {} } = req.body || {};
    const H = sanitize(home), A = sanitize(away);
    if (!H || !A) return res.status(400).json({ error: "Parametrii 'home' și 'away' sunt necesari." });

    const prompt = buildPrompt({ home: H, away: A, sources });

    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_BOT || "";
    if (!apiKey) {
      // Fără OpenAI → fallback local
      return res.status(200).json({ content: localFallback({ sources }) });
    }

    // Apel REST către OpenAI (chat.completions)
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: "Ești un analist de pariuri. Răspunde concis, structurat, fără invenții." },
          { role: "user", content: prompt }
        ]
      })
    });

    const data = await r.json().catch(() => null);
    if (!r.ok) {
      return res.status(r.status).json({
        warning: data?.error?.message || "OpenAI indisponibil",
        content: localFallback({ sources })
      });
    }

    const content = data?.choices?.[0]?.message?.content || localFallback({ sources });
    return res.status(200).json({ content });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Eroare internă" });
  }
}
