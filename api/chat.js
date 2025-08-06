import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  const { messages } = await req.json();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
  });

  return new Response(
    JSON.stringify({ result: completion.choices[0].message.content }),
    { status: 200 }
  );
}
