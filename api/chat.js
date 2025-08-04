export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt } = req.body;

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Cheia OpenAI nu este setată!" });
  }

  try {
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
            role: "system",
            content: "Ești un expert în fotbal. Răspunde în 10 puncte detaliate ca analiză de meci.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return res.status(500).json({ error: error.error.message });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "❌ Niciun răspuns generat.";

    return res.status(200).json({ result: content });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Eroare necunoscută." });
  }
}
