import Anthropic from '@anthropic-ai/sdk';

// 食事写真から栄養価を推定するエンドポイント。
// APIキーはサーバー側の環境変数 ANTHROPIC_API_KEY からのみ読み込む（ブラウザには出さない）。

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

// 画像解析は時間がかかることがあるので上限を延ばす（Hobby プランは最大 60 秒）。
export const config = { maxDuration: 60 };

const PROMPT = `この食事写真を見て、料理名とおおよその栄養価を推定してください。日本の一般的な食品として妥当な数値にしてください。写真から油や調味料の量が読み取りにくい場合は、一般的な調理法を仮定して構いません。

もし写真に割り箸・リモコン・スマートフォンなど、大きさの分かるものが一緒に写っていたら、それをサイズの目安として使い、料理の分量をより正確に推定してください。

重要: calorie, protein, fat, carb, salt は必ず単一の数値にしてください。"180-220"のような範囲や、"約"などの文字列は使わず、あなたの最も妥当な推定値1つだけを数値で出してください。

以下のJSON形式のみを出力し、それ以外の文章（説明・前置き・コードブロック記号）は一切含めないでください:
{"name": "料理名", "calorie": 数値, "protein": 数値, "fat": 数値, "carb": 数値, "salt": 数値}`;

function toNumber(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.]/g, ''));
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST のみ対応しています' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'サーバーに ANTHROPIC_API_KEY が設定されていません' });
  }

  const { imageBase64, mimeType } = req.body ?? {};
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({ error: '画像データ(imageBase64)が必要です' });
  }

  const client = new Anthropic();

  let message;
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: imageBase64 },
            },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    });
  } catch (err) {
    const status = err?.status ?? 502;
    return res.status(status).json({ error: `Anthropic API エラー: ${err?.message || String(err)}` });
  }

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  const cleaned = text.replace(/```json|```/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return res.status(422).json({ error: '推定結果を解析できませんでした', raw: text.slice(0, 300) });
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return res.status(422).json({ error: '推定結果のJSON変換に失敗しました', raw: text.slice(0, 300) });
  }

  return res.status(200).json({
    name: typeof parsed.name === 'string' ? parsed.name : null,
    calorie: toNumber(parsed.calorie),
    protein: toNumber(parsed.protein),
    fat: toNumber(parsed.fat),
    carb: toNumber(parsed.carb),
    salt: toNumber(parsed.salt),
  });
}
