// ✅ chat.js (în folderul /api)
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!req.body || !req.body.message) {
    return res.status(400).json({ error: "Mesajul este gol." });
  }

  const userMessage = req.body.message;

  try {
    await client.connect();
    const db = client.db("lucyofm_db");
    const logs = db.collection("chat_logs");

    await logs.insertOne({ userMessage, timestamp: new Date() });

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "Răspunde ca LucyOFM Bot, în stilul Florin-Marian. Fii concis și eficient." },
          { role: "user", content: userMessage },
        ],
      }),
    });

    const openaiData = await openaiRes.json();

    if (!openaiData.choices || openaiData.choices.length === 0) {
      throw new Error("Niciun răspuns de la OpenAI.");
    }

    const botReply = openaiData.choices[0].message.content;

    await logs.insertOne({ botReply, timestamp: new Date() });

    res.status(200).json({ response: botReply });
  } catch (err) {
    console.error("Eroare API:", err);
    res.status(500).json({ error: "Eroare la răspuns." });
  } finally {
    await client.close();
  }
}
