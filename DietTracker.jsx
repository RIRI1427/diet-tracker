import { useState } from 'react';

const TARGET_CALORIE = 1500;
const TARGET_SALT = 7.5;
const TARGET_P = 90;
const TARGET_F = 45;
const TARGET_C = 200;

const MEAL_TYPES = [
{ key: 'breakfast', label: '朝食' },
{ key: 'lunch', label: '昼食' },
{ key: 'dinner', label: '夕食' },
{ key: 'snack', label: '間食' },
];

function Ring({ value, target }) {
const pct = Math.min(value / target, 1.3);
const over = value > target;
const radius = 72;
const circumference = 2 * Math.PI * radius;
const offset = circumference * (1 - Math.min(pct, 1));

return (

<div className="relative w-48 h-48 mx-auto">
<svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
<circle cx="80" cy="80" r={radius} fill="none" stroke="#EAE6DD" strokeWidth="12" />
<circle
cx="80" cy="80" r={radius} fill="none"
stroke={over ? '#C4573D' : '#2F6B5E'}
strokeWidth="12"
strokeLinecap="round"
strokeDasharray={circumference}
strokeDashoffset={offset}
style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
/>
</svg>
<div className="absolute inset-0 flex flex-col items-center justify-center">
<div className={`text-4xl font-bold tabular-nums ${over ? 'text-[#C4573D]' : 'text-[#2F2A24]'}`}>
{Math.round(value)}
</div>
<div className="text-xs text-[#8A8272] mt-1">/ {target} kcal</div>
</div>
</div>
);
}

function MacroBar({ label, value, target, unit = 'g' }) {
const pct = Math.min((value / target) * 100, 100);
const over = value > target;
return (

<div className="mb-3">
<div className="flex justify-between text-sm mb-1">
<span className="text-[#5C564C] font-medium">{label}</span>
<span className={`tabular-nums ${over ? 'text-[#C4573D] font-semibold' : 'text-[#8A8272]'}`}>
{value.toFixed(1)} / {target}{unit}{over ? '（オーバー）' : ''}
</span>
</div>
<div className="h-2 rounded-full bg-[#EAE6DD] overflow-hidden">
<div
className="h-full rounded-full"
style={{
width: `${pct}%`,
background: over ? '#C4573D' : '#2F6B5E',
transition: 'width 0.4s ease'
}}
/>
</div>
</div>
);
}

export default function DietTracker() {
const [meals, setMeals] = useState([]);
const [form, setForm] = useState({
type: 'breakfast', name: '', calorie: '', protein: '', fat: '', carb: '', salt: ''
});
const [advice, setAdvice] = useState(null);
const [loadingAdvice, setLoadingAdvice] = useState(false);
const [adviceError, setAdviceError] = useState(null);
const [photoPreview, setPhotoPreview] = useState(null);
const [analyzing, setAnalyzing] = useState(false);
const [analyzeError, setAnalyzeError] = useState(null);
const [analyzed, setAnalyzed] = useState(false);

const totals = meals.reduce((acc, m) => ({
calorie: acc.calorie + Number(m.calorie || 0),
protein: acc.protein + Number(m.protein || 0),
fat: acc.fat + Number(m.fat || 0),
carb: acc.carb + Number(m.carb || 0),
salt: acc.salt + Number(m.salt || 0),
}), { calorie: 0, protein: 0, fat: 0, carb: 0, salt: 0 });

const diff = totals.calorie - TARGET_CALORIE;

function addMeal() {
if (!form.name || !form.calorie) return;
setMeals([...meals, { ...form, id: Date.now() }]);
setForm({ type: form.type, name: '', calorie: '', protein: '', fat: '', carb: '', salt: '' });
setAdvice(null);
clearPhoto();
}

function handlePhotoSelect(e) {
const file = e.target.files?.[0];
if (!file) return;
setAnalyzeError(null);
setAnalyzed(false);

const reader = new FileReader();
reader.onload = () => {
const img = new Image();
img.onload = async () => {
// Resize so the longest side is at most 1024px, and re-encode as JPEG.
// Phone photos can be several MB, which makes the request unreliable.
const maxSide = 1024;
let { width, height } = img;
if (width > height && width > maxSide) {
height = Math.round((height * maxSide) / width);
width = maxSide;
} else if (height > maxSide) {
width = Math.round((width * maxSide) / height);
height = maxSide;
}
const canvas = document.createElement('canvas');
canvas.width = width;
canvas.height = height;
const ctx = canvas.getContext('2d');
ctx.drawImage(img, 0, 0, width, height);
const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.85);

setPhotoPreview(resizedDataUrl);
await analyzePhoto(resizedDataUrl, 'image/jpeg');
};
img.onerror = () => {
setAnalyzeError('画像の読み込みに失敗しました。別の写真で試してみてね。');
};
img.src = reader.result;
};
reader.onerror = () => {
setAnalyzeError('画像の読み込みに失敗しました。別の写真で試してみてね。');
};
reader.readAsDataURL(file);

}

async function analyzePhoto(dataUrl, mimeType) {
setAnalyzing(true);
setAnalyzeError(null);
try {
const base64Data = dataUrl.split(',')[1];

const prompt = `この食事写真を見て、料理名とおおよその栄養価を推定してください。日本の一般的な食品として妥当な数値にしてください。写真から油や調味料の量が読み取りにくい場合は、一般的な調理法を仮定して構いません。

もし写真に割り箸・リモコン・スマートフォンなど、大きさの分かるものが一緒に写っていたら、それをサイズの目安として使い、料理の分量をより正確に推定してください。

重要: calorie, protein, fat, carb, salt は必ず単一の数値にしてください。"180-220"のような範囲や、"約"などの文字列は使わず、あなたの最も妥当な推定値1つだけを数値で出してください。

以下のJSON形式のみを出力し、それ以外の文章（説明・前置き・コードブロック記号）は一切含めないでください:
{"name": "料理名", "calorie": 数値, "protein": 数値, "fat": 数値, "carb": 数値, "salt": 数値}`;

const response = await fetch("https://api.anthropic.com/v1/messages", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({
model: "claude-sonnet-4-6",
max_tokens: 500,
messages: [{
role: "user",
content: [
{ type: "image", source: { type: "base64", media_type: mimeType || "image/jpeg", data: base64Data } },
{ type: "text", text: prompt }
]
}],
})
});

if (!response.ok) {
let bodyText = '';
try { bodyText = await response.text(); } catch (_) {}
setAnalyzeError(`HTTPエラー ${response.status}: ${bodyText.slice(0, 300)}`);
return;
}

let data;
try {
data = await response.json();
} catch (parseErr) {
setAnalyzeError(`レスポンスのJSON変換に失敗: ${parseErr?.message || String(parseErr)}`);
return;
}

if (data?.type === 'error') {
setAnalyzeError(`APIエラー: ${data.error?.message || JSON.stringify(data.error)}`);
return;
}

const text = data?.content?.find(b => b.type === 'text')?.text;
if (!text) {
setAnalyzeError(`解析に失敗（テキスト無し）。返答: ${JSON.stringify(data).slice(0, 300)}`);
return;
}

const cleaned = text.replace(/`json|`/g, '').trim();
const jsonMatch = cleaned.match(/{[\s\S]*}/);
if (!jsonMatch) {
setAnalyzeError(`解析に失敗（JSON無し）。返答: ${text.slice(0, 300)}`);
const nameMatch = cleaned.match(/"name"\s*:\s*"([^"]+)"/);
if (nameMatch) setForm(f => ({ ...f, name: nameMatch[1] }));
return;
}

const toNumber = (v) => {
if (typeof v === 'number') return v;
if (typeof v === 'string') {
const n = parseFloat(v.replace(/[^0-9.]/g, ''));
return isNaN(n) ? null : n;
}
return null;
};

const parsed = JSON.parse(jsonMatch[0]);
const calorie = toNumber(parsed.calorie);
const protein = toNumber(parsed.protein);
const fat = toNumber(parsed.fat);
const carb = toNumber(parsed.carb);
const salt = toNumber(parsed.salt);

setForm(f => ({
...f,
name: parsed.name ?? f.name,
calorie: calorie != null ? String(Math.round(calorie)) : f.calorie,
protein: protein != null ? String(protein) : f.protein,
fat: fat != null ? String(fat) : f.fat,
carb: carb != null ? String(carb) : f.carb,
salt: salt != null ? String(salt) : f.salt,
}));

if (calorie == null) {
setAnalyzeError('料理名は分かりましたが、数値の読み取りに失敗しました。手入力してね。');
} else {
setAnalyzed(true);
}
} catch (e) {
setAnalyzeError(`解析エラー: ${e?.name || ''} ${e?.message || String(e)}`.trim());
} finally {
setAnalyzing(false);
}

}

function clearPhoto() {
setPhotoPreview(null);
setAnalyzed(false);
setAnalyzeError(null);
}

function removeMeal(id) {
setMeals(meals.filter(m => m.id !== id));
setAdvice(null);
}

async function getAdvice() {
if (meals.length === 0) return;
setLoadingAdvice(true);
setAdviceError(null);
setAdvice(null);
try {
const mealSummary = meals.map(m => {
const t = MEAL_TYPES.find(t => t.key === m.type)?.label || m.type;
return `${t}: ${m.name}（${m.calorie}kcal, P${m.protein || 0}g/F${m.fat || 0}g/C${m.carb || 0}g, 塩分${m.salt || 0}g）`;
}).join('\n');

const prompt = `あなたはダイエットをサポートする栄養コーチです。以下の今日の食事記録を見て、200字程度の簡潔で実用的なアドバイスを日本語で書いてください。堅苦しくなく、親しみやすい口調で。次の食事で何を食べるべきか、具体的な食品名を挙げて提案してください。

【目標】
1日のカロリー目標: ${TARGET_CALORIE}kcal
塩分目標: ${TARGET_SALT}g未満
タンパク質目標: ${TARGET_P}g / 脂質目標: ${TARGET_F}g / 炭水化物目標: ${TARGET_C}g

【現在の合計】
カロリー: ${totals.calorie}kcal（目標との差: ${diff > 0 ? '+' : ''}${diff}kcal）
タンパク質: ${totals.protein.toFixed(1)}g
脂質: ${totals.fat.toFixed(1)}g
炭水化物: ${totals.carb.toFixed(1)}g
塩分: ${totals.salt.toFixed(1)}g

【今日の食事内容】
${mealSummary}

アドバイスのみを出力してください。前置きや挨拶は不要です。`;

const response = await fetch("https://api.anthropic.com/v1/messages", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({
model: "claude-sonnet-4-6",
max_tokens: 1000,
messages: [{ role: "user", content: prompt }],
})
});

const data = await response.json();
const text = data?.content?.find(b => b.type === 'text')?.text;
if (text) {
setAdvice(text);
} else {
setAdviceError('アドバイスの取得に失敗しました。もう一度試してね。');
}
} catch (e) {
setAdviceError('通信エラーが発生しました。もう一度試してね。');
} finally {
setLoadingAdvice(false);
}

}

return (

<div className="min-h-screen bg-[#F7F5F0] text-[#2F2A24]" style={{ fontFamily: "'Zen Kaku Gothic New', 'Hiragino Sans', sans-serif" }}>
<div className="max-w-md mx-auto px-5 pt-8 pb-24">

<header className="mb-6">
  <div className="text-xs tracking-widest text-[#8A8272] mb-1">DAILY BALANCE</div>
  <h1 className="text-2xl font-bold text-[#2F2A24]">今日のカロリー収支</h1>
</header>

<div className="bg-white rounded-2xl p-6 shadow-sm border border-[#EAE6DD] mb-4">
  <Ring value={totals.calorie} target={TARGET_CALORIE} />
  <div className="text-center mt-4">
    {diff > 0 ? (
      <div className="inline-block bg-[#FBEAE5] text-[#C4573D] text-sm font-semibold px-3 py-1.5 rounded-full">
        目標より +{diff}kcal オーバー
      </div>
    ) : (
      <div className="inline-block bg-[#E8F0EC] text-[#2F6B5E] text-sm font-semibold px-3 py-1.5 rounded-full">
        残り {Math.abs(diff)}kcal 食べられます
      </div>
    )}
  </div>
</div>

<div className="bg-white rounded-2xl p-5 shadow-sm border border-[#EAE6DD] mb-4">
  <div className="text-sm font-semibold text-[#5C564C] mb-3">栄養バランス</div>
  <MacroBar label="タンパク質" value={totals.protein} target={TARGET_P} />
  <MacroBar label="脂質" value={totals.fat} target={TARGET_F} />
  <MacroBar label="炭水化物" value={totals.carb} target={TARGET_C} />
  <MacroBar label="塩分" value={totals.salt} target={TARGET_SALT} />
</div>

<div className="bg-white rounded-2xl p-5 shadow-sm border border-[#EAE6DD] mb-4">
  <div className="text-sm font-semibold text-[#5C564C] mb-3">食事を記録</div>

  <div className="flex gap-2 mb-3">
    {MEAL_TYPES.map(t => (
      <button
        key={t.key}
        onClick={() => setForm({ ...form, type: t.key })}
        className={`flex-1 text-sm py-2 rounded-lg border transition-colors ${
          form.type === t.key
            ? 'bg-[#2F6B5E] text-white border-[#2F6B5E]'
            : 'bg-white text-[#8A8272] border-[#EAE6DD]'
        }`}
      >
        {t.label}
      </button>
    ))}
  </div>

  {!photoPreview && (
    <label className="flex items-center justify-center gap-2 w-full mb-2 py-3 rounded-lg border-2 border-dashed border-[#C9C2B2] text-[#5C564C] text-sm font-medium cursor-pointer hover:bg-[#F5F3ED] transition-colors">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
      写真から自動入力
      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} />
    </label>
  )}

  {photoPreview && (
    <div className="mb-3 rounded-lg overflow-hidden border border-[#EAE6DD] relative">
      <img src={photoPreview} alt="食事の写真" className="w-full h-40 object-cover" />
      <button
        onClick={clearPhoto}
        className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full"
      >
        ✕ 写真を削除
      </button>
      {analyzing && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white/95 text-[#2F2A24] text-sm font-medium px-4 py-2 rounded-full">
            AIが解析中...
          </div>
        </div>
      )}
    </div>
  )}

  {analyzed && !analyzing && (
    <div className="mb-2 text-xs text-[#2F6B5E] bg-[#E8F0EC] px-3 py-2 rounded-lg">
      AIが推定しました。数値が違ったら下で修正してね。
    </div>
  )}
  {analyzeError && (
    <div className="mb-2 text-xs text-[#C4573D] bg-[#FBEAE5] px-3 py-2 rounded-lg whitespace-pre-wrap break-all">
      {analyzeError}
    </div>
  )}

  <input
    type="text"
    placeholder="食べたもの（例: 鮭のおにぎり）"
    value={form.name}
    onChange={e => setForm({ ...form, name: e.target.value })}
    className="w-full mb-2 px-3 py-2.5 rounded-lg border border-[#EAE6DD] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F6B5E]/30 focus:border-[#2F6B5E]"
  />

  <div className="grid grid-cols-2 gap-2 mb-2">
    <input
      type="number"
      placeholder="カロリー(kcal)"
      value={form.calorie}
      onChange={e => setForm({ ...form, calorie: e.target.value })}
      className="px-3 py-2.5 rounded-lg border border-[#EAE6DD] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F6B5E]/30 focus:border-[#2F6B5E]"
    />
    <input
      type="number"
      placeholder="塩分(g)"
      value={form.salt}
      onChange={e => setForm({ ...form, salt: e.target.value })}
      className="px-3 py-2.5 rounded-lg border border-[#EAE6DD] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F6B5E]/30 focus:border-[#2F6B5E]"
    />
  </div>

  <div className="grid grid-cols-3 gap-2 mb-3">
    <input
      type="number"
      placeholder="P(g)"
      value={form.protein}
      onChange={e => setForm({ ...form, protein: e.target.value })}
      className="px-3 py-2.5 rounded-lg border border-[#EAE6DD] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F6B5E]/30 focus:border-[#2F6B5E]"
    />
    <input
      type="number"
      placeholder="F(g)"
      value={form.fat}
      onChange={e => setForm({ ...form, fat: e.target.value })}
      className="px-3 py-2.5 rounded-lg border border-[#EAE6DD] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F6B5E]/30 focus:border-[#2F6B5E]"
    />
    <input
      type="number"
      placeholder="C(g)"
      value={form.carb}
      onChange={e => setForm({ ...form, carb: e.target.value })}
      className="px-3 py-2.5 rounded-lg border border-[#EAE6DD] text-sm focus:outline-none focus:ring-2 focus:ring-[#2F6B5E]/30 focus:border-[#2F6B5E]"
    />
  </div>

  <button
    onClick={addMeal}
    disabled={!form.name || !form.calorie || analyzing}
    className="w-full py-2.5 rounded-lg bg-[#2F2A24] text-white text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#1F1B17] transition-colors"
  >
    記録に追加
  </button>
</div>

{meals.length > 0 && (
  <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#EAE6DD] mb-4">
    <div className="text-sm font-semibold text-[#5C564C] mb-3">今日の食事一覧</div>
    <div className="space-y-2">
      {meals.map(m => (
        <div key={m.id} className="flex items-center justify-between py-2 border-b border-[#F0EDE6] last:border-0">
          <div>
            <div className="text-xs text-[#8A8272]">{MEAL_TYPES.find(t => t.key === m.type)?.label}</div>
            <div className="text-sm font-medium">{m.name}</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm tabular-nums text-[#5C564C]">{m.calorie}kcal</div>
            <button
              onClick={() => removeMeal(m.id)}
              className="text-[#C4573D] text-xs px-2 py-1 hover:bg-[#FBEAE5] rounded"
            >
              削除
            </button>
          </div>
        </div>
      ))}
    </div>
  </div>
)}

<div className="bg-white rounded-2xl p-5 shadow-sm border border-[#EAE6DD]">
  <div className="flex items-center justify-between mb-3">
    <div className="text-sm font-semibold text-[#5C564C]">AIコーチからのアドバイス</div>
    <button
      onClick={getAdvice}
      disabled={meals.length === 0 || loadingAdvice}
      className="text-xs px-3 py-1.5 rounded-full bg-[#2F6B5E] text-white font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#25554A] transition-colors"
    >
      {loadingAdvice ? '考え中...' : 'アドバイスをもらう'}
    </button>
  </div>

  {meals.length === 0 && (
    <p className="text-sm text-[#8A8272]">食事を記録すると、AIコーチが次の一手を提案します。</p>
  )}

  {adviceError && (
    <p className="text-sm text-[#C4573D]">{adviceError}</p>
  )}

  {advice && (
    <div className="bg-[#F5F3ED] rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap">
      {advice}
    </div>
  )}
</div>

  </div>
</div>

);
}
