import Anthropic from '@anthropic-ai/sdk';

// 今日の食事記録から栄養コーチのアドバイスを生成するエンドポイント。
// APIキーはサーバー側の環境変数 ANTHROPIC_API_KEY からのみ読み込む（ブラウザには出さない）。

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

export const config = { maxDuration: 60 };

const MEAL_LABELS = { breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食' };

const DEFAULT_TARGETS = { calorie: 1500, salt: 7.5, protein: 90, fat: 45, carb: 200 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST のみ対応しています' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'サーバーに ANTHROPIC_API_KEY が設定されていません' });
  }

  const { meals, targets } = req.body ?? {};
  if (!Array.isArray(meals) || meals.length === 0) {
    return res.status(400).json({ error: '食事データ(meals)が必要です' });
  }

  const t = {
    calorie: Number(targets?.calorie) || DEFAULT_TARGETS.calorie,
    salt: Number(targets?.salt) || DEFAULT_TARGETS.salt,
    protein: Number(targets?.protein) || DEFAULT_TARGETS.protein,
    fat: Number(targets?.fat) || DEFAULT_TARGETS.fat,
    carb: Number(targets?.carb) || DEFAULT_TARGETS.carb,
  };

  const totals = meals.reduce(
    (acc, m) => ({
      calorie: acc.calorie + Number(m.calorie || 0),
      protein: acc.protein + Number(m.protein || 0),
      fat: acc.fat + Number(m.fat || 0),
      carb: acc.carb + Number(m.carb || 0),
      salt: acc.salt + Number(m.salt || 0),
    }),
    { calorie: 0, protein: 0, fat: 0, carb: 0, salt: 0 }
  );

  const diff = totals.calorie - t.calorie;

  const mealSummary = meals
    .map((m) => {
      const label = MEAL_LABELS[m.type] || m.type || '食事';
      return `${label}: ${m.name}（${m.calorie}kcal, P${m.protein || 0}g/F${m.fat || 0}g/C${m.carb || 0}g, 塩分${m.salt || 0}g）`;
    })
    .join('\n');

  const prompt = `あなたはダイエットをサポートする栄養コーチです。以下の今日の食事記録を見て、200字程度の簡潔で実用的なアドバイスを日本語で書いてください。堅苦しくなく、親しみやすい口調で。次の食事で何を食べるべきか、具体的な食品名を挙げて提案してください。

【目標】
1日のカロリー目標: ${t.calorie}kcal
塩分目標: ${t.salt}g未満
タンパク質目標: ${t.protein}g / 脂質目標: ${t.fat}g / 炭水化物目標: ${t.carb}g

【現在の合計】
カロリー: ${totals.calorie}kcal（目標との差: ${diff > 0 ? '+' : ''}${diff}kcal）
タンパク質: ${totals.protein.toFixed(1)}g
脂質: ${totals.fat.toFixed(1)}g
炭水化物: ${totals.carb.toFixed(1)}g
塩分: ${totals.salt.toFixed(1)}g

【今日の食事内容】
${mealSummary}

アドバイスのみを出力してください。前置きや挨拶は不要です。`;

  const client = new Anthropic();

  let message;
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (err) {
    const status = err?.status ?? 502;
    return res.status(status).json({ error: `Anthropic API エラー: ${err?.message || String(err)}` });
  }

  const advice = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  if (!advice) {
    return res.status(422).json({ error: 'アドバイスを生成できませんでした' });
  }

  return res.status(200).json({ advice });
}
