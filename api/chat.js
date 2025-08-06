// ÎNLOCUIEȘTE CODUL

export default async function handler(req, res) {
  const { prompt } = await req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Lipsește promptul.' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content:
              'Ești LucyOFM, un expert în analiza meciurilor de fotbal. Răspunzi în 10 puncte clare: ✅ Predicții surse, ⚠️ Formă, 📊 Statistici, 🎯 Recomandări finale etc. Fii detaliat și direct.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
      }),
    });

    const data = await response.json();

    if (data.choices && data.choices[0]?.message?.content) {
      return res.status(200).json({ result: data.choices[0].message.content });
    } else {
      return res.status(500).json({ error: 'Eroare răspuns OpenAI.', raw: data });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Eroare server.', details: error.message });
  }
}
