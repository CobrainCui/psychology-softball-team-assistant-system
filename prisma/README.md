# 数据库接入（阶段 A · 工程债）

队内权威数据走 PostgreSQL + Prisma。浏览器 `localStorage` 仅保留当场 `session_draft`。

## 你需要先完成的云端操作

1. Vercel 项目 → **Storage** → Create Database → **Postgres**
2. Connect → 复制 `.env.local` 片段中的连接串（含密码，勿发给任何人 / AI）
3. 在项目根目录创建 `.env`（可参考 `.env.example`）
4. 将可用连接串写入 `DATABASE_URL=`  
   （若只有 `POSTGRES_URL` / `POSTGRES_PRISMA_URL`，也可直接用这些名字；`lib/db.ts` 会依次回退读取）

## 本地命令

```bash
# 按 schema 生成客户端（改表后必跑）
npx prisma generate

# 首次建表 / 变更迁移（需要有效 DATABASE_URL）
npx prisma migrate dev --name init_softball_core

# 可选：打开表数据浏览器
npx prisma studio
```

## 模型与前端契约对照

| Prisma | 前端 / 存储 |
|--------|-------------|
| `Team` + `Player` | `lib/players.ts` |
| `TestSession` + `Hit` + `SpeedRecord` + 技能表 | `lib/gameArchive.ts` |
| `ReadinessCheck` | `lib/readinessHistory.ts`（五维 1–5 + 四象限） |
| `InjuryCase` | `lib/injuryCases.ts` + `createInjuryCase` / 档案聚合 |
| `SessionFeedback` | `lib/sessionFeedback.ts` + `/feedback` → 教练摘要（同日可多条） |

`Player.role`：`player` | `coach`（P0 极简身份）

## 纪律

- 密钥只放 `.env` / 托管平台环境变量，禁止提交 Git
- 业务页面不要直接 `new PrismaClient()`，统一 `import { prisma } from "@/lib/db"`
- 生成代码在 `lib/generated/prisma`（已 gitignore），依赖 `postinstall` / 手动 `generate`
