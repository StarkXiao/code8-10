import type { IngredientDto, ResolvedSpec, StepDto } from '@froa/shared';
import { HEAT_LEVEL_LABELS, VAGUE_CATEGORY_LABELS, formatSpecSummary } from '@froa/shared';
import type { VagueCategory } from '@froa/shared';

export interface ExportSpec {
  rawPhrase: string;
  category: VagueCategory;
  status: string;
  resolvedSpec: ResolvedSpec | null;
  question: string | null;
  answerText: string | null;
  unresolvableNote: string | null;
  clipLabel: string | null;
}

export interface ExportVerification {
  performedAt: string;
  performedByName: string;
  result: string;
  deviations: string | null;
}

export interface ExportInput {
  recipe: { title: string; dishCategory: string | null };
  version: {
    versionNo: number;
    title: string;
    summary: string | null;
    changeNote: string | null;
    publishedAt: string | null;
  };
  steps: StepDto[];
  ingredients: IngredientDto[];
  specs: ExportSpec[];
  verifications: ExportVerification[];
}

const RESULT_LABELS: Record<string, string> = {
  success: '成功',
  partial: '部分成功',
  fail: '失败',
};

function formatDuration(step: StepDto): string {
  const { durationSecondsMin: min, durationSecondsMax: max } = step;
  if (min === null && max === null) return '';
  if (min !== null && max !== null) return min === max ? `${min} 秒` : `${min}-${max} 秒`;
  return `${min ?? max} 秒`;
}

function formatAmount(item: IngredientDto): string {
  if (item.amountValue !== null) return `${item.amountValue}${item.amountUnit ?? ''}`;
  if (item.amountMin !== null || item.amountMax !== null) {
    return `${item.amountMin ?? '?'}-${item.amountMax ?? '?'}${item.amountUnit ?? ''}`;
  }
  return item.amountText ?? '适量';
}

// 把已发布版本导出成一份可交付的 Markdown 食谱。
// 内容包含用量表、步骤、每条模糊口述的整理结论与依据、复做验证历史。
export function renderRecipeMarkdown(input: ExportInput): string {
  const { recipe, version, steps, ingredients, specs, verifications } = input;
  const lines: string[] = [];

  lines.push(`# ${recipe.title}`);
  lines.push('');

  const meta: string[] = [`**版本**：v${version.versionNo}`];
  if (recipe.dishCategory) meta.push(`**分类**：${recipe.dishCategory}`);
  if (version.publishedAt) meta.push(`**发布时间**：${version.publishedAt.slice(0, 10)}`);
  lines.push(meta.join(' ｜ '));
  lines.push('');

  if (version.summary) {
    lines.push(`> ${version.summary}`);
    lines.push('');
  }

  lines.push('## 用量');
  lines.push('');
  if (!ingredients.length) {
    lines.push('_暂无用量记录_');
  } else {
    lines.push('| 食材 | 用量 | 原话 | 备注 |');
    lines.push('| --- | --- | --- | --- |');
    for (const item of ingredients) {
      const amount = formatAmount(item);
      const raw = item.isVague ? (item.amountText ?? '—') : '—';
      const note = item.note ?? (item.isVague ? '由模糊口述整理而来' : '—');
      lines.push(`| ${item.name} | ${amount} | ${raw} | ${note} |`);
    }
  }
  lines.push('');

  lines.push('## 步骤');
  lines.push('');
  if (!steps.length) {
    lines.push('_暂无步骤_');
  } else {
    [...steps]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .forEach((step, index) => {
        lines.push(`### ${index + 1}. ${step.title}`);
        lines.push('');
        lines.push(step.instruction);
        lines.push('');

        const details: string[] = [];
        if (step.heatLevel) details.push(`火候：${HEAT_LEVEL_LABELS[step.heatLevel]}`);
        if (step.heatText) details.push(`原话火候：${step.heatText}`);
        if (step.temperatureCMin !== null || step.temperatureCMax !== null) {
          details.push(`温度：${step.temperatureCMin ?? '?'}-${step.temperatureCMax ?? '?'} ℃`);
        }
        const duration = formatDuration(step);
        if (duration) details.push(`时长：${duration}`);
        if (step.tool) details.push(`器具：${step.tool}`);
        if (step.sensoryCues.length) details.push(`判断标准：${step.sensoryCues.join('、')}`);

        if (details.length) {
          lines.push(details.map((detail) => `- ${detail}`).join('\n'));
          lines.push('');
        }
      });
  }

  if (specs.length) {
    lines.push('## 口述整理记录');
    lines.push('');
    lines.push('> 这些原话原本是"一点""差不多"，下面是为了让外人也能复做而整理出的结论。');
    lines.push('');
    for (const spec of specs) {
      lines.push(`### ${VAGUE_CATEGORY_LABELS[spec.category]}：${spec.rawPhrase}`);
      lines.push('');
      if (spec.question) lines.push(`- 追问：${spec.question}`);
      if (spec.answerText) lines.push(`- 答复：${spec.answerText}`);
      if (spec.resolvedSpec) {
        lines.push(`- 结论：${formatSpecSummary(spec.resolvedSpec)}`);
        if (spec.resolvedSpec.reference) lines.push(`- 参照物：${spec.resolvedSpec.reference}`);
        if (spec.resolvedSpec.substitute) lines.push(`- 替代：${spec.resolvedSpec.substitute}`);
        if (spec.resolvedSpec.criterion) lines.push(`- 判断标准：${spec.resolvedSpec.criterion}`);
        lines.push(`- 置信度：${spec.resolvedSpec.confidence}`);
      }
      if (spec.unresolvableNote) lines.push(`- 口语留白：${spec.unresolvableNote}`);
      if (spec.clipLabel) lines.push(`- 原声依据：${spec.clipLabel}`);
      lines.push('');
    }
  }

  if (verifications.length) {
    lines.push('## 复做验证');
    lines.push('');
    lines.push('| 时间 | 复做人 | 结果 | 偏差 |');
    lines.push('| --- | --- | --- | --- |');
    for (const run of verifications) {
      lines.push(
        `| ${run.performedAt.slice(0, 10)} | ${run.performedByName} | ${
          RESULT_LABELS[run.result] ?? run.result
        } | ${run.deviations ?? '—'} |`,
      );
    }
    lines.push('');
  }

  if (version.changeNote) {
    lines.push('## 本次变更说明');
    lines.push('');
    lines.push(version.changeNote);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('_由「家庭食谱口述整理器」导出。原始语音保存在系统中，可随时回放核对。_');
  lines.push('');

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* 可打印单页步骤卡（自包含 HTML）                                       */
/* ------------------------------------------------------------------ */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// 数字（含小数、区间与日期）包一层 <span class="num">，让"数字字号"能独立于正文字号调整。
// 必须在 escapeHtml 之后调用：转义用的是命名实体（&amp; &lt; &apos; …），
// 实体里不含数字，不会被误包进 span。
const NUMBER_PATTERN = /\d{4}-\d{2}-\d{2}|\d+(?:\.\d+)?(?:\s*[-–~]\s*\d+(?:\.\d+)?)?/g;

function wrapNums(escaped: string): string {
  return escaped.replace(NUMBER_PATTERN, (match) => `<span class="num">${match}</span>`);
}

/** 用户文本进卡片的唯一入口：先转义防注入，再包数字 */
function text(value: string): string {
  return wrapNums(escapeHtml(value));
}

// 步骤卡的样式。--body-size / --num-size 是页面上两个字号滑控直接改的 CSS 变量。
const CARD_CSS = `:root { --body-size: 13px; --num-size: 1.3em; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: #eceae6;
  color: #1f1f1f;
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif;
  font-size: var(--body-size);
  line-height: 1.55;
}
.num { font-size: var(--num-size); font-weight: 700; font-variant-numeric: tabular-nums; }
.muted { color: #8a8a8a; }
.toolbar {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px 14px;
  padding: 8px 14px; background: #fff; border-bottom: 1px solid #ddd;
  position: sticky; top: 0; z-index: 1;
}
.tb-group { display: inline-flex; align-items: center; gap: 4px; }
.tb-val { min-width: 3.2em; text-align: center; color: #666; font-size: 12px; }
.toolbar button {
  font: inherit; font-size: 13px; padding: 3px 10px;
  border: 1px solid #c8c4bd; border-radius: 5px; background: #faf9f7; cursor: pointer;
}
.toolbar button:hover { background: #f0ede8; }
.tb-print { background: #d46a1f !important; border-color: #d46a1f !important; color: #fff; }
.tb-hint { color: #999; font-size: 12px; }
.card {
  max-width: 190mm; margin: 14px auto; background: #fff;
  padding: 9mm 11mm; box-shadow: 0 1px 6px rgba(0, 0, 0, .15);
}
.card-head h1 { font-size: 1.5em; margin: 0 0 1mm; }
.meta { color: #777; font-size: .85em; }
.summary { margin: 2mm 0 0; color: #555; }
section { margin-top: 5mm; }
h2 {
  font-size: 1.08em; margin: 0 0 2mm; padding-left: 8px;
  border-left: 4px solid #d46a1f; line-height: 1.3;
}
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #cfccc6; padding: 3px 8px; text-align: left; vertical-align: top; }
th { background: #f5f1ea; font-weight: 600; }
tr, .steps li { break-inside: avoid; }
.col-name { width: 30%; }
.col-amount { width: 22%; }
.amount { white-space: nowrap; }
.heat-source { width: 32%; }
.steps { margin: 0; padding: 0; list-style: none; }
.steps li { display: flex; gap: 10px; padding: 2.2mm 0; border-bottom: 1px dashed #ddd; }
.steps li:last-child { border-bottom: none; }
.step-no {
  flex: none; width: 1.7em; height: 1.7em; margin-top: .1em;
  border-radius: 50%; background: #d46a1f; color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: .95em;
}
.step-body { flex: 1; min-width: 0; }
.step-title { font-weight: 700; }
.step-instruction { margin-top: 1px; }
.step-meta { color: #8a5a2b; margin-top: 2px; font-size: .92em; }
.step-cues { color: #4a6b3a; margin-top: 2px; font-size: .92em; }
.card-foot { margin-top: 6mm; color: #999; font-size: .8em; border-top: 1px solid #eee; padding-top: 2mm; }
@page { size: A4; margin: 10mm; }
@media print {
  body { background: #fff; }
  .toolbar { display: none; }
  .card { max-width: none; margin: 0; padding: 0; box-shadow: none; }
}`;

// 字号调节逻辑。这段脚本是完全静态的（不含任何用户数据），
// 用户内容只出现在 HTML 节点里且都经过 text() 转义。
const CARD_JS = `(function () {
  var KEY = 'froa.stepCard.font.v1';
  var DEF = { body: 13, num: 1.3 };
  var state = { body: DEF.body, num: DEF.num };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && isFinite(saved.body) && isFinite(saved.num)) {
      state.body = Number(saved.body);
      state.num = Number(saved.num);
    }
  } catch (err) { /* localStorage 不可用时用默认值 */ }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function apply() {
    state.body = clamp(Math.round(state.body), 10, 24);
    state.num = clamp(Math.round(state.num * 20) / 20, 1, 2.4);
    var root = document.documentElement;
    root.style.setProperty('--body-size', state.body + 'px');
    root.style.setProperty('--num-size', state.num + 'em');
    var b = document.getElementById('bodySizeVal');
    var n = document.getElementById('numSizeVal');
    if (b) b.textContent = state.body + 'px';
    if (n) n.textContent = Math.round(state.num * 100) + '%';
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (err) { /* 忽略 */ }
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-font]'), function (btn) {
    btn.addEventListener('click', function () {
      var cmd = btn.getAttribute('data-font') || '';
      if (cmd === 'reset') {
        state.body = DEF.body;
        state.num = DEF.num;
      } else {
        var parts = cmd.split(':');
        var delta = Number(parts[1]);
        if (parts[0] === 'body') state.body += delta;
        if (parts[0] === 'num') state.num += delta;
      }
      apply();
    });
  });
  var printBtn = document.getElementById('printBtn');
  if (printBtn) printBtn.addEventListener('click', function () { window.print(); });
  apply();
})();`;

/**
 * 把已发布版本渲染成一张可打印的单页步骤卡（自包含 HTML，无任何外部资源）。
 *
 * 与 Markdown 导出的"完整档案"定位不同：卡片只保留下锅时要看的三样东西 ——
 * 用量表、步骤、火候判断标准。正文字号与数字字号都可以在页面上直接调整，
 * 调整控件在打印时自动隐藏。
 */
export function renderRecipeCardHtml(input: ExportInput): string {
  const { recipe, version, steps, ingredients, specs } = input;
  const sortedSteps = [...steps].sort((a, b) => a.orderIndex - b.orderIndex);

  const meta = [`版本 v${version.versionNo}`];
  if (recipe.dishCategory) meta.push(recipe.dishCategory);
  if (version.publishedAt) meta.push(`发布于 ${version.publishedAt.slice(0, 10)}`);

  const ingredientRows = ingredients.length
    ? ingredients
        .map(
          (item) => `<tr>
  <td>${text(item.name)}</td>
  <td class="amount">${text(formatAmount(item))}</td>
  <td>${item.note ? text(item.note) : '<span class="muted">—</span>'}</td>
</tr>`,
        )
        .join('\n')
    : '<tr><td colspan="3" class="muted">暂无用量记录</td></tr>';

  const stepItems = sortedSteps.length
    ? sortedSteps
        .map((step, index) => {
          const details: string[] = [];
          if (step.heatLevel) details.push(HEAT_LEVEL_LABELS[step.heatLevel]);
          if (step.heatText) details.push(step.heatText);
          if (step.temperatureCMin !== null || step.temperatureCMax !== null) {
            details.push(`${step.temperatureCMin ?? '?'}–${step.temperatureCMax ?? '?'} ℃`);
          }
          const duration = formatDuration(step);
          if (duration) details.push(duration);
          if (step.tool) details.push(`器具：${step.tool}`);
          return `<li>
  <span class="step-no">${index + 1}</span>
  <div class="step-body">
    <div class="step-title">${text(step.title)}</div>
    <div class="step-instruction">${text(step.instruction)}</div>
    ${details.length ? `<div class="step-meta">${text(details.join(' ｜ '))}</div>` : ''}
    ${step.sensoryCues.length ? `<div class="step-cues">判断：${text(step.sensoryCues.join('、'))}</div>` : ''}
  </div>
</li>`;
        })
        .join('\n')
    : '<li class="muted">暂无步骤</li>';

  // 火候判断标准 = 各步骤的火候/温度/观察指标 + 整理结论里的火候类规格
  const heatRows: string[] = [];
  sortedSteps.forEach((step, index) => {
    const parts: string[] = [];
    if (step.heatLevel) parts.push(HEAT_LEVEL_LABELS[step.heatLevel]);
    if (step.heatText) parts.push(`原话“${step.heatText}”`);
    if (step.temperatureCMin !== null || step.temperatureCMax !== null) {
      parts.push(`${step.temperatureCMin ?? '?'}–${step.temperatureCMax ?? '?'} ℃`);
    }
    const cues = step.sensoryCues.length ? `判断：${step.sensoryCues.join('、')}` : '';
    if (!parts.length && !cues) return;
    heatRows.push(`<tr>
  <td>第 <span class="num">${index + 1}</span> 步 · ${text(step.title)}</td>
  <td>${text([...parts, cues].filter(Boolean).join(' ｜ '))}</td>
</tr>`);
  });
  for (const spec of specs) {
    if (spec.resolvedSpec?.type !== 'heat') continue;
    if (spec.status !== 'resolved' && spec.status !== 'verified') continue;
    const parts: string[] = [];
    if (typeof spec.resolvedSpec.value === 'number') {
      parts.push(`${spec.resolvedSpec.value}${spec.resolvedSpec.unit ?? ''}`);
    }
    if (spec.resolvedSpec.range) {
      parts.push(`${spec.resolvedSpec.range.min}–${spec.resolvedSpec.range.max}${spec.resolvedSpec.unit ?? ''}`);
    }
    if (spec.resolvedSpec.criterion) parts.push(spec.resolvedSpec.criterion);
    if (spec.resolvedSpec.reference) parts.push(`参照：${spec.resolvedSpec.reference}`);
    heatRows.push(`<tr>
  <td>「${text(spec.rawPhrase)}」</td>
  <td>${text(parts.join(' ｜ ') || '—')}</td>
</tr>`);
  }

  const heatSection = heatRows.length
    ? `<table>
  <thead><tr><th class="heat-source">来源</th><th>火候与判断标准</th></tr></thead>
  <tbody>
${heatRows.join('\n')}
  </tbody>
</table>`
    : '<p class="muted">还没有整理出火候判断标准。</p>';

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(recipe.title)} · 步骤卡 v${version.versionNo}</title>
<style>
${CARD_CSS}
</style>
</head>
<body>
<div class="toolbar">
  <strong>步骤卡</strong>
  <span class="tb-group">正文字号
    <button type="button" data-font="body:-1" aria-label="正文字号减小">A−</button>
    <span id="bodySizeVal" class="tb-val"></span>
    <button type="button" data-font="body:1" aria-label="正文字号增大">A+</button>
  </span>
  <span class="tb-group">数字字号
    <button type="button" data-font="num:-0.1" aria-label="数字字号减小">A−</button>
    <span id="numSizeVal" class="tb-val"></span>
    <button type="button" data-font="num:0.1" aria-label="数字字号增大">A+</button>
  </span>
  <button type="button" data-font="reset">恢复默认</button>
  <button type="button" id="printBtn" class="tb-print">打印</button>
  <span class="tb-hint">字号设置会在此浏览器记住；内容超过一页时可调小字号再打印</span>
</div>
<main class="card">
  <header class="card-head">
    <h1>${text(recipe.title)}</h1>
    <div class="meta">${text(meta.join(' ｜ '))}</div>
    ${version.summary ? `<p class="summary">${text(version.summary)}</p>` : ''}
  </header>

  <section>
    <h2>用量</h2>
    <table>
      <thead><tr><th class="col-name">食材</th><th class="col-amount">用量</th><th>备注</th></tr></thead>
      <tbody>
${ingredientRows}
      </tbody>
    </table>
  </section>

  <section>
    <h2>步骤</h2>
    <ol class="steps">
${stepItems}
    </ol>
  </section>

  <section>
    <h2>火候判断标准</h2>
    ${heatSection}
  </section>

  <footer class="card-foot">由「家庭食谱口述整理器」导出的定稿步骤卡（v<span class="num">${version.versionNo}</span>）。原始语音与整理依据保存在系统中，可随时回放核对。</footer>
</main>
<script>
${CARD_JS}
</script>
</body>
</html>
`;
}
