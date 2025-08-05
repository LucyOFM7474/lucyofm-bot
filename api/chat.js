import { MongoClient } from 'mongodb';
import { OpenAI } from 'openai';

const client = new MongoClient(process.env.MONGO_URI);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { message, excludedPoints = [] } = req.body;

  try {
    await client.connect();
    const db = client.db("lucyofm");
    const memory = db.collection("memory");

    await memory.updateOne(
      { user: 'Florin' },
      { $set: { excludedPoints } },
      { upsert: true }
    );

    const excludeText = excludedPoints.length > 0
      ? `Ignoră punctele ${excludedPoints.join(", ")} din analiză.` : '';

    const chatCompletion = await openai.chat.completions.create({
      messages: [{ role: "user", content: `${excludeText} ${message}` }],
      model: "gpt-4o"
    });

    const reply = chatCompletion.choices[0]?.message?.content || "Eroare răspuns.";

    res.status(200).json({ reply });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Eroare server" });
  } finally {
    await client.close();
  }
}