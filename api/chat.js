import { MongoClient } from 'mongodb';
import { OpenAI } from 'openai';

const client = new MongoClient(process.env.MONGO_URI);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { message, excludedPoints = [] } = req.body;

  try {
    await client.connect();
    const db = client.db('lucyofm');
    const memory = db.collection('memory');

    // Salvăm preferințele dacă există puncte excluse
    if (excludedPoints.length > 0) {
      await memory.updateOne(
        { user: 'florin' },
        { $set: { excludedPoints } },
        { upsert: true }
      );
    }

    // Construim prompt-ul final
    const excludeText = excludedPoints.length > 0
      ? `Ignoră punctele ${excludedPoints.join(', ')} din analiza.`
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
    console.error(err);
    res.status(500).json({ error: 'Eroare server.' });
  }
}
