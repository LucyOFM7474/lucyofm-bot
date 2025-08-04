// api/chat.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ message: 'Message is required' });
  }

  try {
    const apiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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
            content: "Răspunde ca un expert în fotbal. Redă analiza în 10 puncte clare, concise, bine structurate, fără introducere sau concluzie.",
          },
          {
            role: "user",
            content: message,
          },
        ],
        temperature: 0.7,
      }),
    });

    const data = await apiResponse.json();

    if (data?.choices?.[0]?.message?.content) {
      return res.status(200).json({ response: data.choices[0].message.content });
    } else {
      console.error("Eroare de la OpenAI:", data);
      return res.status(500).json({ message: "Eroare OpenAI", data });
    }
  } catch (error) {
    console.error("Eroare server:", error);
    return res.status(500).json({ message: "Eroare la generare" });
  }
}
