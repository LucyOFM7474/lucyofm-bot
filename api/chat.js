import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metoda nu este permisă" });
  }

  const { prompt } = req.body;
  if (!prompt?.trim()) {
    return res.status(400).json({ error: "Introdu un meci valid" });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: `Analizează meciul: ${prompt} și oferă o analiză clară, structurată în exact 10 puncte numerotate.`,
        },
      ],
      max_tokens: 800,
      temperature: 0.7,
    });

    res.status(200).json({ reply: completion.choices[0].message.content });
  } catch (err) {
    console.error("Eroare OpenAI:", err.message);
    res.status(err.status || 500).json({
      error: err.message || "Eroare la procesarea cererii.",
    });
  }
}
