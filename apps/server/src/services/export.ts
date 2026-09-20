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
/* 可打印的单页步骤卡（自包含 HTML）                                     */
/* ------------------------------------------------------------------ */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** 步骤卡直接以 HTML 形式打开，所有用户输入必须先转义 */
function escapeHtml(raw: string): string {
  return raw.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

// 数字（含 3-5、160–180 这类区间）单独包一层 <span class="num">：
// "数字字号"只作用于它们，与正文字号互不影响。
const NUMBER_PATTERN = /(\d+(?:\.\d+)?(?:\s*[-–~]\s*\d+(?:\.\d+)?)?)/g;

function richText(raw: string): string {
  return raw
    .split(NUMBER_PATTERN)
    .map((part, index) =>
      index % 2 === 1 ? `<span class="num">${escapeHtml(part)}</span>` : escapeHtml(part),
    )
    .join('');
}

function formatTemp(step: StepDto): string {
  const { temperatureCMin: min, temperatureCMax: max } = step;
  if (min === null && max === null) return '';
  if (min !== null && max !== null) return min === max ? `${min}` : `${min}-${max}`;
  return `${min ?? max}`;
}

/**
 * 把定稿（已发布版本）渲染成一张可打印的单页步骤卡。
 *
 * 卡片是自包含 HTML：内联样式与脚本，不依赖任何外部资源，
 * 下载保存后离线打开也能调字号、能打印。
 * 正文字号（--body-size）与数字字号（--num-size）是两个独立变量，
 * 顶部工具条分别调节，并记住上次的选择；打印时工具条自动隐藏。
 */
export function renderRecipeStepCard(input: ExportInput): string {
  const { recipe, version, steps, ingredients, specs } = input;
  const sortedSteps = [...steps].sort((a, b) => a.orderIndex - b.orderIndex);

  const meta: string[] = [`v${version.versionNo}`];
  if (recipe.dishCategory) meta.push(recipe.dishCategory);
  if (version.publishedAt) meta.push(`发布于 ${version.publishedAt.slice(0, 10)}`);

  const ingredientRows = ingredients
    .map((item) => {
      const notes: string[] = [];
      if (item.isVague && item.amountText) notes.push(`原话"${item.amountText}"`);
      if (item.note) notes.push(item.note);
      return `<tr><td>${richText(item.name)}</td><td class="amount">${richText(
        formatAmount(item),
      )}</td><td>${notes.length ? richText(notes.join('；')) : '—'}</td></tr>`;
    })
    .join('\n');

  const stepItems = sortedSteps
    .map((step, index) => {
      const chips: string[] = [];
      if (step.heatLevel) chips.push(HEAT_LEVEL_LABELS[step.heatLevel]);
      if (step.heatText) chips.push(`原话"${step.heatText}"`);
      const temp = formatTemp(step);
      if (temp) chips.push(`${temp} ℃`);
      const duration = formatDuration(step);
      if (duration) chips.push(duration);
      if (step.tool) chips.push(`器具：${step.tool}`);

      const chipsHtml = chips.length
        ? `<div class="chips">${chips.map((chip) => `<span class="chip">${richText(chip)}</span>`).join('')}</div>`
        : '';
      const cuesHtml = step.sensoryCues.length
        ? `<p class="cues">判断标准：${richText(step.sensoryCues.join('、'))}</p>`
        : '';

      return `<li class="step">
  <div class="step-head"><span class="step-no num">${index + 1}</span><strong>${richText(step.title)}</strong></div>
  <p class="instruction">${richText(step.instruction)}</p>
  ${chipsHtml}
  ${cuesHtml}
</li>`;
    })
    .join('\n');

  // 火候判断标准：逐步汇总"几成火 / 多少度 / 看到什么现象"，
  // 再附上从口述整理出的火候结论（原话 → 判断标准）。
  const heatRows = sortedSteps
    .map((step, index) => ({ step, index }))
    .filter(
      ({ step }) =>
        step.heatLevel ||
        step.heatText ||
        step.temperatureCMin !== null ||
        step.temperatureCMax !== null ||
        step.sensoryCues.length > 0,
    )
    .map(({ step, index }) => {
      const heat = [step.heatLevel ? HEAT_LEVEL_LABELS[step.heatLevel] : '', step.heatText ?? '']
        .filter(Boolean)
        .join('（') + (step.heatLevel && step.heatText ? '）' : '');
      const temp = formatTemp(step);
      return `<tr><td>${index + 1}. ${richText(step.title)}</td><td>${
        heat ? richText(heat) : '—'
      }</td><td>${temp ? richText(temp) : '—'}</td><td>${
        step.sensoryCues.length ? richText(step.sensoryCues.join('、')) : '—'
      }</td></tr>`;
    })
    .join('\n');

  const heatSpecs = specs.filter((spec) => spec.category === 'heat' && spec.resolvedSpec?.criterion);
  const heatSpecItems = heatSpecs
    .map(
      (spec) =>
        `<li><span class="quote">「${richText(spec.rawPhrase)}」</span> → ${richText(
          spec.resolvedSpec!.criterion!,
        )}</li>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(recipe.title)} · 步骤卡</title>
<style>
:root {
  --body-size: 14px;
  --num-size: 19px;
  --ink: #26262b;
  --muted: #6b6b70;
  --line: #d9d4cc;
  --accent: #b23a2a;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #efedea;
  color: var(--ink);
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
  font-size: var(--body-size);
  line-height: 1.55;
}
.num { font-size: var(--num-size); font-weight: 700; font-variant-numeric: tabular-nums; }

.toolbar {
  position: sticky; top: 0; z-index: 1;
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px;
  padding: 8px 16px; background: #2b2b30; color: #f5f5f5; font-size: 13px;
}
.toolbar .group { display: inline-flex; align-items: center; gap: 6px; }
.toolbar .label { color: #c9c9cf; }
.toolbar output { min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; }
.toolbar button {
  font: inherit; color: inherit; background: #44444c; border: 1px solid #5c5c66;
  border-radius: 6px; padding: 2px 10px; cursor: pointer;
}
.toolbar button:hover { background: #55555e; }
.toolbar .print { background: var(--accent); border-color: var(--accent); font-weight: 600; }
.toolbar .print:hover { background: #c54836; }
.toolbar .hint { color: #a9a9b0; margin-left: auto; }

.card { max-width: 200mm; margin: 14px auto; background: #fff; padding: 10mm 12mm; box-shadow: 0 2px 14px rgba(0,0,0,.12); }
.card header { border-bottom: 2px solid var(--ink); padding-bottom: 6px; margin-bottom: 10px; }
.card h1 { font-size: 1.7em; margin: 0 0 2px; }
.card .meta { color: var(--muted); }
.card .summary { margin: 6px 0 0; color: var(--muted); }
.card h2 { font-size: 1.15em; margin: 14px 0 6px; border-left: 4px solid var(--accent); padding-left: 8px; }
.card .empty { color: var(--muted); }

table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; vertical-align: top; }
th { background: #faf7f1; font-weight: 600; }
td.amount { white-space: nowrap; }

ol.steps { list-style: none; margin: 0; padding: 0; }
li.step { border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; margin-bottom: 8px; break-inside: avoid; }
.step-head { display: flex; align-items: baseline; gap: 8px; }
.step-no {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 1.7em; height: 1.7em; border-radius: 50%;
  background: var(--accent); color: #fff;
}
.step-head strong { font-size: 1.05em; }
.instruction { margin: 4px 0; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.chip { border: 1px solid var(--line); border-radius: 999px; padding: 0 10px; background: #faf7f1; white-space: nowrap; }
.cues { margin: 4px 0 0; color: var(--accent); }

.heat-specs { margin: 6px 0 0; padding-left: 1.2em; }
.heat-specs .quote { color: var(--muted); }

.card footer { margin-top: 12px; padding-top: 6px; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.85em; }

@page { size: A4; margin: 10mm; }
@media print {
  body { background: #fff; }
  .toolbar { display: none; }
  .card { max-width: none; margin: 0; padding: 0; box-shadow: none; }
}
</style>
</head>
<body>
<div class="toolbar">
  <span class="group">
    <span class="label">正文字号</span>
    <button type="button" data-font="body" data-delta="-1">A−</button>
    <output id="body-size-value"></output>
    <button type="button" data-font="body" data-delta="1">A＋</button>
  </span>
  <span class="group">
    <span class="label">数字字号</span>
    <button type="button" data-font="num" data-delta="-1">A−</button>
    <output id="num-size-value"></output>
    <button type="button" data-font="num" data-delta="1">A＋</button>
  </span>
  <button type="button" class="print" onclick="window.print()">打印</button>
  <span class="hint">一页放不下？把字号调小再打印。字号会记住，下次打开不用重调。</span>
</div>
<main class="card">
  <header>
    <h1>${richText(recipe.title)}</h1>
    <div class="meta">${richText(meta.join(' ｜ '))}</div>
    ${version.summary ? `<p class="summary">${richText(version.summary)}</p>` : ''}
  </header>

  <section>
    <h2>用量表</h2>
    ${
      ingredients.length
        ? `<table>
<thead><tr><th>食材</th><th>用量</th><th>备注</th></tr></thead>
<tbody>
${ingredientRows}
</tbody>
</table>`
        : '<p class="empty">暂无用量记录</p>'
    }
  </section>

  <section>
    <h2>步骤</h2>
    ${stepItems ? `<ol class="steps">\n${stepItems}\n</ol>` : '<p class="empty">暂无步骤</p>'}
  </section>

  <section>
    <h2>火候判断标准</h2>
    ${
      heatRows
        ? `<table>
<thead><tr><th>步骤</th><th>火候</th><th>温度（℃）</th><th>判断标准</th></tr></thead>
<tbody>
${heatRows}
</tbody>
</table>`
        : '<p class="empty">暂无火候记录</p>'
    }
    ${heatSpecItems ? `<ul class="heat-specs">\n${heatSpecItems}\n</ul>` : ''}
  </section>

  <footer>由「家庭食谱口述整理器」导出 · v${version.versionNo}${
    version.publishedAt ? ` · ${version.publishedAt.slice(0, 10)}` : ''
  }。原始语音保存在系统中，可随时回放核对。</footer>
</main>
<script>
(function () {
  var KEY = 'froa-step-card-fonts';
  var LIMITS = { body: [10, 24], num: [12, 40] };
  var sizes = { body: 14, num: 19 };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) {
      if (typeof saved.body === 'number') sizes.body = saved.body;
      if (typeof saved.num === 'number') sizes.num = saved.num;
    }
  } catch (e) {}
  function clamp(kind, value) {
    return Math.min(LIMITS[kind][1], Math.max(LIMITS[kind][0], value));
  }
  function apply() {
    sizes.body = clamp('body', sizes.body);
    sizes.num = clamp('num', sizes.num);
    document.documentElement.style.setProperty('--body-size', sizes.body + 'px');
    document.documentElement.style.setProperty('--num-size', sizes.num + 'px');
    document.getElementById('body-size-value').textContent = sizes.body + 'px';
    document.getElementById('num-size-value').textContent = sizes.num + 'px';
    try { localStorage.setItem(KEY, JSON.stringify(sizes)); } catch (e) {}
  }
  var buttons = document.querySelectorAll('button[data-font]');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', function () {
      var kind = this.getAttribute('data-font');
      sizes[kind] += Number(this.getAttribute('data-delta'));
      apply();
    });
  }
  apply();
})();
</script>
</body>
</html>
`;
}
