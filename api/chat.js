export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metoda permisă este doar POST" });
  }

  try {
    const prompt = req.body.prompt || "";
    if (!prompt) {
      return res.status(400).json({ error: "Lipsește prompt-ul de la utilizator" });
    }

    // Cerere către OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 300,
        temperature: 0.7,
        messages: [
          { role: "system", content: "Răspunde clar și concis la întrebările despre fotbal și analize." },
          { role: "user", content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(500).json({ error: `OpenAI API a returnat eroare: ${errorText}` });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Nu am putut genera un răspuns.";

    return res.status(200).json({ reply });

  } catch (error) {
    return res.status(500).json({ error: `Eroare server: ${error.message}` });
  }
}
