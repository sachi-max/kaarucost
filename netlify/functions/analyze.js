// Netlify serverless function — proxies photo analysis to Anthropic API
// API key stays safe on the server (set as environment variable in Netlify)

exports.handler = async (event) => {
  // Allow CORS for your own site
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "API key not configured on server" }) };
  }

  try {
    const { imageData, mediaType, fileKind, images, prompt, textOnly } = JSON.parse(event.body);

    if (!prompt) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing prompt" }) };
    }

    function blockFor(data, media, kind) {
      const isPdf = kind === "pdf" || media === "application/pdf";
      return isPdf
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: data } }
        : { type: "image", source: { type: "base64", media_type: media || "image/jpeg", data: data } };
    }

    // Build content: text-only, OR multiple images array, OR single image (legacy)
    let content;
    if (textOnly) {
      content = [{ type: "text", text: prompt }];
    } else if (Array.isArray(images) && images.length) {
      content = images.map(im => blockFor(im.data, im.media, im.kind));
      content.push({ type: "text", text: prompt });
    } else if (imageData) {
      content = [blockFor(imageData, mediaType, fileKind), { type: "text", text: prompt }];
    } else {
      content = [{ type: "text", text: prompt }];
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: textOnly ? 2500 : 1000,
        messages: [{
          role: "user",
          content: content,
        }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { statusCode: response.status, headers, body: JSON.stringify({ error: data.error?.message || "API error" }) };
    }

    const text = (data.content || []).map(i => i.text || "").join("").trim();
    return { statusCode: 200, headers, body: JSON.stringify({ text }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
