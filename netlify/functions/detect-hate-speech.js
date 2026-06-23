// Netlify serverless function — hate speech detection via Claude API

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "API key not configured" }) };
  }

  let text;
  try {
    ({ text } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Text is required" }) };
  }

  if (text.length > 5000) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Text too long (max 5000 chars)" }) };
  }

  const systemPrompt = `You are a hate speech detection system. Analyze the given text and respond ONLY with a valid JSON object (no markdown, no explanation outside JSON).

JSON format:
{
  "is_hate_speech": boolean,
  "confidence": "low" | "medium" | "high",
  "severity": "none" | "mild" | "moderate" | "severe",
  "categories": string[],
  "explanation": string,
  "flagged_phrases": string[]
}

Categories (use only relevant ones): ["racism", "casteism", "sexism", "religious_hatred", "homophobia", "threats", "bullying", "slurs", "incitement_to_violence"]

Rules:
- Analyze text in ANY language (Hindi, English, Hinglish, etc.)
- "flagged_phrases" should list specific words/phrases that triggered detection (empty array if none)
- "explanation" should be 1-2 sentences, in the same language style as the input if possible
- Be accurate — not every rude comment is hate speech; hate speech targets people based on identity`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: "user", content: `Analyze this text for hate speech:\n\n${text}` }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { statusCode: response.status, headers, body: JSON.stringify({ error: data.error?.message || "API error" }) };
    }

    const raw = (data.content || []).map(i => i.text || "").join("").trim();

    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      // Try to extract JSON if wrapped in text
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        result = JSON.parse(match[0]);
      } else {
        throw new Error("Could not parse model response as JSON");
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
