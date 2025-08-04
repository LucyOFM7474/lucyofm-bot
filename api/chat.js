export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Doar POST este acceptat." });
  }

  try {
    const { mesaj } = req.body;

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Cheia API nu este setată." });
    }

    const prompt = `
Scrie o analiză completă în 10 puncte pentru meciul: ${mesaj}.
Fii concis, bine structurat și profesional.
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 1000,
      }),
    });

    const data = await response.json();

    if (response.status !== 200) {
      return res.status(500).json({ error: "Eroare OpenAI: " + (data.error?.message || "necunoscută") });
    }

    const reply = data.choices?.[0]?.message?.content;
    res.status(200).json({ text: reply || "Fără răspuns." });
  } catch (err) {
    res.status(500).json({ error: "Eroare internă: " + err.message });
  }
}
