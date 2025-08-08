// api/chat.js – CommonJS stabil
const OpenAI = require("openai");

const openaiKey = process.env.OPENAI_API_KEY || "";
const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, service: "LucyOFM – api/chat", hasOpenAI: !!openaiKey });
  }

  if (req.method === "POST") {
    const { homeTeam, awayTeam } = req.body || {};
    if (!homeTeam || !awayTeam) {
      return res.status(400).json({ ok: false, error: "homeTeam și awayTeam sunt obligatorii" });
    }
    if (!openai) {
      return res.status(500).json({ ok: false, error: "OPENAI_API_KEY lipsă sau invalid" });
    }

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 1600,
        messages: [
          { role: "system", content: "Ești LucyOFM, analist român. Livrează 10 puncte clare." },
          { role: "user", content: `${homeTeam} vs ${awayTeam}` },
        ],
      });

      return res.status(200).json({
        ok: true,
        analysis: completion?.choices?.[0]?.message?.content || "Nu s-a generat conținut."
      });
    } catch (err) {
      return res.status(502).json({ ok: false, error: err.message || "Eroare OpenAI" });
    }
  }

  return res.status(405).json({ ok: false, error: "Method Not Allowed" });
};
