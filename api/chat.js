import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Asigură-te că cheia este setată în Vercel
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodă nepermisă' });
  }

  try {
    const { prompt } = req.body;

    if (!prompt || prompt.trim() === '') {
      return res.status(400).json({ error: 'Prompt lipsă sau invalid.' });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `Ești un expert în fotbal care oferă analize detaliate ale meciurilor, în 10 puncte clare. Include surse de încredere precum SportyTrader, PredictZ, Forebet, WinDrawWin. Folosește simboluri precum ✅ ⚠️ 📊 🎯. Fii concis, profesionist și realist.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1200,
    });

    const output = completion.choices?.[0]?.message?.content || '❌ Nicio analiză generată.';

    res.status(200).json({ result: output });
  } catch (error) {
    console.error('Eroare în API Chat:', error);
    res.status(500).json({ error: 'Eroare server – verifică logurile sau cheia OpenAI.' });
  }
}
