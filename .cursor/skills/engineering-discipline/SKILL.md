---
name: engineering-discipline
description: >-
  Applies cross-project engineering discipline: layered architecture, versioned
  data contracts, review checklists, performance budgets, tests, observability,
  atomic git changes, and keeping plugins/SDKs on the latest stable release.
  Use when scaffolding a project, writing business or persistence code,
  reviewing changes, or when the user asks to follow team engineering rules.
---

# 跨项目工程纪律

后续开发按本文件执行。占位文案可以假，**字段名、类型、schema 不能假**。不写微信 API；小程序见 `wechat-miniprogram`。Next.js + Prisma 见 `nextjs-prisma`。

## 开发原则

### 协作

- **必须**一次一事：一条指令只改一个模块；写清文件、行为、验收标准。
- **必须**大改前 git commit 或明确 checkpoint。
- **禁止**空指令「修一下」就动代码。
- **禁止**中途换技术栈，除非有书面迁移计划。
- LLM / 大模型能力默认关闭；要用须单独立项（可审计、可降级）。规则模板优先。

### 分层

```
UI（页面 / 组件）
  → services / domain（业务规则）
    → repositories（读写抽象）
      → persistence（存储 / 网络 / 云）
```

- **禁止** UI 直调存储 SDK、云 SDK、散落魔法字符串键名。
- **禁止**多处复制同一数据契约；类型只定义一处。
- 单文件约超过 **400 行**须拆组件与 service。
- 写入端与读取端共用同一类型与版本化 schema。

```ts
// BAD: 页面直写存储
wx.setStorageSync("items", list);

// GOOD: 页面调 service → repository
await itemService.save(list);
```

### 数据契约

- 持久化对象带 `schemaVersion: number`（或等价字段）。
- 改字段名 / 改结构 = **发新版本**，并提供 `migrate(old) → new`。
- 存储键集中管理；**禁止**魔法字符串散落。
- 读取一律安全提取；**禁止**对可能为 `undefined` 的数组直接 `.map` / `.filter`。
- **禁止**静默覆盖用户数据（未就绪就写入空数组）。
- **禁止**无确认清空历史。

### 失败与权威源

统一返回：

- 成功：`{ success: true, ...data }`
- 失败：`{ success: false, error: string }`

调用方必须判断 `success`。失败：日志 + 用户可感知提示。

- 降级合法（例如断网只写本地），**静默不合法**。
- **禁止**空 `catch {}` / 吞错后假装成功。
- 用户可见的正式记录有且仅有一个权威源；冲突策略显式。
- 业务删除写墓碑字段（如 `deletedAt`），禁止只在本机抹掉导致他端无法感知。

### 安全与文案

- 密钥、证书、第三方 Secret **永不进客户端包**。
- 仅前端藏按钮 ≠ 安全边界；校验在服务端 / 云函数。
- 冻结模块：未解冻不顺手改；共享层最小 diff，并说明对冻结消费者的影响。
- 冻结术语与长文案只改一处常量，禁止各页复述。

### 文档

原则 / 架构入口少而稳。进度不要平行写第三份。

## 审查规则（合并前）

- [ ] 是否变更持久化 schema？有无 `migrate` / fallback？
- [ ] UI 是否散落直调存储 / 云 SDK？
- [ ] 是否复制了同一业务规则或契约到多处？
- [ ] 空数据 / 坏 JSON / 未登录路径是否安全？
- [ ] 写入失败是否可观测 + 用户提示？有无空 `catch`？
- [ ] 页面是否过大该拆未拆？
- [ ] 是否误改无关仓库或冻结模块？
- [ ] 是否混入纯格式化 / 无关重构？
- [ ] 是否引入过期插件、未使用依赖、或未写入 lockfile 的版本？
- [ ] diff 是否含密钥、`.env`、证书？

反馈分级：必须修 / 建议 / 可选。

## 性能与资源预算

- 先测后优化；不要猜。
- 热路径避免 N+1 与无界列表；分页或窗口化。
- **禁止**把调试用大资源、未用依赖打进产物。
- 变更若可能拖慢启动或主交互，须说明预算：包体、请求次数、主线程工作。

```ts
// BAD: 每次滚动全量 set 整个列表
onScroll() { this.setData({ items: this.items }); }

// GOOD: 窗口化 + 只更新变化字段
this.setData({ "items[3].done": true });
```

## 测试与回归

- 迁移函数、分带 / 规则引擎、纯函数适配器 **必须**有可跑测试。
- 修缺陷先写失败用例或最小复现（Prove-It），再改代码。
- **禁止**只靠手工点一次就宣称完成。
- 无测试框架时，至少把纯函数抽到可 `node` 执行的脚本验证。

## 可观测性与排障

- 失败：`console.error`（或项目等价通道）+ 用户能理解的原因和出路。
- 日志 **禁止**打印 token、身份证、完整手机号、密钥。展示层脱敏。
- 排障顺序：复现 → 定位层（UI / service / repo）→ 最小修复 → 加回归。
- **禁止**排障时顺手大范围重构。

## Git 变更粒度

- 一次提交一个意图；行为改动与纯格式化拆开。
- 大改前先 commit。
- **禁止**擅自 `git push`、改 git config、跳过 hooks（除非用户明确要求）。
- 提交说明写 **why**。
- **禁止**提交密钥、`.env`、证书。

## 插件与依赖（最新稳定版）

与「锁版本、不堆无用插件」同时成立：

- **必须**对仍在使用的插件 / 扩展 / SDK 使用 **当前最新稳定版**（官方 changelog 或 npm dist-tag `latest`）。
- **禁止**默认用 alpha / nightly，除非用户点名。
- **必须**用 lockfile 锁住所选版本。「跟新」= 有意升级到最新稳定并更新 lock，不是每次裸装浮动 latest 却不记录。
- **禁止**堆未使用插件。官方停止维护的依赖：删除或替换，不要钉死旧版凑合。
- semver **major** 先读破坏性变更再升；升完跑已有测试。
- 新项目脚手架装最新稳定，不拷贝过期模板依赖。
