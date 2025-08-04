import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt } = req.body;
  if (!prompt?.trim()) {
    return res.status(400).json({ error: 'Lipsește meciul' });
  }

  try {
    const { data } = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: `Analizează meciul: ${prompt}. Structurază răspunsul în **10 puncte** clare, numerotate.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 1200,
    });
    res.status(200).json({ reply: data.choices[0].message.content });
  } catch (err) {
    console.error("GPT error:", err.message);
    res.status(500).json({ error: "Eroare OpenAI" });
  }
}
