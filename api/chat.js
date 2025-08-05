import { MongoClient } from 'mongodb';
import OpenAI from 'openai';

const client = new MongoClient(process.env.MONGODB_URI);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = await req.json?.() || req.body || {};
    const { message, excludedPoints = [] } = body;

    if (!message) {
      return res.status(400).json({ error: 'Missing message.' });
    }

    await client.connect();
    const db = client.db('lucyofm');
    const memory = db.collection('memory');

    if (excludedPoints.length > 0) {
      await memory.updateOne(
        { user: 'florin' },
        { $set: { excludedPoints } },
        { upsert: true }
      );
    }

    const excludeText = excludedPoints.length > 0
      ? `Ignoră punctele ${excludedPoints.join(', ')} din analiză.`
      : '';

    const finalPrompt = `${excludeText}\nAnalizează meciul: ${message}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'Ești un analist sportiv profesionist.' },
        { role: 'user', content: finalPrompt }
      ]
    });

    res.status(200).json({ response: completion.choices[0].message.content });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Eroare la procesare.' });
  }
}
