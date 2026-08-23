# softball-ai-system 对照表

Agent 需要路径、模型或存储键时再读本文件。权威仍以代码为准。

## 路由

| 路径 | 角色 | 职责 |
|------|------|------|
| `/` | 已认领 | 测试日大厅：本队进行中云端草稿；折叠本机单机草稿。未登录跳转 `/login`；纯 admin 跳转 `/admin`。 |
| `/test-day/[draftId]` | 已认领本队 | 云端协作测试日。进行中权威为 `TestDayDraft`；归档后只读 `TestSession`。 |
| `/login` | 公开 | 用户名+密码登录 |
| `/register` | 公开 | 单次入队码注册（pending 认领） |
| `/setup` | 公开（零 admin 时） | `AUTH_BOOTSTRAP_SECRET` 创建首个管理员（仅 admin 角色，不建 Player） |
| `/reset/[token]` | 公开 | 管理员下发的一次性重置链接 |
| `/admin` | admin | 入队码批次、认领队列、直接授予/撤销角色、停用、重置链接。队员申请非必须 |
| `/team` | captain/coach | 队务提交情况（无分数） |
| `/assessment` | 已认领 | Readiness 五维 → 四象限；女性周期面板 |
| `/prehab` | 已认领 | InjuryCase episode |
| `/feedback` | 已认领队员 | 训后 RPE |
| `/coach` | coach 角色 | 全队散点 + 活跃伤病 + 训后负荷（无 note） |
| `/profile` | 已认领 | 成绩 PR、象限与 episode 并排；折叠个人季报/年报 |
| `/schedule` | 已认领 | 赛程列表、赛季状态、教学赛；队长/教练维护事件 |
| `/schedule/import/[eventId]` | captain/coach | iScore 文字层 PDF 解析确认页 |
| `/cycle` | — | **仅重定向**到 `/assessment` |

导航：`components/Navbar.tsx`。公开路由：`/login`、`/register`、`/setup`、`/reset/*`。业务页 `useRequireAuth` + `getMe()`（httpOnly `softball_sid`）。pending 认领由 `PendingClaimGate` 拦截。纯 admin 导航仅「账号」。教练导航不含 `/feedback`；队长额外 `/team`。全员已认领另有「赛程」。

## 身份（Account / Player 分离）

| Prisma | 说明 |
|--------|------|
| `Account` + `AccountRole` | 登录主体；角色并集鉴权（`lib/auth/policy.ts`）。`admin` 默认不绑 Player |
| `MembershipClaim` | pending/approved/rejected；唯一认领状态源。纯 admin 无认领记录 |
| `EnrollmentCode` | 单次 player 入队码（`codeHash`） |
| `AuthSession` | httpOnly session；`requireSession` 每次校验 active |
| `Player` | 名册与成绩；`Player.role` **@deprecated**，迁移中 |

入口：`lib/auth/*`（`authActions`、`enrollActions`、`claimActions`、`roleActions`、`meActions`）。回归：`npm run verify:auth`、`npm run verify:auth-actions`。

## 分层与入口

```
app/page.tsx（测试日大厅：云端场次列表 + 折叠本机草稿）
  → components/test-day/TestDayLobby.tsx + app/TestDayClient.tsx（本机 :live）
app/test-day/[draftId]/page.tsx
  → TestDayClient source=cloud
      → hooks/useCloudTestDaySession.ts
        → lib/testDay/draftActions.ts、lib/testDay/collab/*
          → lib/db.ts → PostgreSQL
```

本地草稿：`lib/sessionDraft.ts` 仅单机降级，**不是**多人真相源。云端进行中：`TestDayDraft`。正式成绩：`TestSession`。

评估 / 伤病 / 训后 / 教练 / 周期：

```
app/assessment|prehab|feedback|coach|profile/page.tsx
  → components/status/*、components/injury/*、hooks/useAssessmentPage.ts
    → lib/cycleActions.ts / lib/status/*.ts / lib/auth/*.ts
      → lib/db.ts
```

| Prisma | 前端契约 |
|--------|----------|
| `Team` + `Player` | `lib/players.ts`；会话 `getMe()` / `lib/useSession.ts` |
| `TestSession`（`assignments` / `testItems` / `assignmentLog` / `customTests` Json；`sourceDraftId` 可空唯一） | `lib/sessionDraft.ts`、`lib/testDay/assignmentLog.ts`、`lib/testDay/customTests.ts` |
| `TestDayDraft` + `TestDayDraftMember` | 进行中协作场次；`lib/testDay/draftActions.ts` |
| `TestDayEntry` + `TestDayConflict` | entityKey 合并与冲突；`lib/testDay/collab/*` |
| `Hit` | `lib/gameArchive.ts` `HitRecord`（`LD\|FB\|GB\|PU\|MISS`，禁止 `1B/HR/OUT`） |
| `SpeedRecord` + `SpeedColumn` + `SpeedMark` | `lib/testDay/speedGrid.ts`（表格权威；`SpeedRecord` 给档案 PR 双写上一垒/上二垒） |
| `FlyCatchAttempt` | `FlyCatchAttempt` |
| `StrikeJudgeColumn` + `StrikeJudgeCell` | 格用 `columnId+judgeId`；正确与否由 `pitchCall × swung` 派生，不落库 |
| `ThrowPlay` | `6-3传球` / `4-3传球`；失败须 `blame` |
| `ReadinessCheck` | `lib/readinessHistory.ts`；象限只算 `lib/clinical/preQuadrant.ts`；写入 `lib/status/readinessActions.ts` |
| `InjuryCase` + `InjuryPainLog` + `InjuryNoteRecord` | 云端 DTO `lib/status/shared.ts`；本地草稿 `lib/injuryCases.ts` |
| `SessionFeedback` | 云端 `lib/status/feedbackActions.ts`；本地草稿 `lib/sessionFeedback.ts`（`schemaVersion: 3`）；`activityTypes String[]`；无时长；备注仅本人，教练 DTO 不含 `note` |
| `CycleProfile` + `CycleEvent` | `lib/cycleTypes.ts`、`lib/cycleActions.ts`、`lib/clinical/cycle*.ts`。教练只读已授权 `physiologicalLoadTag` |
| `Team.timeZone` | IANA，试点默认 `Asia/Shanghai`；赛季自然日与比赛窗口展示用此时区 |
| `Season` | `lib/season/types.ts`；`planned/active/archived`；`effectiveEndsOn` 用于重叠与报告；每队至多一个 active |
| `ScheduleEvent` | `lib/season/scheduleActions.ts`；`seasonId` 可空的教学赛；窗口只认 `status=planned` |
| `GameRecordFile` | 元数据 + 对象存储；两阶段 pending→finalize；确认源文件禁普通删除 |
| `ConfirmedGameSummary` + `ConfirmedGamePlayerLine` | 人工/iScore 确认后的比赛摘要；每 event 一条当前确认 |

Prisma client 输出：`lib/generated/prisma`。日期自然日：`lib/dateOnly.ts`（正午 UTC + `getTodayDateStr`）。队时区日：`lib/season/timeZone.ts`。评估/伤病/反馈/教练仍走 `lib/status/*.ts`（barrel `lib/statusActions.ts`），不经过测试日 hook。

赛季入口：

```
app/schedule/page.tsx
  → components/season/*
    → lib/season/seasonActions.ts、scheduleActions.ts、fileActions.ts、summaryActions.ts、reports.ts
      → lib/season/storage.ts → 私有 Vercel Blob（token 或 OIDC）或 `.tmp/season-blob`
      → lib/db.ts
```

## 测试日草稿与归档

`SESSION_DRAFT_SCHEMA_VERSION = 6`（`lib/sessionDraft.ts`）。`GAME_ARCHIVE_SCHEMA_VERSION = 5`。当场草稿键 `` softball_session_draft:${teamId}:${accountId}:live `` **不是**云端 `draftId`，仅单机降级。

云端协作：`TestDayDraft.status` = `open | frozen | archived`。`open` 可加入与改结构；`frozen` 停加入与结构、仍可提交成绩；`archived` 拒绝写入。结构 Json：`testItems` / `assignments` / `customTests` / `skillStructure`（测速列、好球列）。

entityKey：`hit:{clientEntryId}`、`fly:{clientEntryId}` 追加并集；`speed:{playerId}:{columnId}`、`strike:{columnId}:{judgeId}`、`throw:{testItem}:{throwerId}:{firstBaseId}`、`cnote:{testItem}:{scope}` 同值去重、异值冲突不覆盖。轮询 5s，无 WebSocket。无 open 冲突才 `archiveTestDayDraft` → `TestSession.sourceDraftId`。

| 改什么 | 放哪 |
|--------|------|
| `/` 大厅 | `app/page.tsx` + `components/test-day/TestDayLobby.tsx` |
| 云端场次 | `app/test-day/[draftId]/page.tsx` |
| 本机盘面 | `app/TestDayClient.tsx` + `hooks/useTestDaySession.ts` |
| 云端盘面 | `hooks/useCloudTestDaySession.ts` |
| 面板 UI | `components/test-day/` |
| 协作 Action | `lib/testDay/draftActions.ts` |
| entityKey / 合并 / 投影 | `lib/testDay/collab/entityKeys.ts`、`merge.ts`、`projectSnapshot.ts` |
| 盘面→归档 payload | `buildClientArchivePayload`（`lib/testDay/archiveValidation.ts`） |
| Prisma create 输入 | `buildTestSessionCreateInput`（`lib/testDay/sessionArchiveWrite.ts`） |
| 纯函数回归 | `npm run verify:test-day`、`verify:custom-tests`、`verify:test-day-collab` |

交卷：`buildClientArchivePayload` → `saveTestSession` → `normalizeSessionArchivePayload` → `buildTestSessionCreateInput`。过滤空测速、非法打击结果、无效 `playerId`。仅整项备注、无人勾选时允许空 playerId 列表。成功只认云端，不清盘除非 `success`；失败写回 `session_draft`。归档后 `TestSession` 只读。未归档草稿按记录 `id` 可改可删（`RecordActions`）。

## localStorage 键（`lib/storageKeys.ts`）

基键如下；业务草稿实际读写为 `` `${base}:${teamId}:${accountId}` ``；测试日当场草稿另加 `:live`（`lib/scopedStorage.ts`）。无后缀全局 key 访问时删除，不迁入当前账号。

| Key | 用途 |
|-----|------|
| `softball_currentUser` | 废弃前端 Session；现权威为 `getMe()` / `softball_sid` |
| `softball_auth_owner` | 当前 Profile 的 `teamId:accountId`（非 cookie）；换账号或跨标签发现身份变更 |
| `softball_session_draft` | 测试日当场草稿 base。实际读写 `` ${base}:${teamId}:${accountId}:live ``；含 hits / 技能表 / 排阵 / 清单 / 修改记录 / 自定义备注 / currentBatterId / flyCatchNoteDrafts；交卷失败降级；云端 `TestSession` 为正式成绩权威 |
| `softball_games_history` | 归档本地缓存；云端权威 |
| `softball_readiness_history` | 评估本地草稿 |
| `softball_injury_cases` | 损伤草稿；云端权威 |
| `softball_session_feedback` | 训后反馈草稿 |
| `softball_period_start` | 已停止写入；经期权威为云端 `CycleEvent` |
| `softball_players` | 废弃名册，禁止当权威 |
| `softball_hits` | 废弃，无后缀 key 删除不迁入 |
| `softball_injury_log` | 废弃 VAS 快照，读取忽略 |

新增键必须同步本表与 `开发原则.md` §2。

## 四象限（`pre_quadrant_v1`）

公式**只改** `lib/clinical/preQuadrant.ts`。UI / Action 禁止复制阈值。写入 `ReadinessCheck` 时服务端用 `buildPreFeedback` 重算，不信任客户端的 X/Y/象限。

X = round1((sleep + stress + fatigue + soreness) / 4)；Y = willingness。

五维字段名 `stress` / `fatigue` / `soreness` 是历史遗留，**语义已是正向**（5=放松/有精力/不酸）。禁止按英文词义反转。

- slack：X≥3 且 Y≤2
- real_fatigue：X<3 且 Y≤2
- injury_risk：X<3 且 Y≥3
- peak：X≥3 且 Y≥3

`ReadinessCheck.ruleVersion` 默认 `pre_quadrant_v1`。经期只替换叙事，不改象限判定。回归：`npm run verify:clinical`。

## 产品阶段（摘要）

Wave 0：账密 Account + httpOnly session + 角色并集 + teamId 权威源。Wave 1：Season / ScheduleEvent / 文件与人工确认摘要。Wave 2：只读季报/年报（自然年，按记录队时区归属日切分）。Wave 3：iScore 文字层 PDF 确定性解析 + 人工确认。成功标准见 `发展路径.md`。

## 赛季改删例外

`Season`、`ScheduleEvent`、`GameRecordFile`、未确认 `ConfirmedGameSummary` **不走**「仅本人且当天」。按角色、状态机、文件所有权改删。已确认摘要更正走新版本。已归档 `TestSession` 仍只读。

## 赛季报告口径

- 测试日归属：`TestSession.archivedAt` 的队时区自然日 ∈ `[startsOn, effectiveEndsOn]`；须当天归档。
- 比赛摘要归属：事件 `startAt` 的队时区自然日。
- 年报：队时区自然年 1/1–12/31；跨年 Season 只把当年那一段记录列入该年报。
- 覆盖度：比赛确认 = 当前确认摘要数 / completed 事件数；测试日只显示条数。
