export default async function handler(req, res) {
  const { message } = await req.body;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: message }],
    })
  });

  const data = await response.json();
  res.status(200).json({ reply: data.choices[0].message.content });
}
