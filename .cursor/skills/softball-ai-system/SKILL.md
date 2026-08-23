---
name: softball-ai-system
description: >-
  Applies softball-ai-system product and domain rules: slow-pitch (not windmill),
  dual-track readiness vs injury, fillable-record mutations, cycle privacy,
  wave-gated AI/P2 features, test-day cloud archive, and cloud player ids.
  Use when working in softball-ai-system, test day, assessment, prehab, cycle,
  coach, feedback, Prisma schema, clinical copy, or Server Actions.
---

# 垒球训练辅助系统

本仓库专用。分层 / 契约 / Git 见 `engineering-discipline`；Next.js / Prisma / Action 见 `nextjs-prisma`。细节表见 [reference.md](reference.md)（路由、Prisma 对照、storage keys、四象限公式）。改这些内容时先改对照表再改代码。

**形态**：大学业余**满垒球（慢投 / 下抛）**。处方与负荷禁止套用 Windmill 快投（投球数、风车力学）。

## 先核对再动手

1. 一条指令只改一个模块。产品功能按 `发展路径.md` 的当前波次与门控推进；已解冻不等于可跨波次同时开工。
2. 以 `package.json` 为准：Next.js 16 + React 19 + Tailwind 4 + Prisma 7。`.cursorrules` 里的 shadcn / Lucide **未安装**，禁止擅自引入。
3. 改完跑 `npm run typecheck`。红灯未清等于这批未完成。
4. 占位文案可以假；**字段名、类型、schema 不能假**。

## 禁止（审查高频打回）

- 未满足独立门控的 LLM / 视频 AI / 多队 / 电商 / 社群 / 勋章贴纸。规则引擎优先；AI 需样本验收、人工复核、可关闭与降级方案。
- 诊断、治疗、治愈、禁赛结论。辅助免责常驻（`MedicalDisclaimer`）。
- 评估页写伤病、伤病改写当日四象限（双轨互不熔断）。
- Hooper 百分制、`/ 100`、上场可用性（Availability）文案或 UI。
- 打击结果用 `1B` / `2B` / `HR` / `OUT`。只用 `LD | FB | GB | PU | MISS`。
- 测试日做实时分析看板。录入优先。
- 页面散落 `localStorage` / 魔法键名。键只加 `lib/storageKeys.ts` + `开发原则.md` §2。
- 名册用本地旧 id（如 `p1`）交卷。只认 `getPlayers()` 的云端 id。
- 归档后改删 `TestSession` 嵌套成绩。归档只读。
- 删除名册 `Player` 或整份 `CycleProfile`。
- 教练摘要展示经期日期、出血、痛经原文。只给脱敏 `physiologicalLoadTag`。
- 新建 `/cycle` 业务页。该路由只重定向到 `/assessment`。

## 代码放哪

| 改什么 | 放哪 |
|--------|------|
| 页面编排 | `app/**/page.tsx`（保持薄） |
| 可复用 UI | `components/`（测试日 `test-day/`，状态 `status/`，伤病 `injury/`） |
| 测试日草稿状态 | `hooks/useTestDaySession.ts` |
| 赛季 / 赛程 | `lib/season/*`、`components/season/`、`app/schedule/` |
| Server Action | `lib/actions.ts`（名册/归档）、`lib/auth/*.ts`、`lib/cycleActions.ts`、`lib/status/*.ts`、`lib/season/*.ts`。`"use server"` 文件只导出本文件定义的 async 函数，禁止 barrel re-export |
| 规则引擎 | `lib/clinical/*.ts`（纯函数，禁止 UI 内复制公式） |
| 持久化契约 | `prisma/schema.prisma` + 对应 `lib/*.ts` 类型 |
| 列表改删按钮 | `components/records/RecordActions.tsx` |

单文件约超过 **400 行**拆组件 / hook / lib。核心逻辑上方用中文写推导步骤注释。

## 双轨：评估 ≠ 伤病

| 轨 | 模型 | 页面 | 规则 |
|----|------|------|------|
| 体能准备度 | `ReadinessCheck` | `/assessment` | 五维 1 极差→5 极佳 → 四象限；`playerId+date` upsert |
| 损伤 episode | `InjuryCase` | `/prehab` | 疼痛日志 / 诊疗 / 康复；**不改**当日象限 |

- 五维字段名 `stress` / `fatigue` / `soreness` 是历史遗留，**语义已是正向**（5=放松/有精力/不酸）。禁止按英文词义反转量表。
- 象限：`slack` / `real_fatigue` / `injury_risk` / `peak`。公式只改 `lib/clinical/preQuadrant.ts`。
- 教练 `/coach`：全队散点 + 活跃 case + 训后负荷。周期只显示队员已授权的负荷标签。

## 可填写记录必须可改可删

新模块不得只做创建。实现入口：`RecordActions` + 配套 `updateX` / `deleteX`。

| 层 | 规则 |
|----|------|
| 测试日草稿 | 未归档按记录 `id` 随时改删 |
| 已上云 | 默认仅本人，且 `date` 为今日（`isTodayDateOnly`）；服务端再检 |
| 经期 `period_start` | 按事件列表改删，**不套**「日期必须是今天」 |
| 赛季协作 | `Season` / `ScheduleEvent` / `GameRecordFile` / 未确认摘要按角色、状态机、所有权改删，**不走** today-only |
| 归档后 | `TestSession` 只读 |

删除须 `confirm`。失败 `{ success: false, error }` + `console.error` + 用户提示。登录框 / 日期筛选 / 排阵勾选不算已保存业务记录。

## 身份与权威源

- Session：httpOnly cookie `softball_sid`（`AuthSession`）。读：`getMe()` / `useSession` / `useRequireAuth`。服务端鉴权按 `AccountRole` **并集**，`activeView` 只切导航不授权限。
- **admin 默认不是队员**：`/setup` 只建 `admin` 角色、不绑 `Player`。纯 admin 仅 `/admin` 账号管理（入队码、认领、角色、停用、重置链接），首页重定向到该页。已认领后再被授予 admin 的账号仍走角色并集，可同时用业务页。
- **角色授予**：管理员可在 `/admin` 账户列表直接授予/撤销已认领成员的队长、教练；队员在档案页申请是可选的，不是必经步骤。captain/coach 仍须已认领且绑定 `Player`。
- 名册权威：云端 `Player`。云端未就绪显示 Loading，禁止先渲染假名册。
- 正式成绩权威：`TestSession`。`session_draft` 仅当场草稿 / 交卷失败降级。
- 登录是账密（`Account`），不是「选人=登录」。单队试点；写入一律用 session `teamId`，禁止再引入客户端 `playerId` 作为权威。
- 赛程记录 PDF：不假设固定记录员。任一已批准且绑定本队 `Player` 的账号可向本队 `planned`/`completed` 的 `ScheduleEvent` 提交 PDF，并可短时下载 `ready` 且未删除的文件。`uploadedBy` 是删除权：作者可删自己的未作为当前确认 `sourceFileId` 的文件；队长/教练协助清理受同一限制。被确认引用的源文件禁止普通删除；管理员隐藏须保留可审计只读证据。提交文件不授予改赛程或健康数据读取权限。

## 临床与文案

- 周期建议：`lib/clinical/cycleGuidance.ts`。训练用语：传杀、打击、跑垒、落地膝控。禁止风车投球数。
- 教练可见：`none` | `load_only` | `phase_label`。默认不要升级分享范围。
- RED-S / 转介提示不是诊断，禁止自动禁赛。
- `doubleGiThreatProtocol.ts` 仅在赛程的“重要比赛日”数据稳定后接线；提示不得替代医疗结论或自动改变训练权限。

## 审查清单（声称完成前）

- [ ] 是否符合当前产品波次与该功能门控？若引入 AI / 视频 / 多队，是否具备独立验收与降级？
- [ ] 评估与伤病是否串轨？是否出现 Hooper / 上场可用性 / `/ 100`？
- [ ] 新增填写是否有修改+删除？云端是否校验本人当日（经期事件除外）？
- [ ] Action 是否 `{ success }`？失败是否可观测？有无空 `catch`？
- [ ] 交卷/名册是否误用本地旧 id？
- [ ] 教练端是否泄漏经期原文？
- [ ] 打击结果是否仍是 `LD/FB/GB/PU/MISS`？
- [ ] 是否 hydration 安全？是否散落 storage 键？
- [ ] schema 是否 generate + migrate？Prisma 字段是否对齐？
- [ ] `npm run typecheck` 是否绿灯？
- [ ] UI 是否仍是黑/白/灰折叠卡片，而非装饰分析看板？

## 验证

- 规则 / 迁移 / 归档清洗：改 `lib/clinical/*`、`gameArchive` migrate、`archiveValidation` 时补可跑断言（现有 `scripts/verify-ui.ts` 覆盖评估/伤病旧文案回归）。
- 写库路径：至少确认失败返回 `success: false` 且前端不把盘面当成功清空。
