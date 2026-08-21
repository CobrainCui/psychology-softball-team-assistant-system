---
name: nextjs-prisma
description: >-
  Applies Next.js App Router, Prisma 7, Server Action result contracts,
  hydration safety, and typecheck-after-edit rules. Use when working on
  Next.js, Prisma, Server Actions, App Router pages, localStorage hydration,
  PostgreSQL persistence, or TypeScript web apps that are not WeChat mini programs.
---

# Next.js App Router + Prisma 7

后续开发按本文件执行。跨项目分层与契约见 `engineering-discipline`。不写微信 API；小程序见 `wechat-miniprogram`。

默认 **Next.js App Router + TypeScript + Prisma 7 + PostgreSQL**。以当前仓库 `package.json` 为准；**禁止**按过时 `.cursorrules` 擅自引入未安装的 UI 库。

## 开发原则

### 改完即验

每批可独立编译的修改结束后立刻 `npm run typecheck`（`tsc --noEmit`）。红灯未清不得继续堆功能。

| 时机 | 做什么 |
|------|--------|
| 改 `app/` `components/` `hooks/` `lib/` | typecheck；扫 `'use client'` 与 hydration |
| 改 `prisma/schema.prisma` | `npx prisma generate` → typecheck；合并前 `npm run build` |
| 日常 | **不要**每次 `next build`（慢） |
| 大段替换 | 回看函数头、`export type`、括号是否被截断 |

### Server / Client 边界

- 使用 hooks、事件、`localStorage`、`window` 的组件必须 `'use client'`。
- **禁止**为省事把整棵树标成 client。
- **禁止**在客户端 import Prisma / `lib/db.ts`。
- Prisma 只出现在 Server Action、Route Handler、Server Component。

```ts
// BAD: 页面文件 import prisma
import { prisma } from "@/lib/db";

// GOOD: 页面调 Server Action
const res = await saveThing(payload);
if (!res.success) { console.error("云端被拒:", res.error); return; }
```

### Hydration

- **禁止**在 render 阶段读 `window` / `localStorage` / `Date.now()` 驱动 UI 分支。
- 浏览器数据用 `useEffect` 或 `useSyncExternalStore`（`getServerSnapshot` 返回与 SSR 一致的值，通常 `null` / `false`）。
- `JSON.parse` 必须 try/catch 或走项目的 `safeParse`；坏 JSON 不得拖垮整页。

```ts
// BAD
const user = JSON.parse(localStorage.getItem("user") ?? "null");

// GOOD
const raw = useSyncExternalStore(subscribe, getRawSnapshot, () => null);
```

### Server Action 返回契约

统一：

- 成功：`{ success: true, ...data }`；无载荷时 `{ success: true }`
- 失败：`{ success: false, error: string }`

```ts
export type ActionOk<T extends object = object> = { success: true } & T;
export type ActionErr = { success: false; error: string };
export type ActionResult<T extends object = object> = ActionOk<T> | ActionErr;
```

- **禁止** `ActionResult<Record<string, never>>`（与 `success` 交叉成 `never`，生产 build 失败）。
- **禁止**用 `throw` 作为前端主控制流（Next 序列化边界易静默失败）。
- 服务端 `catch`：`console.error` 完整原因，再 `return { success: false, error }`。
- 前端必须判断 `res.success`；失败再 `console.error` + 用户可感知提示。
- **禁止**空 `catch {}`。降级合法（写本地草稿），静默不合法。

### Prisma 7

- 单例：`import { prisma } from "@/lib/db"`。**禁止** `new PrismaClient()` 散落。
- Prisma 7 常用 `adapter-pg`：连接串只在服务端环境变量（`DATABASE_URL` 或项目约定的回退名）。
- `generator` 若自定义 `output`，import 生成客户端路径，不要假设默认 `node_modules/@prisma/client`。
- 改 schema 后 **必须** generate；迁移用 `prisma migrate`，不要手改已应用的 migration SQL 充数。
- 嵌套写入优先 `connect`：`player: { connect: { id } }`。字段名与 schema **逐项对齐**（前端 `timestamp` 常对应库字段 `recordedAt`；秒数/坐标用 `Float`）。
- 日期「自然日」用 `YYYY-MM-DD`；写入 `@db.Date` 时用正午 UTC，避免时区把日期推前一天。
- 密钥永不进 `NEXT_PUBLIC_*`。`NEXT_PUBLIC_*` 在 build 时内联，改值必须重建。

```ts
// BAD
await prisma.hit.create({ data: { playerId, timestamp: Date.now() } });

// GOOD
await prisma.hit.create({
  data: {
    player: { connect: { id: playerId } },
    session: { connect: { id: sessionId } },
    recordedAt: new Date(),
  },
});
```

本仓库补充：生成客户端在 `lib/generated/prisma`（gitignore）。`lib/db.ts` 依次读 `DATABASE_URL` / `POSTGRES_PRISMA_URL` / `POSTGRES_URL`。

## 审查规则（合并前）

- [ ] Server Action 是否返回 `{ success }`？调用方是否判断？有无空 `catch` / 靠 throw 分流？
- [ ] 是否 `ActionResult<Record<string, never>>`？
- [ ] 客户端是否 import 了 `lib/db` / Prisma？
- [ ] render 期是否触达 `localStorage` / `window`？
- [ ] schema 变更是否 generate + migrate？字段名是否与 Prisma 对齐？
- [ ] 本批是否跑过 `npm run typecheck`？红灯是否已清？
- [ ] diff 是否含 `.env`、连接串、密钥？

## 测试与回归

- 迁移函数、规则引擎、纯函数适配器必须可跑（单测或 `node`/`tsx` 脚本）。
- 修缺陷先最小复现，再改代码。
- 登录、写库、鉴权：仅看开发页不够；至少覆盖失败返回与空数据路径。
