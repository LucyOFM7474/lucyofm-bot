export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { mesaj } = req.body;

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Lipsește cheia OpenAI" });
  }

  if (!mesaj || mesaj.trim().length === 0) {
    return res.status(400).json({ error: "Mesajul este gol" });
  }

  try {
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content:
              "Răspunde în română cu o analiză detaliată în 10 puncte despre meciul introdus. Fii obiectiv, profesionist și structurat clar.",
          },
          {
            role: "user",
            content: mesaj,
          },
        ],
        temperature: 0.7,
      }),
    });

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      return res.status(openaiResponse.status).json({
        error: data.error?.message || "Eroare necunoscută de la OpenAI",
      });
    }

    const raspuns = data.choices?.[0]?.message?.content;

    return res.status(200).json({ raspuns });
  } catch (err) {
    return res.status(500).json({ error: "Eroare server: " + err.message });
  }
}
