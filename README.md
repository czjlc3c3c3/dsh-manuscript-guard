# Manuscript Guard · 论文文本写作审计

[![CI](https://github.com/czjlc3c3c3/dsh-manuscript-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/czjlc3c3c3/dsh-manuscript-guard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **本仓库是 [`xmutfyh/dsh-plugin-writing-guard`](https://github.com/xmutfyh/dsh-plugin-writing-guard) 的自行维护裁剪 fork（F1 方案），不是上游。**
> 上游的英文说明保留在 [`README.en.md`](README.en.md)，仅作沿革参考。

**少解释，多论证，守住科学事实。** 本插件把"写作纪律"前置成宿主模型的行为约束，再用确定性的本地规则库做审计——
既不替你写论文，也不靠另一个模型来"打分"。

---

## 一、这个 fork 做了什么

| 项 | 说明 |
|---|---|
| **用途** | 只做**纯文本**论文写作审计，面向个人研究工作流（DSH profile `web`） |
| **保留** | 5 个文本侧工具，以及完整的确定性规则引擎 `src/rules.ts`（**规则逻辑零改动**） |
| **删除** | 全部 Word/Python 侧能力：8 个 `writing_word_*` 工具、`src/word_guard/`（12 个 Python 模块）、`.docx` 提取分支、`venv` / `DSH_PYTHON` 依赖 |
| **删除** | `autoAuditOnWrite` / `autoBrief` 自动注入机制（该机制曾把控制块以 v3 时代的 `source` 写进 agent inbox，触发 DSH session format v4 落盘准入拒收，导致会话持久化写通道卡死）。本 fork **从代码里删除**整条路径，而不是靠配置关着——插件现在**不订阅任何 DSH 事件**，只用 `ctx.tools` |
| **版本** | `2.1.0`（脱离上游 2.0.1 版本序列） |
| **适配** | peer 放宽为 `@deepseek-ai/dsh-tools: ^0.1.0-rc.6 \|\| ^0.2.0-rc.1`，同时覆盖 npm 稳定线与 0.2.x 预发布线；**不需要** `compatibility.json` 版本豁免 |
| **不发布 npm** | 从 git 直接安装 |
| **许可证** | MIT，保留上游版权声明 |

---

## 二、快速开始

### 前置条件

- DSH 0.1.x 或 0.2.x（含 `0.2.0-rc.*` / `0.2.1-alpha.*`）
- Node.js ≥ 18
- **不需要 Python**（本 fork 已无任何 Python 依赖）

### 安装

```sh
# 方式一（推荐）：以 semver 锚定 tag，依赖可复现
cd /root/.dsh/profiles/web
pnpm add "dsh-manuscript-guard@github:czjlc3c3c3/dsh-manuscript-guard#semver:^2.1.0"

# 方式二：走 dsh 命令
dsh plugin --profile web add github:czjlc3c3c3/dsh-manuscript-guard#semver:^2.1.0
```

装完需要两件手动事项：

1. **把包名写进 profile**：`package.json` 的 `dsh.profile.bundles` 加入 `"dsh-manuscript-guard"`，
   并在 `cordis.patch.yml` 里加一条 `- id: dsh-manuscript-guard` / `name: dsh-manuscript-guard`
   （`id` 是给 profile 覆盖 config 用的目标行，`name` 决定加载哪个包，两者都要写）。
2. **放行构建脚本**：git 安装会跑 `postinstall`，pnpm 默认拦截。若报
   `ERR_PNPM_IGNORED_BUILDS`，执行：

   ```sh
   cd /root/.dsh/profiles/web && pnpm approve-builds --all && pnpm install
   ```

   > ⚠️ pnpm 要的白名单键是**解析后的 codeload URL + commit 哈希**，不只是包名。
   > **换 tag / 换 commit 重装就会再撞一次**，届时重复上面这条命令即可。

### 重启

装完需要重启 DSH 才生效（**按你的纪律：重启由你亲自执行，我不代劳**）。重启后 5 个工具即注册完成，
本插件不需要任何配置项。

---

## 三、5 个工具

| 工具 | 作用 |
|---|---|
| **`writing_audit`** | 主力工具。对论文文本做写作纪律扫描；传 `filePath` 或 `text`，用 `profile` 区分文档类型 |
| **`writing_rules`** | 返回写作纪律速查清单（control-context 隔离、论证经济性、过度解释、主张校准、科研完整性）。动笔前加载 |
| **`writing_style_profile`** | 从作者历史论文统计**风格节奏指纹**（句长/段长中位数·标准差·变异系数、短长句比例、破折号/hedge/连接词密度），输出 JSON |
| **`writing_journal_profile`** | 从目标期刊代表论文蒸馏**期刊写作档案**（各章节句法/引用/epistemic fingerprint/rhetorical moves 分布）。只保存抽象统计，不保存原句 |
| **`writing_delivery_audit`** | 交付面泄漏检测（CAL）：被否决方案、修改过程残留、来源泄漏是否漏进最终成品（标题/图注/文件名/commit/PR/投稿说明等） |

### `writing_audit` 的参数

| 参数 | 说明 |
|---|---|
| `text` / `filePath` | 二选一。纯文本：`.txt` / `.md` / `.markdown` / `.tex`（**不支持 `.docx` / `.pdf`**，请先转成 Markdown） |
| `profile` | `manuscript` / `rebuttal` / `cover_letter` / `review` / `notes` / `unknown`。缺省按路径自动推断 |
| `verbose` | `true` 时输出每条问题的提示与修改建议 |
| `projectResidueTerms` | 临时追加的项目内部词表（仅本次调用生效） |
| `original` | **修改前原文**。提供后开启 Scholarship Lock（数字/百分数/p 值/CI/引用/图表编号/DOI 对比）+ Epistemic Lock（主张强度漂移、否定与零结果标记翻转、scope 边界消失） |
| `styleProfile` | 由 `writing_style_profile` 生成的 JSON。开启句长分布漂移检测 |
| `journalProfile` | 由 `writing_journal_profile` 生成的 JSON。开启 section-level Journal Fit 审计 |

### 结果怎么读

每条命中都带**严重度**（HIGH / MEDIUM / LOW）、**置信度**（conf high/medium/low）与**性质标签**：

| 标签 | 含义 | 建议动作 |
|---|---|---|
| `INVARIANT` | **科学不变量被改动**（数值、单位、否定、scope 等） | 一律回退，不要当成文风问题 |
| `VIOLATION` | 明确的规则违规（如修改过程残留） | 按最小必要修改消除 |
| `CANDIDATE` | 候选：可能是防御性写作，**也可能承担正当的边界说明** | 人工判断，**不要机械删除** |
| `ADVISORY` | 建议级（多为密度/文体统计） | 视全文语境取舍 |

> **"0 命中"不等于通过。** 规则库是确定性的文本启发式，覆盖面有限；科学内容正确性、逻辑与论证质量仍需作者自己把关。

---

## 四、四层保护

| 层 | 防什么 | 典型规则 |
|---|---|---|
| **STYLE** | 防御性写作、过度解释、语义重复、模板腔 | 修改过程残留（`revised` / `as requested` / 本轮 / 审稿人要求）、限定词堆叠、强主张缺证据、自黑式免责套话、`不是X而是Y`、重复绕圈、三连排比、`delve`/`tapestry` 等 LLM 高频词（按密度门控）、超长句与平均句长、破折号密度、Unicode 数学符号 |
| **EVIDENCE** | 润色改坏科研事实 | Scholarship Lock（数值/百分比/p 值/CI/单位/引用/图表编号/DOI）、Epistemic Lock（`associated` 不能变 `caused`、零结果标记不能消失、scope 边界不能丢）、证据状态守恒（`reported`/`observed`/`measured`/`estimated`/`simulated` 不得被替换） |
| **JOURNAL** | 与目标期刊惯例不匹配 | 章节级句法、引用密度、epistemic fingerprint、rhetorical moves 分布对比，输出契合度与主要差异 |
| **DELIVERY** | 工作上下文泄漏进成品 | `REJECTED_ALTERNATIVE_LEAKAGE`、`REVISION_PROCESS_LEAKAGE`、`PROVENANCE_LEAKAGE`、`UNJUSTIFIED_NEGATIVE_REFERENCE`、`DELIVERY_CANDIDATE` |

此外还有**篇章统计层**（v1.3）：段落节奏（碎片化/拥塞/过度整齐）、句长节奏均匀性、重复逻辑脚手架（"首先其次最后"跨段复用）、标点脚手架过载、自创框架词、空泛判断（多弱信号组合），以及**本地引用完整性**（`filePath` 同目录存在 `.bib` 时自动核对 `\cite` ↔ `.bib`、`\ref` ↔ `\label`、条目缺字段、DOI 重复）。

---

## 五、设计原则

1. **批评不是正文。** 审稿意见、用户指令、审计结论、被否决的备选方案都是**控制上下文**，不是稿件的科学依据。除非权威材料独立支持，否则不得把控制上下文的措辞写进正文。
   例如：`To prevent data leakage, ...` → `Normalization parameters were estimated from the training data.`（只陈述方法事实，不引入"为什么要防"）。
2. **优先删，而不是改写。** 一句话如果删掉不损失科学内容与论证，就删掉它；不要把无用句打磨成另一句无用句。
3. **不要关闭每一个语义闭环。** 证据 + 必要的校准解释之后就该停；假设专业读者能自己完成显然的推理。
4. **最小编辑顺序**：`CUT → PRUNE → RECAST → SPLIT`；不要自动把一句难句拆成三句解释。
5. **只接受风格限定时，默认等长或更短。**
6. **基线优先**：稿件本身 > 期刊/模板 > 插件默认值。

这些原则同时以两处形式落地：`writing_rules` 的速查文本（写作前加载），以及 `Manuscript Writing Policy`（skill 指令）。

---

## 六、工作原理与架构

```
dsh-manuscript-guard
├── src/index.ts      (21 KB)  插件装配：注册 5 个工具，仅依赖 ctx.tools
├── src/rules.ts      (249 KB) 确定性规则引擎（唯一的核心资产，97 个导出）
├── src/delivery.ts   (36 KB)  Delivery Integrity 检测（CAL）
├── skills/writing-guard/      SKILL.md + manifest.yaml（自然语言触发的指令面）
└── lib/                       编译产物（**有意提交进 git**）
```

**零网络、零 LLM、零外部进程**：所有判定都在本地用纯文本规则完成，不调用任何模型或接口，也不读取论文之外的任何文件（唯一例外是 `filePath` 同目录下的 `.bib`，用于本地引用核对）。

### 为什么 `lib/` 要提交进仓库

DSH 从 GitHub tarball 安装插件时**不跑构建步骤**。因此本地改完 `src/` 后必须 `pnpm build` 并把 `lib/` 一起提交，否则装到 DSH 里的仍是旧逻辑。

---

## 七、测试

```sh
pnpm install
pnpm build
pnpm test        # 370 通过 / 0 失败
```

370 条断言覆盖：修改过程残留的 TP/TN、文档类型推断、防御性写作与主张校准、修辞模式、LLM 关联词密度门控、Scholarship/Epistemic Lock（含 claim ladder、证据状态守恒、否定与零结果翻转）、篇章统计层（段落/句长节奏、脚手架、标点过载）、Journal Profile 蒸馏与 Journal Fit、Delivery Integrity（CAL）。

---

## 八、与上游的差异（维护须知）

| 差异点 | 说明 |
|---|---|
| 工具数 | 13 → **5**（删掉 8 个 `writing_word_*`） |
| 配置文件 | `manifest.yaml` 的工具清单从 10 项改为 5 项（上游清单本就漏列 3 个 word 工具） |
| `rules.ts` | 只有 3 行不同：文件头注释、`PLUGIN_VERSION`、`rulesBrief()` 标题。**与上游手动 merge 时这是唯一的冲突点** |
| 无配置开关 | 插件不接受任何 config（`autoAuditOnWrite` 等已随代码删除） |
| 安装方式 | 从 git 装，不走 npm；因此 `packageManager` 字段已删除（它会把本地 pnpm 强制降级到 11.x，代价是 CI 必须显式钉 pnpm 版本） |

需要恢复 Word 侧能力时，那是另一次任务（相当于上游的 F2/F3 路线），不建议把 Word 代码零散塞回本 fork。

---

## 九、隐私与安全

- 全部审计在本地完成，**不上传、不收集**任何稿件内容。
- 插件只在**显式调用工具**时读取你给出的文件路径；**不写任何状态文件**（上游的增量 state 层已随之删除）。
- 不订阅 DSH 事件，不做任何后台行为。
- 详见 [SECURITY.md](SECURITY.md)。

---

## 十、许可证

MIT，保留上游版权声明（`Copyright (c) 2026 dsh-plugin-writing-guard contributors`）。
规则引擎与设计来自上游作者 Yuanhao Feng 的工作，本 fork 仅做裁剪与 DSH 0.2.x 适配。
