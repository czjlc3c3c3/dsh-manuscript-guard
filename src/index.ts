import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  auditText,
  formatReport,
  rulesBrief,
  detectDocumentProfile,
  computeStyleProfile,
  computeJournalProfileFromDocuments,
  PLUGIN_VERSION,
  type DocumentProfile,
  type StyleProfile,
  type JournalProfile,
  type JournalDocument,
} from './rules.ts'
import {
  auditDelivery,
  formatDeliveryReport,
  type DeliverySurface,
  type DeliveryAuditOptions,
} from './delivery.ts'
import fs from 'node:fs/promises'
import path from 'node:path'

export const name = 'dsh-manuscript-guard'

export const inject = ['tools']


export interface Config {
  /** audit 时是否默认 verbose（输出每条建议） */
  verboseByDefault: boolean
  /** 项目内部词表（追加到默认内部词，命中按 medium 报） */
  projectResidueTerms: string[]
}

/**
 * 默认配置（内部常量，不导出）。
 * 注意：不能 `export const Config = {...}` —— cordis 会把导出的 Config 当
 * standard-schema 校验（调用 `Config["~standard"].validate`），普通对象没有
 * `~standard` 属性会抛 "Cannot read properties of undefined (reading 'validate')"
 * 导致整个插件树加载失败。必须作为内部常量 + apply 默认参数使用。
 */
const DEFAULT_CONFIG: Config = {
  verboseByDefault: false,
  projectResidueTerms: [],
}

/** 默认项目内部词表（通用痕迹，不含 priority/SHA-256 等普通学术词） */
const DEFAULT_PROJECT_TERMS = ['source_map', 'reader 锚点', 'iteration_log', 'final_audit', 'blueprint', 'full_corpus']

/** 从文件读取文本（本裁剪版只处理纯文本：不支持 .docx/.pdf） */
async function readTextFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.docx' || ext === '.doc') {
    throw new Error(`"${filePath}" 是 DOCX 文档；本插件（dsh-manuscript-guard）只审计纯文本，请先转换为 Markdown 再执行 writing_audit。`)
  }
  if (ext === '.pdf') {
    throw new Error(`"${filePath}" 是 PDF 文档，请先调用 anydoc 工具转换为 Markdown，再对转换结果执行 writing_audit`)
  }
  return fs.readFile(filePath, 'utf8')
}

/** 从文件读取论文文本（.txt/.md/.markdown/.tex 等纯文本直读；本裁剪版不支持 .docx） */
export function apply(ctx: Context, config: Partial<Config> = {}): void {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const projectTerms = [...new Set([...DEFAULT_PROJECT_TERMS, ...(cfg.projectResidueTerms ?? [])])]
  ctx.tools.register(defineTool({
    name: 'writing_audit',
    description:
      '对论文/稿件文本执行写作纪律扫描（本地规则，零网络）：检测修改过程残留（revised/本轮/投稿前…）、' +
      '主张校准（we do not claim/防御密度/限定词堆叠/强主张缺证据/自黑免责套话…）、修辞模式（不是X而是Y/重复绕圈/三连排比/绝对化/多重"的"字链）、' +
      'LLM 关联词（delve/tapestry/过渡词堆叠/中文套话/空洞热词密度）、学术文体（超长句堆叠/抽象副词/句长偏离作者风格/平均句长）、' +
      '格式（破折号密度/冒号标题/Unicode 数学符号）。' +
      '可指定 profile（manuscript/rebuttal/cover_letter/review/notes）区分文档类型——rebuttal 中 "as requested" 不报警。' +
      '频率类规则按密度计算（英文按词、中文按字，每千语言单位）。' +
      'v0.6：传 original=修改前文本 开启 Scholarship Lock（对比数字/citation/图表编号是否被润色改动）；' +
      '传 styleProfile=作者历史风格档案 JSON 开启句长分布漂移检测。' +
      'v0.7：新增中文"的"字修饰链、平均句长（英 ≤18 词/中 ≤25 字）、自黑式免责套话（"基于假数据/模型毫无意义"）与空洞热词密度规则（借鉴 ko5.6sol 文体指南，密度门控避免误伤领域术语）。' +
      'v0.8：传 original 同时开启 Epistemic Lock——主张强度漂移（associated→caused，Yila claim ladder）、否定/零结果标记翻转、scope 边界消失；' +
      'v1.0：证据状态守恒（reported/observed/measured/estimated/simulated 消失或被替换时核验——"participants reported improvement" 不能变成 "participants improved"）；' +
      '命中带性质标签（INVARIANT/VIOLATION/CANDIDATE/ADVISORY）：INVARIANT=科学不变量被改动，CANDIDATE=防御性候选（可能承担正当边界，勿自动删除）。' +
      '版本差距过大（全文重写）时自动降级为 version-gap 提示，避免行级对比噪音。' +
      'v1.3 篇章统计层：段落节奏（碎片化/拥塞/过度整齐）、句长节奏均匀（局部 run + 作者历史 std 对比）、重复逻辑脚手架（首先其次最后/第一第二第三跨段落复用）、标点脚手架过载（括号/冒号/分号/引号/破折号同句聚集）、自创框架词（XX化/XX力/A-B-C 短线）、空泛判断（多弱信号组合）与本地引用完整性（filePath 同目录存在 .bib 时自动检查 \\cite key ↔ .bib、\\ref ↔ \\label、条目缺字段、DOI 重复）。' +
      'v1.6.2 期刊写作引擎（corpus-aware + epistemic fingerprint + rhetorical moves + semantic hardening）：传 journalProfile=Journal Profile JSON（由 writing_journal_profile 生成）开启 section-level Journal Fit 审计（句法/引用/epistemic/rhetorical move 指标 vs 目标期刊分布，含 Profile Confidence）。' +
      'v1.7.0 DELIVERY 收尾层：检测工作上下文、被否决方案和修改过程无事实依据地泄漏到最终成品（CAL = Context-to-Artifact Leakage）。' +
      '输入 text 或 filePath（纯文本：.txt/.md/.markdown/.tex）。' +
      `（dsh-manuscript-guard v${PLUGIN_VERSION}）`,
    parameters: {
      text: { type: 'string', description: '要检查的文本内容（与 filePath 二选一）' },
      filePath: { type: 'string', description: '要检查的文本文件路径（.txt/.md；二选一）' },
      profile: { type: 'string', enum: ['manuscript', 'rebuttal', 'cover_letter', 'review', 'notes', 'unknown'], description: '文档类型（可选；缺省按路径自动检测，纯文本默认 unknown）' },
      verbose: { type: 'boolean', description: 'true 时输出每条问题的提示与修改建议（默认 false，只输出原文摘要）' },
      projectResidueTerms: { type: 'array', items: { type: 'string' }, description: '临时追加的项目内部词表（仅本次调用生效；命中按 medium 报；持久配置见插件 config.projectResidueTerms）' },
      original: { type: 'string', description: 'v0.6/v0.8 修改前的原文。提供后开启 Scholarship Lock（数字/百分数/p 值/CI/引用/图表编号/DOI 对比，变化按 HIGH 报）+ Epistemic Lock（主张强度漂移/否定与零结果翻转/scope 边界消失）——语言润色不应改变科研事实' },
      styleProfile: { type: 'string', description: 'v0.6/v1.3 Author Style Profile：作者历史风格档案 JSON（由 writing_style_profile 生成，含句长/段长节奏指纹）。提供后检测句长分布偏离（median 漂移 + std/CV 整齐度对比，v1.3）' },
      journalProfile: { type: 'string', description: 'v1.6.2 Journal Profile：目标期刊写作档案 JSON（由 writing_journal_profile 生成，含章节句法/引用/epistemic fingerprint/rhetorical moves 分布）。提供后输出 section-level Journal Fit 报告与 Profile Confidence' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      let text = args.text as string | undefined
      let profile: DocumentProfile | undefined
      if (args.profile && args.profile !== 'unknown') {
        profile = args.profile as DocumentProfile
      } else if (args.filePath) {
        profile = detectDocumentProfile(args.filePath)
      }
      // v1.3：filePath 同目录探测 .bib（local-citation-integrity 数据源；零网络）
      let bibText: string | undefined
      if (typeof args.filePath === 'string' && args.filePath) {
        try {
          const dir = path.dirname(args.filePath)
          const bibs = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.bib'))
          if (bibs.length > 0) {
            bibText = await fs.readFile(path.join(dir, bibs[0]), 'utf8')
          }
        } catch {
          // 目录不可读/无 .bib：跳过引用完整性检查
        }
      }
      if (!text && args.filePath) {
        text = await readTextFile(args.filePath)
      }
      if (!text || !text.trim()) {
        throw new Error('需要提供 text 或 filePath（内容不能为空）')
      }
      const extraTerms = Array.isArray(args.projectResidueTerms)
        ? args.projectResidueTerms.filter((x): x is string => typeof x === 'string')
        : []
      let styleProfile: StyleProfile | undefined
      if (typeof args.styleProfile === 'string' && args.styleProfile.trim()) {
        try {
          styleProfile = JSON.parse(args.styleProfile) as StyleProfile
        } catch {
          throw new Error('styleProfile 不是合法的 JSON（请使用 writing_style_profile 生成）')
        }
      }
      let journalProfile: JournalProfile | undefined
      if (typeof args.journalProfile === 'string' && args.journalProfile.trim()) {
        try {
          journalProfile = JSON.parse(args.journalProfile) as JournalProfile
        } catch {
          throw new Error('journalProfile 不是合法的 JSON（请使用 writing_journal_profile 生成）')
        }
      }
      const report = auditText(text, {
        profile,
        projectResidueTerms: [...projectTerms, ...extraTerms],
        original: typeof args.original === 'string' && args.original.trim() ? args.original : undefined,
        styleProfile,
        bibText,
        journalProfile,
      })
      const verbose = args.verbose ?? cfg.verboseByDefault
      return formatReport(report, { verbose })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'writing_style_profile',
    description:
      'v0.6/v1.3 Author Style Profile：从作者历史论文（.md/.tex/.txt）统计写作风格指标——句长中位数/标准差/变异系数、短句比例/长句比例、段长中位数/标准差/变异系数、破折号/hedge/连接词密度，' +
      '输出"节奏指纹"风格档案 JSON——零网络零 LLM，纯本地统计。' +
      '用法：对作者以前发表的论文目录/文件调用本工具得到 profile JSON，' +
      '再在 writing_audit 的 styleProfile 参数传入该 JSON，即可检测新稿件句长分布是否偏离作者历史风格（median 漂移 + std/CV 整齐度对比，v1.3 adaptive threshold）。' +
      `（dsh-manuscript-guard v${PLUGIN_VERSION}）`,
    parameters: {
      filePath: { type: 'string', description: '作者历史论文的文件路径（.md/.tex/.txt；与 learnDir 二选一）' },
      learnDir: { type: 'string', description: '作者历史论文所在目录（递归扫描 .md/.tex/.txt 合并统计；与 filePath 二选一）' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      const { filePath, learnDir } = args as { filePath?: string; learnDir?: string }
      if (!filePath && !learnDir) throw new Error('需要提供 filePath 或 learnDir')
      const files: string[] = []
      if (typeof filePath === 'string' && filePath) {
        files.push(filePath)
      }
      if (typeof learnDir === 'string' && learnDir) {
        // 递归收集 .md/.tex/.txt（兼容 Dirent 无 path 字段的 Node 版本，手写递归）
        const walk = async (dir: string): Promise<void> => {
          const entries = await fs.readdir(dir, { withFileTypes: true })
          for (const e of entries) {
            const full = path.join(dir, e.name)
            if (e.isDirectory()) {
              await walk(full)
            } else {
              const ext = path.extname(e.name).toLowerCase()
              if (ext === '.md' || ext === '.markdown' || ext === '.tex' || ext === '.txt') {
                files.push(full)
              }
            }
          }
        }
        await walk(learnDir)
      }
      if (files.length === 0) throw new Error('未找到可统计的 .md/.tex/.txt 文件')
      const chunks: string[] = []
      for (const f of files) {
        try {
          chunks.push(await fs.readFile(f, 'utf8'))
        } catch {
          // 跳过不可读文件
        }
      }
      if (chunks.length === 0) throw new Error('所有目标文件均不可读')
      const profile = computeStyleProfile(chunks.join('\n\n'))
      return [
        '作者写作风格档案（零网络零 LLM，纯本地统计）：',
        JSON.stringify(profile, null, 2),
        '',
        `统计来源：${files.length} 个文件（${chunks.length} 个成功读取）`,
        '用法：把上面的 JSON 传给 writing_audit 的 styleProfile 参数，检测新稿件的句长漂移。',
      ].join('\n')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'writing_journal_profile',
    description:
      'v1.6.2 Journal Profile：从多篇目标期刊代表论文（.md/.tex/.txt）逐篇独立蒸馏"期刊写作档案"——每个章节跨论文聚合的句法/引用/epistemic fingerprint/rhetorical moves 分布。' +
      '输出的是抽象统计分布（不保存论文原句），零网络零 LLM，纯本地统计。' +
      '用法：对目标期刊的代表论文目录/文件调用本工具得到 profile JSON，' +
      '再在 writing_audit 的 journalProfile 参数传入该 JSON，即可对当前稿件输出 section-level Journal Fit（契合度百分比 + 主要差异）。' +
      `（dsh-manuscript-guard v${PLUGIN_VERSION}）`,
    parameters: {
      filePath: { type: 'string', description: '目标期刊代表论文的文件路径（.md/.tex/.txt；与 learnDir 二选一）' },
      learnDir: { type: 'string', description: '目标期刊代表论文所在目录（递归扫描 .md/.tex/.txt 合并统计；与 filePath 二选一）' },
      journal: { type: 'string', description: '期刊名称（写入 profile.metadata.journal，默认 custom-journal）' },
      articleType: { type: 'string', description: '文章类型（如 research-article/review，写入 metadata.articleType）' },
      discipline: { type: 'string', description: '学科领域（写入 metadata.discipline）' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      const { filePath, learnDir, journal, articleType, discipline } = args as {
        filePath?: string
        learnDir?: string
        journal?: string
        articleType?: string
        discipline?: string
      }
      if (!filePath && !learnDir) throw new Error('需要提供 filePath 或 learnDir')
      const files: string[] = []
      if (typeof filePath === 'string' && filePath) files.push(filePath)
      if (typeof learnDir === 'string' && learnDir) {
        const walk = async (dir: string): Promise<void> => {
          const entries = await fs.readdir(dir, { withFileTypes: true })
          for (const e of entries) {
            const full = path.join(dir, e.name)
            if (e.isDirectory()) {
              await walk(full)
            } else {
              const ext = path.extname(e.name).toLowerCase()
              if (ext === '.md' || ext === '.markdown' || ext === '.tex' || ext === '.txt') files.push(full)
            }
          }
        }
        await walk(learnDir)
      }
      if (files.length === 0) throw new Error('未找到可统计的 .md/.tex/.txt 文件')
      const documents: JournalDocument[] = []
      for (const f of files) {
        try {
          documents.push({
            text: await fs.readFile(f, 'utf8'),
            sourceId: path.basename(f),
          })
        } catch {
          // 跳过不可读文件
        }
      }
      if (documents.length === 0) throw new Error('所有目标文件均不可读')
      const profile = computeJournalProfileFromDocuments(documents, {
        journal: typeof journal === 'string' && journal ? journal : undefined,
        articleType: typeof articleType === 'string' && articleType ? articleType : undefined,
        discipline: typeof discipline === 'string' && discipline ? discipline : undefined,
        sampleSize: documents.length,
      })
      return [
        '目标期刊写作档案（Journal Profile，零网络零 LLM，纯本地统计）：',
        JSON.stringify(profile, null, 2),
        '',
        `统计来源：${files.length} 个文件（${documents.length} 个成功读取）`,
        '用法：把上面的 JSON 传给 writing_audit 的 journalProfile 参数，检测当前稿件的期刊写作契合度。',
      ].join('\n')
    },
  }))


  ctx.tools.register(defineTool({
    name: 'writing_delivery_audit',
    description:
      'Delivery Integrity 审计（CAL 检测）：检测工作上下文中的被否决方案、临时尝试、纠错过程是否泄漏到最终交付物。' +
      '支持 surfaces: title/heading/filename/comment/test_name/commit/pr/release/handoff。' +
      '检测：REJECTED_ALTERNATIVE_LEAKAGE（被否决术语泄漏）、REVISION_PROCESS_LEAKAGE（修改过程残留）、' +
      'PROVENANCE_LEAKAGE（来源泄漏）、UNJUSTIFIED_NEGATIVE_REFERENCE（无依据否定引用）、' +
      'DELIVERY_CANDIDATE（无法验证的删除/替换声明，置信度降低）。' +
      '可传入 baseline（权威基线内容）做基线真实性检查：如果文本说"Remove X"但 X 不在 baseline 中，则为 CAL。' +
      '可传入 rejectedTerms/rejectedClaims 提供被否决上下文。' +
      '零网络零 LLM，纯本地确定性规则。' +
      `（dsh-manuscript-guard v${PLUGIN_VERSION}）`,
    parameters: {
      text: { type: 'string', description: '要检查的交付物文本内容' },
      surface: {
        type: 'string',
        enum: ['title', 'heading', 'filename', 'comment', 'test_name', 'commit', 'pr', 'release', 'handoff', 'unknown'],
        description: '交付物表面类型（可选，默认 unknown）',
      },
      baseline: { type: 'string', description: '权威基线内容（如前一个 commit、当前仓库状态）——用于基线真实性检查' },
      finalState: { type: 'string', description: '观察到的最终状态（如编辑后的代码）' },
      rejectedTerms: { type: 'array', items: { type: 'string' }, description: '被否决上下文中的术语列表（如 ["Toast", "方案A"]）' },
      rejectedClaims: { type: 'array', items: { type: 'string' }, description: '被否决上下文中的主张列表（如 ["We should use Redux"]）' },
      verbose: { type: 'boolean', description: 'true 时输出每条问题的证据和建议（默认 false）' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      const text = args.text as string | undefined
      if (!text || !text.trim()) {
        throw new Error('需要提供 text（内容不能为空）')
      }
      const surface = (args.surface as DeliverySurface) ?? 'unknown'
      const opts: DeliveryAuditOptions = {
        text,
        surface,
      }
      if (typeof args.baseline === 'string' && args.baseline) opts.baseline = args.baseline
      if (typeof args.finalState === 'string' && args.finalState) opts.finalState = args.finalState
      if (Array.isArray(args.rejectedTerms)) {
        opts.rejectedTerms = args.rejectedTerms.filter((x): x is string => typeof x === 'string')
      }
      if (Array.isArray(args.rejectedClaims)) {
        opts.rejectedClaims = args.rejectedClaims.filter((x): x is string => typeof x === 'string')
      }
      const report = auditDelivery(opts)
      const verbose = args.verbose as boolean | undefined
      return formatDeliveryReport(report, { verbose })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'writing_rules',
    description:
      '返回论文写作纪律速查清单（dsh-manuscript-guard v' + PLUGIN_VERSION + '）：control-context 隔离、论证经济性、过度解释、主张校准、科研完整性与确定性自查。' +
      '写作/修改任何论文段落前可先调用本工具加载纪律，写完后用 writing_audit 复查。',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    isConcurrencySafe: () => true,
    async execute() {
      return rulesBrief()
    },
  }))
}
