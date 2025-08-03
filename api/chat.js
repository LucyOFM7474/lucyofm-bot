// api/chat.js
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { meci } = req.body;
  if (!meci) return res.status(400).json({ error: 'Lipsește parametrul "meci"' });

  const prompt = `Ești un analist sportiv român concis.
Primești numele unui meci (ex. "FCSB-CFR Cluj") și returnezi fix 10 puncte de analiză, cu bullet "•".
Folosește doar informații publice recente din GSP, Digisport, Flashscore, Transfermarkt etc.

Structura:
1. Forma ultimelor 5 meciuri fiecare echipă
2. Clasament & obiective
3. Absențe / accidentări
4. Vreme / teren
5. H2H ultimele 5 directe
6. Cote case (1X2, GG, +2.5)
7. Presiune & context
8. Jucători de urmărit
9. Stil / tactici așteptate
10. Predicție neutră

Meci: ${meci}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1000,
    temperature: 0.35,
  });

  res.status(200).json({ raspuns: completion.choices[0].message.content.trim() });
}
