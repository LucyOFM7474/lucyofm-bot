import fetch from "node-fetch";

export default async function handler(req, res) {
  // Acceptăm doar metoda POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Citim corpul requestului
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { prompt } = body;

    if (!prompt) {
      return res.status(400).json({ error: "Promptul lipsește" });
    }

    // Verificăm cheia API
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Cheia API nu este configurată corect" });
    }

    // Apelăm API-ul OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "Ești un asistent care răspunde scurt și clar." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      }),
    });

    // FIX: verificăm dacă răspunsul este valid
    if (!response.ok) {
      const text = await response.text();
      console.error("Eroare API:", text);
      return res.status(response.status).json({ error: text });
    }

    const data = await response.json();

    // Trimitem răspunsul la client
    res.status(200).json({ result: data.choices[0].message.content });
  } catch (err) {
    console.error("Eroare server:", err);
    res.status(500).json({ error: "Eroare internă de server" });
  }
}
