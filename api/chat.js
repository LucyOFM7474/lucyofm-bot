// api/chat.js
// GET = health-check; POST = generare analiză în 10 puncte (cu fallback local dacă lipsește cheia).

export const config = { runtime: "nodejs18.x" };

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
Ești un analist profesionist de pariuri. Dă analiza în 10 puncte (structura fixă de mai jos), concis, clar, cu bullet-uri și formulări „de jucat”.
Folosește simboluri: ✅ (consens/puternic), ⚠️ (incert), 📊 (statistici), 🎯 (recomandare). Nu inventa surse; dacă lipsesc, marchează „indisponibil”.

Meci: ${match}

Surse (deschide doar dacă există):
- SportyTrader: ${s.sporty || "indisponibil"}
- Forebet: ${s.forebet || "indisponibil"}
- PredictZ: ${s.predictz || "indisponibil"}

STRUCTURA (exact 10 puncte):
1) Surse & Predicții (✅/⚠️, enumeră pe scurt ce spune fiecare sursă)
2) Medie ponderată a predicțiilor (explică pe scurt)
3) Consens 1X2 (BTTS dacă există)
4) Consens Over/Under (linii principale)
5) Impact formă & absențe (pe scurt, fără invenții)
6) Golgheteri & penalty-uri (dacă nu ai surse, marchează ca „necesită surse dedicate”)
7) Statistici: posesie, cornere, galbene, faulturi (📊, dacă lipsesc, notează „în lucru”)
8) Tendințe din ultimele 5 meciuri (fără invenții)
9) Recomandări „de jucat” (3–5 opțiuni, în ordinea încrederii)
10) Note & verificări (atenționări utile)

Formatare: liste cu „- ”, simboluri, text scurt.
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
    `- ⚠️ Necesar feed de echipe & absențe.`,
    ``,
    `6) Golgheteri & penalty-uri`,
    `- 📌 Necesită surse dedicate marcatorilor.`,
    ``,
    `7) 📊 Statistici: posesie, cornere, galbene, faulturi`,
    `- În lucru – se vor popula când sursele devin stabile.`,
    ``,
    `8) Tendințe ultimele 5 meciuri`,
    `- În lucru – necesită agregare istoric.`,
    ``,
    `9) 🎯 Recomandări „de jucat” (în ordinea încrederii)`,
    `- ⚠️ Nicio recomandare fermă fără consens minim.`,
    ``,
    `10) Note & verificări`,
    `- Dacă o sursă este blocată temporar, analiza degradează elegant (fără a „inventa”).`,
  ].join("\n");
}

export default async function handler(req, res) {
  try {
    // ✅ Health-check (poți testa direct în browser)
    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        service: "LucyOFM – api/chat",
        method: "GET",
        hint: "Trimite POST cu {home, away, sources?} pentru analiza în 10 puncte."
      });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { home = "", away = "", sources = {} } = req.body || {};
    const H = sanitize(home), A = sanitize(away);
    if (!H || !A) return res.status(400).json({ error: "Parametrii 'home' și 'away' sunt necesari." });

    const prompt = buildPrompt({ home: H, away: A, sources });

    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_BOT || "";
    if (!apiKey) {
      return res.status(200).json({ content: localFallback({ home: H, away: A, sources }) });
    }

    // REST call la OpenAI (chat.completions)
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
          { role: "system", content: "Ești un analist de pariuri. Răspunde concis, cu liste clare." },
          { role: "user", content: prompt }
        ]
      })
    });

    const data = await r.json().catch(() => null);
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
