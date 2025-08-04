export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metoda permisă este doar POST' });
  }

  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Promptul lipseste din cerere.' });
  }

  // ✅ Log pentru verificare cheie
  console.log("CHEIA FOLOSITĂ:", process.env.OPENAI_API_KEY?.slice(0, 10));

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4', // sau 'gpt-3.5-turbo'
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Eroare OpenAI:", errorData);
      return res.status(response.status).json({ error: 'Eroare la OpenAI', details: errorData });
    }

    const data = await response.json();
    const reply = data.choices[0]?.message?.content || 'Fără răspuns';

    return res.status(200).json({ response: reply });

  } catch (error) {
    console.error("Eroare la cerere:", error);
    return res.status(500).json({ error: 'Eroare server', details: error.message });
  }
}
