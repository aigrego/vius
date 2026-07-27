# AGENTS.md

> 本文件面向 AI 编码代理，介绍 `vius`（观微）项目的架构、约定与常用命令。阅读本文件前不需要任何项目背景知识。

## 项目概述

`vius`（观微）是一个 A 股行情同步、多维分析与持仓监控工具，自 `orioles-service` 的 stock/stock-pool 功能抽离而来。功能：

- **行情总览**（`/stock`）：指数卡片、华尔街见闻/选股宝快讯流、行业/涨跌板块（前端直连第三方公开 API）
- **股票池**（`/stock-pool`）：自选股/持仓管理、实时盈亏、阈值告警（飞书 webhook 推送）、审计日志
- **A股总览**（`/stock-pool/ashare`）：全市场 4900+ 股票清单/日线统计、手动触发同步、股票检索、快讯流
- **放量信号**（`/stock-pool/analysis`）：每日收盘后自动计算的底部/顶部放量信号
- **个股详情**：K 线（MA/MACD/RSI/BOLL）、筹码分布（近似模型）、关联资讯

## 技术栈

- **框架**：Next.js 16（App Router）+ React 19 + TypeScript（strict）
- **UI**：Tailwind CSS v4（CSS-first token 体系，无 tailwind.config，`globals.css` 的 `@theme inline` + `data-theme` 明暗切换）+ 自研 shadcn 风格 `components/ui`（button/badge/card/table/select/tabs/input/label/dialog/popover/dropdown-menu/segmented/textarea，**全部为原生实现，不依赖 radix 浮层**）；图标 lucide-react；图表 recharts
- **数据库**：PostgreSQL + Prisma 6（schema `prisma/schema.prisma`）
- **认证**：自研 jose HS256 cookie session（`src/lib/session.ts`，cookie 名 `vius_session`）+ bcryptjs 密码 + 飞书/Lark OAuth（`src/server/lark.ts`）；**没有 NextAuth**
- **定时任务**：node-cron，`src/instrumentation.ts` 的 `register()`（Next 15+ 稳定特性）启动 `src/lib/scheduler.ts`
- **数据获取**：SWR
- **包管理**：npm

## 常用命令

```shell
npm install         # postinstall 自动 prisma generate
npm run dev         # 开发 http://localhost:3000
npm run build       # 生产构建（含 TS 检查）
npm start           # 生产服务
npm run db:migrate  # prisma migrate dev
npm run db:seed     # 种子管理员 admin（密码取 SEED_ADMIN_PASSWORD，默认 admin123）
```

## 目录结构

```
src/
├── app/
│   ├── layout.tsx / globals.css / providers.tsx   # token 体系 + 字体 + 主题 anti-flash
│   ├── (auth)/login/          # 登录页（无 shell）
│   ├── (app)/                 # 主应用路由组：layout = AuthGate + AppShell
│   │   ├── stock/             # 行情总览 + [code] 个股详情
│   │   ├── stock-pool/        # 股票池 + analysis/ 信号 + ashare/ A股总览
│   │   └── page.tsx           # redirect /stock
│   ├── api/auth/              # login/logout/session/[provider]/login/callback
│   ├── api/stocks/            # 指数清单
│   ├── api/ashare/            # A股数据 API（stocks/daily/chips/news/signals/stats/sync）
│   │   └── （注意路径：stock-pool 的 API 在 src/app/stock-pool/api/，与页面同目录）
│   └── stock-pool/api/        # 自选股/实时/统计/告警 API
├── components/
│   ├── ui/                    # 基础组件（原生实现）
│   ├── stock-pool/            # 个股详情弹窗、K线、筹码、资讯
│   ├── AppShell.tsx / Header.tsx / Sidebar.tsx / AuthGate.tsx
├── model/                     # 数据访问层（Prisma，每模型一个文件）
├── lib/
│   ├── session.ts / env.ts / password.ts     # 认证三件套
│   ├── prisma.ts                              # 单例（默认导出 + 具名导出共存）
│   ├── realtime.ts / eastmoney.ts             # 实时行情三源降级 / 东财采集（多镜像 + 腾讯兜底）
│   ├── technical.ts / alerts.ts / feishu.ts   # 指标计算 / 告警判定 / 飞书推送
│   ├── scheduler.ts                           # node-cron 调度
│   ├── jobs/                                  # sync-daily / sync-news / check-alerts
│   └── analysis/                              # volume-signals / chip-distribution
├── server/lark.ts             # 飞书/Lark OAuth
├── hooks/  types/  utils/
├── instrumentation.ts         # register() → scheduler
└── middleware.ts              # cookie 存在性检查 + 安全响应头
```

## 关键约定

- **API 信封两套并存**（历史原因，新代码跟随所在模块）：
  - `/api/ashare/*` 与 `/api/auth/*`：`{code:200, data, message}`（成功 code=200）
  - `/stock-pool/api/*`：`{success:true, data}` / `{success:false, error}`
- **鉴权**：API 内 `requireUser()`（抛 `UnauthorizedError` → 各路由按自家信封返回 401）；`POST /api/ashare/sync` 额外支持 `Authorization: Bearer $CRON_SECRET`。middleware 只查 cookie 存在性，真正校验在 API 层
- **Next 16**：动态路由 `params` 是 Promise，必须 `await ctx.params`
- **注释以中文为主**；路径别名 `@/* → ./src/*`
- **无测试框架**；`test/*.http` 用 REST Client 手动测

## 数据链路（每日自动）

`instrumentation.ts` → `scheduler.ts`（Asia/Shanghai 时区）：
- **15:30 周一~周五**：sync-daily（东财 clist 清单+快照 → 历史回补）→ volume-signals（放量信号落 `stock_signal`）→ check-alerts（自选股告警 → `alert_history` + 飞书 webhook）
- **盘中每 5 分钟**：check-alerts
- **每 30 分钟**：sync-news（见闻/选股宝快讯落 `news_flash`，按股票名关键词匹配关联）

手动触发：`POST /api/ashare/sync?type=daily|news|signals|all`（登录 session 或 `Bearer $CRON_SECRET`）；`codes=` 参数可只回补指定股票历史。

## 数据源注意事项

- 东财（push2/push2his）对高频请求会**临时封 IP**（TCP 重置，约数十分钟解封）：clist 有 push2delay 降级，kline 有编号镜像 + 腾讯 ifzq 兜底（腾讯源无换手率/成交额）
- 东财 volume 单位为「手」，新浪实时量为「股」（check-alerts 已做 ×100 适配）
- 东财 clist 单页上限 100 行（pz 设 200 也只返回 100，分页必须按 100）
- 批量写一律 `createMany(skipDuplicates)`，不要逐条 upsert（高延迟链路下差几个数量级）

## 环境变量（.env.example 有逐条注释）

`DATABASE_URL`（PG）、`SESSION_SECRET`、`SEED_ADMIN_PASSWORD`、`CRON_SECRET`、`FEISHU_WEBHOOK_URL`、`FEISHU_APP_ID/SECRET/REDIRECT_URI`、`LARK_*`（未配置时登录页隐藏三方登录按钮）

## 飞书应用配置（首次部署）

1. 飞书开放平台创建「企业自建应用」，开启网页应用能力
2. 回调地址配置 `https://<域名>/api/auth/feishu/callback`
3. `.env` 填 `FEISHU_APP_ID/SECRET/REDIRECT_URI`，重启
4. 首次飞书登录自动创建用户（role=member）；admin 账号由 seed 创建
