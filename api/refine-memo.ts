// Vercel Edge Function: 音声文字起こしテキストを OpenRouter(4o-mini) で箇条書きに整形する中継。
// OPENROUTER_API_KEY はサーバー側 env（VITE_ を付けない）で保持し、ブラウザには露出させない。
export const config = { runtime: "edge" };

const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

const SYSTEM_PROMPT = [
  "あなたはメモ整形アシスタントです。",
  "入力は音声認識で文字起こしされた、対戦の振り返りメモ（日本語）です。",
  "これを読みやすい日本語の箇条書きに整形してください。",
  "ルール：",
  "- 各行を「・」で始める短い箇条書きにする",
  "- 要点のみ。フィラー（えー、あの等）や重複、言い直しは削る",
  "- 事実・気づき・反省点を簡潔に。誇張や創作はしない",
  "- 前置き・見出し・説明文は付けず、箇条書きだけを返す",
].join("\n");

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return json({ error: "OPENROUTER_API_KEY が未設定です。" }, 500);

  let text = "";
  try {
    const body = (await req.json()) as { text?: string };
    text = (body?.text || "").trim();
  } catch {
    return json({ error: "リクエストの解析に失敗しました。" }, 400);
  }
  if (!text) return json({ error: "テキストが空です。" }, 400);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return json({ error: `OpenRouter ${res.status}: ${detail.slice(0, 300)}` }, 502);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const result = data?.choices?.[0]?.message?.content?.trim() || "";
    if (!result) return json({ error: "整形結果が空でした。" }, 502);
    return json({ result });
  } catch (error) {
    return json({ error: `整形に失敗しました: ${String(error)}` }, 500);
  }
}
