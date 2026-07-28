# AGENTS.md

> 本文件面向 AI 编码代理，介绍 `vius`（观微）项目的架构、约定与常用命令。阅读本文件前不需要任何项目背景知识。

## 项目概述

`vius`（观微）是一个 A 股行情同步、多维分析与持仓监控工具，自 `orioles-service` 的 stock/stock-pool 功能抽离而来。功能：

- **行情总览**（`/stock`）：三排卡片（指数 / 持仓股汇总 / 股票池）+ 华尔街见闻/选股宝快讯流 + 行业/涨跌板块。三排卡片走 `/api/stocks/overview`（快讯流前端直连第三方公开 API；行情快照与板块排行为服务端代理 `/api/stocks/real`、`/api/stocks/plates-qq`——wallstcn api-ddc 已下线、腾讯接口无 CORS 头）
- **股票池**（`/stock-pool`）：自选关注股管理、实时行情、阈值告警（飞书 webhook 推送）、审计日志；**按账号隔离**，每人一个独立池子（`watchlist.user_id`）；**新建只需填股票代码**，名称/市场/类型由服务端自动解析（`src/lib/stock-resolver.ts`：stock_basic 优先，实时行情三源兜底）
- **持仓股**（`/stock-pool/positions`）：买入持仓管理，添加填 股票代码+买入价+买入数量；同一股票允许多条持仓记录（`position` 表，按 `user_id` 隔离，无唯一约束）；页面实时合并行情算浮动盈亏
- **A股总览**（`/stock-pool/ashare`）：全市场 4900+ 股票清单/日线统计、手动触发同步、股票检索、快讯流
- **放量信号**（`/stock-pool/analysis`）：每日收盘后自动计算的底部/顶部放量信号
- **个股详情**：股票池/持仓股/A股总览/放量信号的行点击开 `components/stock-pool/stock-detail-modal` 弹窗（K线走势=选股宝图表组件、筹码分布、相关资讯）；`/stock/[code]` 统一详情页 = 实时主要指标（`/api/stocks/real`）+ 同款选股宝图表 + 筹码分布/相关资讯区块（后两者仅 A 股）
- **定时任务管理**（`/cron`）：仅 admin 可见/可操作（侧边栏入口按 role 渲染，`/api/cron/*` 校验 `role==='admin'` 否则 403）；查看/改 cron 表达式/启停/手动触发，运行记录落 `cron_run` 表

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
│   │   ├── stock-pool/        # 股票池 + positions/ 持仓股 + analysis/ 信号 + ashare/ A股总览
│   │   ├── profile/           # 个人资料（资料/安全：多邮箱、改密、OAuth 绑定）
│   │   ├── settings/          # 设置（主题、涨跌配色真实生效，其余偏好 localStorage 占位）
│   │   ├── cron/              # 定时任务管理（仅 admin）
│   │   ├── agent/             # Agent 接入（占位页）
│   │   └── page.tsx           # redirect /stock
│   ├── icon.svg               # 站点 favicon（放大镜 + 行情脉冲线，同 components/Logo.tsx）
│   ├── api/auth/              # login/logout/session/[provider]/login/callback
│   │   └── profile/           # 资料/改密/多邮箱 emails(+primary)/解绑 unbind-oauth
│   ├── api/stocks/            # 指数清单 + real/ 行情快照代理 + plates-qq/ 腾讯板块代理 + overview/ 总览三排卡片
│   ├── api/cron/              # 定时任务管理 API（admin 专属，require-admin.ts 鉴权）
│   ├── api/ashare/            # A股数据 API（stocks/daily/chips/news/signals/stats/sync）
│   │   └── （注意路径：stock-pool 的 API 在 src/app/stock-pool/api/，与页面同目录）
│   └── stock-pool/api/        # 自选股/持仓(positions)/实时/统计/告警 API
├── components/
│   ├── ui/                    # 基础组件（原生实现，含 switch）
│   ├── stock-pool/            # 个股详情弹窗、K线（选股宝 iframe）、筹码、资讯
│   ├── Logo.tsx               # logo（放大镜+脉冲线；brand/white 两变体）
│   ├── AppShell.tsx / Header.tsx / Sidebar.tsx / AuthGate.tsx
├── model/                     # 数据访问层（Prisma，每模型一个文件）
├── lib/
│   ├── session.ts / env.ts / password.ts     # 认证三件套
│   ├── prisma.ts                              # 单例（默认导出 + 具名导出共存）
│   ├── realtime.ts / eastmoney.ts             # 实时行情三源降级 / 东财采集（多镜像 + 腾讯兜底）
│   ├── stock-resolver.ts                      # 代码→名称/市场/类型 自动解析（stock_basic 优先，行情兜底）
│   ├── technical.ts / alerts.ts / feishu.ts   # 指标计算 / 告警判定 / 飞书推送
│   ├── scheduler.ts                           # node-cron 调度（JOBS 注册表 + reschedule/trigger/listJobs + cron_run 运行记录）
│   ├── jobs/                                  # sync-daily / sync-news / check-alerts
│   └── analysis/                              # volume-signals / chip-distribution
├── server/lark.ts             # 飞书/Lark OAuth
├── server/user-emails.ts      # 多邮箱辅助（回填/OAuth 邮箱落表/格式校验）
├── hooks/  types/  utils/
├── instrumentation.ts         # register() → scheduler
└── middleware.ts              # cookie 存在性检查 + 安全响应头
```

## 关键约定

- **API 信封两套并存**（历史原因，新代码跟随所在模块）：
  - `/api/ashare/*` 与 `/api/auth/*`：`{code:200, data, message}`（成功 code=200）
  - `/stock-pool/api/*`：`{success:true, data}` / `{success:false, error}`
- **鉴权**：API 内 `requireUser()`（抛 `UnauthorizedError` → 各路由按自家信封返回 401）；`POST /api/ashare/sync` 额外支持 `Authorization: Bearer $CRON_SECRET`。middleware 只查 cookie 存在性，真正校验在 API 层
- **股票池按账号隔离**：`watchlist.user_id`（`@@unique([userId, code])`，级联删除）；`/stock-pool/api/*` 全部按 `session.uid` 过滤；告警历史 `alert_history.user_id` 可空（存量为 null）。定时告警走 `runAlertCheckAll()` 按用户分组跑、飞书推送标题带归属用户名；手动「检查预警」只查当前用户
- **持仓股**：`position` 表按 `user_id` 隔离，**同一 (userId, code) 允许多条**（买入价/数量不同）；新增走 `POST /stock-pool/api/positions`（code+price+quantity，名称/市场自动解析）；持仓实时行情走 `/stock-pool/api/positions/realtime`（与股票池 realtime 独立的 3s TTL 缓存）
- **多邮箱**：`user_emails` 表（全局唯一、小写、source=manual/feishu/lark）；任一邮箱可登录（login 路由先查 username 再查邮箱）；OAuth 回调把带回的邮箱落表；老用户 username 是邮箱时 GET /api/auth/profile 惰性回填主邮箱
- **OAuth bind 模式**：已登录用户访问 `/api/auth/<provider>/login` 时 state='bind'，回调把 unionId 绑到当前账号（被他人占用跳 `/profile?tab=security&error=bind`）；解绑走 `POST /api/auth/profile/unbind-oauth`（无密码账号拒绝）
- **Next 16**：动态路由 `params` 是 Promise，必须 `await ctx.params`
- **涨跌配色**：行情涨跌一律用语义类 `text-up`/`text-down`/`bg-up`/`bg-down`/`border-up`/`border-down`（`globals.css` 的 `--up`/`--down` 运行时变量，默认红涨绿跌；`:root[data-up-color='green']` 互换为绿涨红跌）。偏好在设置页「通用-涨跌配色」，存 `localStorage('vius-prefs').upColor`，helper 在 `src/lib/updown.ts`，anti-flash 在 `layout.tsx` 内联脚本；语义红绿（删除/停牌/获利盘等）仍用原 Tailwind 色
- **行情总览三排卡片**：`GET /api/stocks/overview` 无参只读 `overview_cache` 缓存秒回（indices 全局 `user_id='*'`，positions/watchlist 按用户）；`?refresh=1` 重算+upsert（指数与用户股票各一次批量行情调用）。前端 `stock/Overview.tsx`：开页先渲染缓存，再 refresh 更新，之后 10s 轮询。持仓排按 code 汇总（`avgCost=Σ(price×qty)/Σqty`，`pnl=(current−avgCost)×totalQty`）；股票池排「关注后涨跌幅」基于 `watchlist.mark_price`（关注时价格，创建时记录、存量 null 懒回填），「资讯关联」=近 7 天 `news_flash.codes` 匹配条数
- **定时任务注册表**：`scheduler.ts` 的 `JOBS`（daily-close/intraday-alerts/sync-news）是唯一任务来源；`cron_job` 表存 cron/enabled 覆盖（仅改过的有行），`cron_run` 表存每次运行记录；运行时改 cron 走 `rescheduleJob()`（validate→destroy 旧 task→重排），手动触发走 `triggerJob()`（进程内 Set 互斥防重入）
- **注释以中文为主**；路径别名 `@/* → ./src/*`
- **无测试框架**；`test/*.http` 用 REST Client 手动测

## 数据链路（每日自动）

`instrumentation.ts` → `scheduler.ts`（Asia/Shanghai 时区）：
- **15:30 周一~周五**：sync-daily（东财 clist 清单+快照 → 历史回补）→ volume-signals（放量信号落 `stock_signal`）→ check-alerts（自选股告警 → `alert_history` + 飞书 webhook）
- **盘中每 5 分钟**：check-alerts
- **每 30 分钟**：sync-news（见闻/选股宝快讯落 `news_flash`，按股票名关键词匹配关联）

手动触发：`POST /api/ashare/sync?type=daily|news|signals|all`（登录 session 或 `Bearer $CRON_SECRET`）；`codes=` 参数可只回补指定股票历史。admin 也可在 `/cron` 页面手动触发/改 cron/启停（`POST /api/cron/<id>/trigger`、`PUT /api/cron/<id>`）。

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
