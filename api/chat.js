// api/chat.js
import { OpenAI } from "openai";
import { MongoClient } from "mongodb";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const mongoUri = process.env.MONGODB_URI;
const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 8000 });

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metoda nu este permisă" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { prompt = "" } = body;

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Lipsește OPENAI_API_KEY" });
    }
    if (!process.env.MONGODB_URI) {
      return res.status(500).json({ error: "Lipsește MONGODB_URI" });
    }
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Câmpul 'prompt' este obligatoriu" });
    }

    // Conectare + salvare istoric minim
    await client.connect();
    const db = client.db("lucyofm");
    const istoric = db.collection("istoric");
    await istoric.insertOne({
      meci: prompt,
      data: new Date(),
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown"
    });

    // Apel OpenAI (model la alegere; poți schimba cu gpt-4o)
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Ești un asistent pentru analiză de meciuri, răspunzi concis, în 10 puncte, cu ✅⚠️📊🎯."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.4
    });

    const text = completion.choices?.[0]?.message?.content ?? "";

    // Logging extins (bonus cerut)
    try {
      console.log("Analiză completată pentru:", prompt.substring(0, 50));
      if (completion.usage?.total_tokens != null) {
        console.log("Cost estimat:", completion.usage.total_tokens + " tokeni");
      }
    } catch (_) {}

    return res.status(200).json({ ok: true, result: text });
  } catch (err) {
    console.error("Eroare:", err);
    return res.status(500).json({ error: err?.message || "Eroare internă" });
  } finally {
    try { await client.close(); } catch (_) {}
  }
}
