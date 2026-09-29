/**
 * gemini.ts
 * Multi-provider AI Caller supporting Google Gemini, OpenRouter, and OpenAI.
 * Automatically adapts based on the API key format in .env.
 */

export type GeminiMessage = {
  role: "user" | "model" | "assistant";
  parts?: { text: string }[];
  content?: string;
};

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "").trim();

export async function callGemini(
  systemPrompt: string,
  history: GeminiMessage[],
  userMessage: string,
): Promise<string> {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "your-gemini-api-key-here" || GEMINI_API_KEY.includes("your-")) {
    throw new Error("GEMINI_API_KEY is not configured in your .env file.");
  }

  // 1. OpenRouter Provider (keys starting with sk-or-v1-)
  if (GEMINI_API_KEY.startsWith("sk-or-v1-")) {
    const formattedMessages = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({
        role: m.role === "model" ? "assistant" : m.role,
        content: m.content || m.parts?.[0]?.text || "",
      })),
      { role: "user", content: userMessage },
    ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://askdata.studio",
        "X-Title": "Patient Tech Mentor SQL Studio",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: formattedMessages,
        temperature: 0.2,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenRouter API error ${response.status}: ${err}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenRouter returned empty response.");
    return content;
  }

  // 2. OpenAI Provider (standard sk- keys)
  if (GEMINI_API_KEY.startsWith("sk-") && !GEMINI_API_KEY.startsWith("sk-or-")) {
    const formattedMessages = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({
        role: m.role === "model" ? "assistant" : m.role,
        content: m.content || m.parts?.[0]?.text || "",
      })),
      { role: "user", content: userMessage },
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: formattedMessages,
        temperature: 0.2,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${err}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned empty response.");
    return content;
  }

  // 3. Google Gemini Native Provider (AIzaSy keys or standard Gemini keys)
  const GEMINI_MODEL = "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      ...history.map((m) => ({
        role: m.role === "assistant" ? "model" : m.role,
        parts: [{ text: m.content || m.parts?.[0]?.text || "" }],
      })),
      {
        role: "user",
        parts: [{ text: userMessage }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const json = (await response.json()) as {
    candidates?: { content?: { parts?: { text: string }[] } }[];
  };

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content.");

  return text;
}

