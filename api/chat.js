import { OpenAI } from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ reply: "Metodă nepermisă" });
  try {
    const { message } = req.body;
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Ești un expert în fotbal. Analizează fiecare meci în 10 puncte." },
        { role: "user", content: message }
      ]
    });
    res.status(200).json({ reply: completion.choices[0].message.content });
  } catch (e) {
    res.status(500).json({ reply: "Eroare server" });
  }
};
