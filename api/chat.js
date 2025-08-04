import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodă invalidă" });
  }

  const { meci } = req.body;

  if (!meci || meci.length < 3) {
    return res.status(400).json({ error: "Parametrul 'meci' este invalid" });
  }

  try {
    const prompt = `Realizează o analiză în 10 puncte pentru meciul de fotbal "${meci}". Fii clar, obiectiv, cu date utile pentru pariori.`;

    const chat = await openai.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-4",
      temperature: 0.7,
    });

    const reply = chat.choices[0]?.message?.content;
    res.status(200).json({ rezultat: reply });
  } catch (err) {
    res.status(500).json({ error: "Eroare OpenAI sau cheie invalidă." });
  }
}
