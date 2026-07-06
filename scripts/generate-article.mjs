// 每週自動產出 TIPS 英典教育的一篇 SEO 部落格文章（在 GitHub Actions 雲端執行）
// 流程：讀佇列 → 掃 blog/ 找出下一篇 → 呼叫 Anthropic API 產出 HTML → 寫到 blog/{slug}.html
// 需要環境變數：ANTHROPIC_API_KEY（GitHub Secret）
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BLOG_DIR = path.join(ROOT, "blog");
const QUEUE = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "article-queue.json"), "utf8"));
const MODEL = process.env.ARTICLE_MODEL || "claude-sonnet-4-6";
const SITE = "https://www.tips-edu.com";

function out(key, val) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${val}\n`);
}

// 找出下一篇尚未存在的文章
fs.mkdirSync(BLOG_DIR, { recursive: true });
const existing = new Set(fs.readdirSync(BLOG_DIR).filter(f => f.endsWith(".html")).map(f => f.replace(/\.html$/, "")));
let next = QUEUE.find(a => !existing.has(a.slug));

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error("缺少 ANTHROPIC_API_KEY"); process.exit(1); }

// 佇列產完時，自動請 AI 想一個「不重複」的新題目，加入佇列後續產
if (!next) {
  console.log("佇列已產完，改為自動產生新題目…");
  next = await proposeNewTopic();
  if (!next) {
    console.error("自動想題失敗，這週先跳過。");
    out("status", "done");
    process.exit(0);
  }
  QUEUE.push(next);
  fs.writeFileSync(path.join(ROOT, "scripts", "article-queue.json"), JSON.stringify(QUEUE, null, 1), "utf8");
  console.log("新題目已加入佇列：", next.slug, next.title);
}
console.log("這次要寫：", next.slug, next.title);

async function proposeNewTopic() {
  let brandCtx = "";
  try { brandCtx = fs.readFileSync(path.join(ROOT, "scripts", "brand-context.md"), "utf8"); } catch {}
  const done = QUEUE.map(a => `- ${a.title}（關鍵字：${a.keyword}，slug：${a.slug}）`).join("\n");
  const now = new Date();
  const month = now.getMonth() + 1;
  const topicPrompt = `${brandCtx ? "===== 品牌事實與規範 =====\n" + brandCtx + "\n=====\n\n" : ""}你是 TIPS 英典教育（台中南屯升學補習班）的 SEO 內容策略師。
以下是已經寫過（或已排定）的所有文章，新題目「絕對不可以」與它們重複或高度相似（主題、關鍵字、slug 都要避開）：
${done}

請提出 1 個新的部落格文章題目，要求：
- 目標讀者：台中南屯的國小～高中家長；搜尋意圖明確、有搜尋量的長尾關鍵字。
- 考慮現在是 ${month} 月的季節性（開學、段考、會考學測、寒暑假等）。
- 能自然連到本站課程頁（/elementary.html、/junior-senior-high.html、/abroad.html 或 /）。
- slug 用小寫英文與連字號，不可與上面清單重複。
只輸出一個 JSON 物件（不要 markdown 圍欄），格式：
{"slug":"...","title":"...","keyword":"...","intent":"...","internalPage":"...","angle":"..."}`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1000, messages: [{ role: "user", content: topicPrompt }] }),
  });
  if (!r.ok) { console.error("想題 API 失敗：", r.status, await r.text()); return null; }
  const d = await r.json();
  let txt = (d.content || []).map(b => b.text || "").join("").trim();
  txt = txt.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  let t;
  try { t = JSON.parse(txt); } catch { console.error("想題輸出不是合法 JSON：", txt.slice(0, 200)); return null; }
  if (!t.slug || !t.title || !t.keyword) { console.error("想題輸出欄位不完整"); return null; }
  t.slug = String(t.slug).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const taken = new Set([...QUEUE.map(a => a.slug), ...existing]);
  if (taken.has(t.slug)) { console.error("新題 slug 與既有重複：", t.slug); return null; }
  if (!t.internalPage) t.internalPage = "/";
  if (!t.intent) t.intent = "資訊";
  if (!t.angle) t.angle = "";
  return t;
}

const canonical = `${SITE}/blog/${next.slug}.html`;

// 讀取品牌事實檔（含可引用事實與禁止事項）
let brand = "";
try { brand = fs.readFileSync(path.join(ROOT, "scripts", "brand-context.md"), "utf8"); } catch {}

const prompt = `${brand ? "===== 品牌事實與規範（最高優先，務必嚴格遵守，違反即重寫）=====\n" + brand + "\n===== 以上為事實依據，文章內容不得逾越或捏造 =====\n\n" : ""}你是 TIPS 英典教育（台中市南屯區的升學補習班，${SITE}）的 SEO 內容編輯。
請寫一篇「可直接發佈的完整 HTML 頁面」，主題如下：

標題：${next.title}
主關鍵字：${next.keyword}
搜尋意圖：${next.intent}
內容角度：${next.angle}
要連到的課程頁：${next.internalPage}
canonical 網址：${canonical}

規格（務必遵守）：
- 繁體中文（zh-Hant），約 1500 字，語氣溫暖、專業、可信、不過度推銷、不誇大不實。
- 輸出「只有」一份完整 HTML 文件，從 <!doctype html> 到 </html>，不要任何說明文字或 markdown 圍欄。
- <head> 要有：<meta charset>、viewport、<title>（含主關鍵字，結尾「｜TIPS 英典教育」）、<meta name="description">（80～90 字、含主關鍵字與行動呼籲）、<link rel="canonical" href="${canonical}">、og:type/title/description/url、og:image=${SITE}/og-image.png、twitter:card=summary_large_image。
- <body> 頂部放深藍導覽列，連結：/ 首頁、/elementary.html 國小部、/junior-senior-high.html 國高中部、/abroad.html 菲律賓遊學、/media.html 媒體報導、https://lin.ee/ZkwZc3d 加入 LINE 諮詢。
- 內容：一個 <h1>（含主關鍵字）；以家長焦慮為出發的引言；3～5 個 <h2> 段落（可含 <ul>）；適時帶入「台中南屯／在地」觀點；一個「常見問題」<h2> 區含 3 題 Q&A（<h3> 問題 + <p> 回答）。
- 文中自然以 <a href="${next.internalPage}"> 連到指定課程頁，並連到首頁。
- 自然帶入 TIPS 優勢（KC 科基語測 AI 個人化、愛美語全美語、Lumos 英文閱讀素養、進度透明回報），但不要堆砌。
- CTA 區：預約免費落點診斷 + <a href="https://lin.ee/ZkwZc3d"> 加入 LINE 諮詢、電話 0905-547839、地址 台中市南屯區中和里黎明路一段295號。
- 頁尾放聯絡資訊與內部連結。
- 內嵌 CSS，品牌色：深藍 #161D2E、金 #F5A623，乾淨易讀（標題深藍、H2 左側金色色條、CTA 用淺金底）。
- 最後加 <script type="application/ld+json"> 的 Article 結構化資料：headline、description、inLanguage "zh-Hant"、image ${SITE}/og-image.png、author 與 publisher 皆為 EducationalOrganization「TIPS 英典教育」、mainEntityOfPage "${canonical}"。`;

const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: MODEL,
    max_tokens: 8000,
    messages: [{ role: "user", content: prompt }],
  }),
});

if (!res.ok) {
  console.error("Anthropic API 失敗：", res.status, await res.text());
  process.exit(1);
}
const data = await res.json();
let html = (data.content || []).map(b => b.text || "").join("").trim();
// 去掉可能的 markdown 圍欄
html = html.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
if (!html.toLowerCase().startsWith("<!doctype")) {
  const i = html.toLowerCase().indexOf("<!doctype");
  if (i > 0) html = html.slice(i);
}
if (!html.toLowerCase().includes("</html>")) {
  console.error("產出內容不像完整 HTML，停止以免寫入壞檔。");
  process.exit(1);
}

const file = path.join(BLOG_DIR, `${next.slug}.html`);
fs.writeFileSync(file, html, "utf8");
console.log("已寫入", file, html.length, "bytes");

out("status", "created");
out("slug", next.slug);
out("title", next.title);
out("keyword", next.keyword);
out("url", canonical);
