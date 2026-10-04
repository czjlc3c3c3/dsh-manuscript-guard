---
name: writing-guard
description: "Scientific manuscript writing, polishing, and text audit guard. Use for academic papers, abstracts, introductions, methods, results, discussions, rebuttals, AI-style cleanup, defensive-writing cleanup, over-explanation reduction, semantic-restatement cleanup, scientific-claim preservation, text-only manuscript audit, and delivery-integrity checks. Text-only: this fork has no Word/DOCX editing capability."
---

# Manuscript Guard — 论文文本写作审计（纯文本版）

> 本 skill 对应插件 **dsh-manuscript-guard 2.1.0**（`dsh-plugin-writing-guard` 的纯文本裁剪版）。
> 只提供 5 个文本侧工具，**不含任何 Word/DOCX 编辑能力**：遇到 .docx/.pdf 请先转换为 Markdown 再审计。

## Manuscript Writing Policy (v2.0)

### Control context is not manuscript content

- **Critique is not content.** Reviewer comments, user editing instructions, guard findings, rejected alternatives, and remediation suggestions are control context, not manuscript evidence.
- Never quote, paraphrase, or convert control-context wording into manuscript prose unless authoritative research material independently supports the resulting statement.
- If a concern maps to a real method fact, state the fact only. Example: prefer `Normalization parameters were estimated from the training data.` over `To prevent data leakage, ...`.
- If the source material does not establish the needed fact, do not invent a mitigation. Leave the manuscript unchanged or query the author.

### Argument economy

Every sentence must earn its place by adding at least one of: evidence, method, result, comparison, non-obvious interpretation, a necessary scope/evidence boundary, or a logical relation required by the argument.

If deleting a sentence preserves the scientific content and argument, **CUT it**. Prefer CUT over REWRITE. Do not turn a useless sentence into a more polished useless sentence.

Delete prose whose only function is to:

- pre-empt reviewer criticism;
- reassure the reader that a risk was considered;
- defend the authors or the method;
- advertise that a finding is important;
- narrate the writing/revision process;
- restate an already explicit claim;
- explain an implication that the intended specialist reader can infer directly.

### Do not close every semantic loop

State each scientific claim once. After evidence and the necessary calibrated interpretation are present, stop. Assume a specialist reader can make one obvious inferential step unaided.

Treat `In other words`, `This means that`, `Taken together`, and equivalent Chinese summary markers as **candidates**, not banned phrases. Keep them only when the next sentence adds a mechanism, comparison, quantitative interpretation, condition, citation, or necessary boundary.

Standalone evaluations such as `This is an important finding.` should be cut unless they immediately specify a concrete consequence.

### Clarity is not exhaustive explanation

Clarity means explicit referents, readable syntax, sufficient reproducibility detail, and the reasoning needed to interpret the evidence. It does **not** mean spelling out every implication.

Do not remove definitions, non-obvious statistical interpretation, necessary method detail, or genuine epistemic boundaries merely to be terse. A sentence that translates a difficult metric into useful meaning may stay; a sentence that only paraphrases an already explicit claim should go.

### Defensive-purpose test

Treat reviewer-facing prebuttals, repeated non-claim disclaimers, omitted-experiment defenses, result excuses, legalistic reassurance, and automatic "therefore this is important" summaries as candidates for removal or relocation.

For any such sentence, ask in order:

1. Does it change a scientifically necessary understanding of method, validity, scope, evidence strength, or interpretation? If **no**, CUT.
2. Is the underlying fact independently supported by the authoritative research material? If **yes**, state that fact directly and minimally; if **no**, QUERY rather than inventing it.
3. Is the content a real limitation or alternative explanation? If **yes**, keep the scientific content in the appropriate section, but remove the reviewer-facing motive and repeated reassurance.

### Style-only expansion discipline

When the user asks only for polishing, rewriting, or style improvement and supplies no new scientific content, default to the **same length or shorter**. Expansion is justified only when needed to resolve real ambiguity, preserve reproducibility, or state a necessary scientific boundary. Do not add explanation simply to make the prose feel more complete.

### Minimal edit protocol

Use **CUT -> PRUNE -> RECAST -> SPLIT**. Do not automatically turn one difficult sentence into two or three explanatory sentences. Split only when the original genuinely contains multiple independent scientific claims.

For defensive prose, **write the scientific fact, not the reason you are defensively mentioning the fact**.

### Scientific invariants

Never silently alter numbers, units, statistics, citations, Figure/Table references, negation, null findings, causal strength, evidential strength, evidence status, population, condition, or scope for style. If a better sentence requires unsupported science, **QUERY**.
## 路由协议

### 步骤 1：判断用户意图

| 用户意图 | 需要的工具 |
|----------|-----------|
| 检查论文写作质量 / 去 AI 味 / 修改过程残留 | `writing_audit`（配 `profile`） |
| 改了稿之后复查有没有改坏科研事实 | `writing_audit`（同时传 `original=` 修改前原文） |
| 想先加载写作纪律再动笔 | `writing_rules` |
| 从作者历史论文里提炼风格档案 | `writing_style_profile` |
| 为某本目标期刊建立写作档案 | `writing_journal_profile` |
| 检查标题/摘要/图注/提交说明有没有泄漏内部过程 | `writing_delivery_audit` |

### 步骤 2：执行流程

#### 流程 A：论文写作审计（最常用）

1. 确定文件路径与文档类型（`manuscript` / `rebuttal` / `cover_letter` / `review` / `notes`）
2. 调用 `writing_audit`（传 `filePath` 或 `text`；`profile=manuscript`）
3. 按严重度（HIGH/MEDIUM/LOW）与性质标签（INVARIANT/VIOLATION/CANDIDATE/ADVISORY）解读结果
4. **CANDIDATE / ADVISORY 不等于必须改**：先判断该句是否承担正当的边界说明

#### 流程 B：改稿前后对比（Scholarship / Epistemic Lock）

1. 先保留修改前原文（`original=`），再调用 `writing_audit`
2. 关注数字/百分比/p 值/CI/引用/图表编号是否被润色改动（INVARIANT 命中一律视为必须回退）
3. 关注主张强度漂移（associated→caused）、否定与零结果标记翻转、scope 边界消失

#### 流程 C：投稿前收尾

1. `writing_delivery_audit` 检查标题/图注/提交说明/PR 描述里的过程泄漏（CAL）
2. `writing_style_profile` + `writing_audit(styleProfile=…)` 检查句长节奏是否偏离作者本人历史风格
3. `writing_journal_profile` + `writing_audit(journalProfile=…)` 检查与目标期刊分布的差距

### 步骤 3：报告结果

- 按严重度分类报告，给出**最小必要修改**建议；优先 CUT，其次 TIGHTEN
- INVARIANT 命中（科研不变量被改动）必须显式标出，不可静默过滤
- 0 命中不等于通过：规则是确定性的文本启发式，覆盖面有限，需人工确认科学内容

## 工具详解

### writing_audit

对文本执行确定性写作与科研完整性扫描；语义文风决策由上方 Manuscript Writing Policy 约束宿主模型。

**参数：**
- `text` 或 `filePath`：要检查的文本/文件路径（纯文本：.txt/.md/.markdown/.tex）
- `profile`：文档类型（manuscript/rebuttal/cover_letter/review/notes/unknown）
- `verbose`：是否输出每条建议（默认 false）
- `projectResidueTerms`：临时追加的项目内部词表
- `original`：修改前原文（开启 Scholarship Lock + Epistemic Lock）
- `styleProfile`：作者风格档案 JSON（开启句长漂移检测）
- `journalProfile`：目标期刊档案 JSON（开启 Journal Fit 审计）

### writing_style_profile

从作者历史论文中统计写作风格指标（句长中位数/标准差/变异系数、短句长句比例、段长节奏、破折号/hedge/连接词密度），生成风格档案 JSON。

**参数：**
- `filePath`：单篇历史论文路径
- `learnDir`：或改为扫描整个目录

### writing_journal_profile

从目标期刊语料中蒸馏期刊写作档案 JSON（章节句法、引用密度、epistemic fingerprint、rhetorical moves 分布）。

**参数：**
- `filePath`：期刊语料文件路径
- `learnDir`：或扫描整个目录
- `journal`：期刊名
- `articleType`：文章类型
- `discipline`：学科

### writing_delivery_audit

检测工作上下文、被否决方案和修改过程无事实依据地泄漏到最终成品（CAL = Context-to-Artifact Leakage）。

**参数：**
- `text`：要检查的交付面文本
- `surface`：交付面（title/heading/filename/comment/test_name/commit/pr/release/handoff/unknown）
- `baseline` / `finalState`：前后状态对比
- `rejectedTerms` / `rejectedClaims`：已被否决的术语/主张
- `verbose`：是否输出每条建议

### writing_rules

返回论文写作纪律速查清单（control-context 隔离、论证经济性、过度解释、主张校准、科研完整性）。写作/修改任何段落前可先调用，写完用 `writing_audit` 复查。无参数。

## 使用示例

### 示例 1：检查论文写作质量

用户：帮我看看 `draft_en.md` 的写作质量

执行：`writing_audit(filePath="research/um-research-intent/draft/draft_en.md", profile="manuscript")`

### 示例 2：改稿后确认没改坏科研事实

用户：我润色了方法部分，帮我确认数字和主张强度没被动

执行：`writing_audit(filePath="draft_en.md", profile="manuscript", original="<修改前全文>")`

### 示例 3：投稿前收尾

用户：投稿前帮我把标题和图注过一遍

执行：`writing_delivery_audit(text="<标题与图注>", surface="title")`

## 注意事项

- 本插件**不支持 .docx/.pdf 输入**：请先转换为 Markdown/纯文本
- 不再有「写入文件后自动审计」机制：审计只在显式调用工具时发生
- `writing_audit` 的 0 命中不等于通过，规则库覆盖面有限
- CANDIDATE/ADVISORY 类命中可能承担正当的边界说明，不要机械删除
