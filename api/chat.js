import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt } = req.body;

  if (!prompt || prompt.trim() === '') {
    return res.status(400).json({ error: 'Lipsește parametrul "prompt"' });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo', // ✅ Poți pune și 'gpt-4' dacă ești sigur că ai activ
      messages: [
        {
          role: 'user',
          content: `Analizează meciul: ${prompt}. Vreau analiza structurată în 10 puncte clare, numerotate.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 1200,
    });

    const reply = completion.choices[0].message.content;
    res.status(200).json({ reply });
  } catch (error) {
    console.error('EROARE GPT:', error);
    res.status(500).json({ error: 'Eroare la OpenAI' });
  }
}
