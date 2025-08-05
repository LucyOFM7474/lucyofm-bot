import { MongoClient } from 'mongodb';
import OpenAI from 'openai';

const client = new MongoClient(process.env.MONGO_URI);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { message, excludedPoints = [] } = req.body;

  try {
    await client.connect();
    const db = client.db('lucyofm');
    const memory = db.collection('memory');

    await memory.updateOne(
      { user: 'default' },
      { $set: { excludedPoints } },
      { upsert: true }
    );

    const prompt = `Ignoră punctele [${excludedPoints.join(', ')}] din analiză. Analizează: ${message}`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
    });

    res.status(200).json({ reply: completion.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: 'Eroare la procesare.' });
  }
}
