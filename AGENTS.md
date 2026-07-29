# AGENTS.md

> 本文件面向 AI 编码代理，介绍 `vius`（观微）项目的架构、约定与常用命令。阅读本文件前不需要任何项目背景知识。

## 项目概述

`vius`（观微）是一个 A 股行情同步、多维分析与持仓监控工具，自 `orioles-service` 的 stock/stock-pool 功能抽离而来。功能：

- **行情总览**（`/dashboard`）：三排卡片（指数 / 持仓股汇总 / 股票池，**持仓/股票池排有数据才显示**）+ 三列区块（左=A股涨幅排行 `AshareRank`、中=合并快讯流 `NewsFeed`、右=行业/题材/板块涨跌幅榜）。三排卡片走 `/api/stocks/overview`；**快讯流与涨幅排行均查库**（`/api/ashare/news`、`/api/ashare/rank`），不再前端直连第三方；**板块卡片走 `/api/stocks/plates?kind=` 读 `plate_cache`**（sync-plates 定时任务交易时段每分钟预热，冷启动回源兜底）
- **股票池**（`/pool`）：自选关注股管理、实时行情、阈值告警（飞书 webhook 推送）、审计日志；**按账号隔离**，每人一个独立池子（`watchlist.user_id`）；**新建只需填股票代码**，名称/市场/类型由服务端自动解析（`src/lib/stock-resolver.ts`：stock_basic 优先，实时行情三源兜底）
- **持仓股**（`/positions`）：买入持仓管理，添加填 股票代码+买入价+买入数量；同一股票允许多条持仓记录（`position` 表，按 `user_id` 隔离，无唯一约束）；页面实时合并行情算浮动盈亏
- **A股总览**（`/ashare`）：全市场 4900+ 股票清单/日线统计、手动触发同步、股票检索、快讯流
- **放量信号**（`/analysis`）：每日收盘后自动计算的底部/顶部放量信号
- **龙虎榜**（`/lhb`）：沪深北交易所异动个股龙虎榜（东财 datacenter 采集落 `lhb_stock`/`lhb_seat`，17:30 自动同步）；市场 tab + 日期/关键字筛选 + 行展开买卖前五席位；数据源管理在设置页「龙虎榜管理」tab（仅 admin，配置存 `lhb_source`，cron 字段仅展示，实际调度走全局 sync-lhb 任务）
- **个股详情**：股票池/持仓股/A股总览/放量信号的行点击、龙虎榜的名称点击开 `components/stock-pool/stock-detail-modal` 弹窗（K线走势=选股宝图表组件、筹码分布、相关资讯；壳层不滚动，Tab 内容块独立纵向滚动）；`/stock/[code]` 统一详情页 = 实时主要指标（`/api/stocks/real`）+ 同款选股宝图表 + 筹码分布/相关资讯区块（后两者仅 A 股）
- **定时任务管理**（`/cron`）：仅 admin 可见/可操作（侧边栏入口按路由权限档渲染，`/api/cron/*` 校验 `role==='admin'` 否则 403）；查看/改 cron 表达式/启停/手动触发，运行记录落 `cron_run` 表

## 技术栈

- **框架**：Next.js 16（App Router）+ React 19 + TypeScript（strict）
- **UI**：Tailwind CSS v4（CSS-first token 体系，无 tailwind.config，`globals.css` 的 `@theme inline` + `data-theme` 明暗切换）+ 自研 shadcn 风格 `components/ui`（button/badge/card/table/select/tabs/input/label/dialog/popover/dropdown-menu/segmented/textarea，**全部为原生实现，不依赖 radix 浮层**）；图标 lucide-react；图表 recharts
- **数据库**：PostgreSQL + Prisma 6（schema `prisma/schema.prisma`）
- **认证**：自研 jose HS256 cookie session（`src/lib/session.ts`，cookie 名 `vius_session`）+ bcryptjs 密码 + 飞书/Lark/GitHub OAuth（统一门面 `src/server/oauth.ts`，provider HTTP 细节在 `src/server/lark.ts`、`src/server/github.ts`）+ 邀请制白名单门控（`invitations` 表）；**没有 NextAuth**
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
│   │   ├── dashboard/         # 行情总览（三排卡片 + 快讯流 + 板块）
│   │   ├── stock/[code]/      # 个股详情页（/stock 仅保留此详情路由）
│   │   ├── pool/              # 股票池
│   │   ├── positions/         # 持仓股
│   │   ├── analysis/          # 放量信号
│   │   ├── ashare/            # A股总览
│   │   ├── lhb/               # 龙虎榜（榜单 + 行展开席位）
│   │   ├── profile/           # 个人资料（资料/安全：多邮箱、改密、OAuth 绑定）
│   │   ├── settings/          # 设置（偏好 + admin 专属「用户管理」/「权限矩阵」/「角色字典」/「资讯管理」/「龙虎榜管理」tab）
│   │   ├── cron/              # 定时任务管理（仅 admin）
│   │   ├── agent/             # Agent 接入（占位页）
│   │   └── page.tsx           # redirect /dashboard
│   ├── icon.svg               # 站点 favicon（放大镜 + 行情脉冲线，同 components/Logo.tsx）
│   ├── api/auth/              # login/logout/session/permissions/[provider]/login/callback
│   │   └── profile/           # 资料/改密/多邮箱 emails(+primary)/解绑 unbind-oauth
│   ├── api/users/             # 用户管理 API（admin 专属，requireAdmin；invitations/ 为邀请白名单）
│   ├── api/roles/             # 角色字典 API（admin 专属）
│   ├── api/permissions/       # 权限矩阵 API（admin 专属）
│   ├── api/stocks/            # 指数清单 + real/ 行情快照代理 + plates/ 板块缓存（读 plate_cache）+ overview/ 总览三排卡片
│   ├── api/cron/              # 定时任务管理 API（admin 专属，require-admin.ts 鉴权）
│   ├── api/news/              # 资讯管理 API（manage/* 为 admin 数据源管理）
│   ├── api/lhb/               # 龙虎榜 API（列表/seats；manage/* 为 admin 数据源管理）
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
│   ├── route-perm.ts                          # RBAC 路由权限（治理路由清单 / getRouteLevels / requireRouteAccess）
│   ├── prisma.ts                              # 单例（默认导出 + 具名导出共存）
│   ├── realtime.ts / eastmoney.ts             # 实时行情三源降级 / 东财采集（多镜像 + 腾讯兜底）
│   ├── lhb.ts                                 # 东财 datacenter 龙虎榜封装（榜单 RPT_DAILYBILLBOARD_DETAILS + 席位 BUY/SELL）
│   ├── stock-resolver.ts                      # 代码→名称/市场/类型 自动解析（stock_basic 优先，行情兜底）
│   ├── technical.ts / alerts.ts / feishu.ts   # 指标计算 / 告警判定 / 飞书推送
│   ├── scheduler.ts                           # node-cron 调度（JOBS 注册表 + reschedule/trigger/listJobs + cron_run 运行记录）
│   ├── jobs/                                  # sync-daily / sync-news / sync-lhb / sync-plates / check-alerts
│   └── analysis/                              # volume-signals / chip-distribution
├── server/oauth.ts            # 三方 OAuth 统一门面（provider 分发 + 回调账号逻辑 + 邀请门控）
├── server/lark.ts             # 飞书/Lark OAuth HTTP 细节
├── server/github.ts           # GitHub OAuth HTTP 细节
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
- **RBAC 路由权限**：角色存 `roles` 表（`users.role` = 角色 key；admin/member 内置不可删、key 不可改），各角色对 8 条治理路由（/dashboard /pool /positions /ashare /analysis /lhb /cron /agent）的权限档存 `role_route_permissions` 表，三档语义：`rw` 读写 / `ro` 只读（写操作 403「只读权限，无法执行此操作」）/ `hidden` 不可见（侧边栏隐藏入口 + 接口 403「无权限」）；/profile、/settings 恒定可见不入矩阵。**admin 恒全 rw 不查库**；member 默认 7 条 rw + /cron hidden，自定义角色默认全 ro，未配置的路由走默认档兜底。核心 `src/lib/route-perm.ts`（`GOVERNED_ROUTES` 清单 / `getRouteLevels(roleKey)` 带 10s 进程缓存 / `requireRouteAccess(route, { write? })` 仿 requireAdmin 风格，调用方 `if (x instanceof NextResponse) return x`）；强制点：`/stock-pool/api/*`（/pool /positions，alerts/check 虽 GET 按写校验）、`/api/ashare/*`（/ashare；signals→/analysis；sync 的 session 分支按写校验、Bearer CRON_SECRET 分支跳过）、`/api/lhb`（GET）；前端 Sidebar 按 `levels` 过滤入口、AuthGate 对 hidden 路由 `replace('/dashboard')`。管理面：设置页「用户管理 / 权限矩阵 / 角色字典」tab + `/api/users` `/api/roles` `/api/permissions`（均 requireAdmin），当前用户权限 `GET /api/auth/permissions`；权限矩阵保存后调 `clearRouteLevelCache()` 即时生效。注意：角色变更只影响新请求按 `users.role` 查库的部分，已签发 cookie 里的 role 不变（重新登录后刷新）
- **股票池按账号隔离**：`watchlist.user_id`（`@@unique([userId, code])`，级联删除）；`/stock-pool/api/*` 全部按 `session.uid` 过滤；告警历史 `alert_history.user_id` 可空（存量为 null）。定时告警走 `runAlertCheckAll()` 按用户分组跑、飞书推送标题带归属用户名；手动「检查预警」只查当前用户
- **持仓股**：`position` 表按 `user_id` 隔离，**同一 (userId, code) 允许多条**（买入价/数量不同）；新增走 `POST /stock-pool/api/positions`（code+price+quantity，名称/市场自动解析）；持仓实时行情走 `/stock-pool/api/positions/realtime`（与股票池 realtime 独立的 3s TTL 缓存）
- **多邮箱**：`user_emails` 表（全局唯一、小写、source=manual/feishu/lark/github）；任一邮箱可登录（login 路由先查 username 再查邮箱）；OAuth 回调把带回的邮箱落表；老用户 username 是邮箱时 GET /api/auth/profile 惰性回填主邮箱
- **OAuth 邀请门控**（`src/server/oauth.ts` 的 `completeOAuthLogin`，feishu/lark/github 统一）：登录模式按序判定——provider id（`users.lark_union_id` / `users.github_id`）已绑定 → 直接登录（历史授权，不看邀请）；否则**邮箱为硬依赖**（profile 拿不到邮箱 → `/login?error=noemail`，⚠️ 飞书/Lark 无邮箱自动建号的旧行为已取消）；邮箱（小写）命中已有用户的**任一邮箱**（`user_emails` 或 username，多邮箱账号任一邮箱都参与三方登录匹配绑定）→ 免邀请绑定 provider id 并登录；**全新邮箱**才须命中 `invitations` 表 pending 邀请——自动建号（role=member、passwordHash='!oauth'），邀请同事务置 accepted + 回填 userId；无邀请 → `/login?error=invite`
- **邀请管理**：设置页「用户管理」tab（MailPlus「邀请用户」弹窗 + 邀请记录卡，状态 Badge pending=待接受/accepted=已接受，仅 pending 可删，accepted 留档审计）+ `/api/users/invitations`（GET/POST）与 `/api/users/invitations/[id]`（DELETE），均 requireAdmin；邀请只做邮箱白名单，不发邮件、不预分配角色
- **OAuth bind 模式**：已登录用户访问 `/api/auth/<provider>/login` 时 state='bind'，回调把 provider id 绑到当前账号（被他人占用跳 `/profile?tab=security&error=bind`），不看邀请；解绑走 `POST /api/auth/profile/unbind-oauth`，body 带 `{provider:'lark'|'github'}`（缺省 'lark'；feishu/lark 共用 lark_union_id 列），**无密码且另一 provider 也未绑定**时才拒绝解绑（防锁死）
- **Next 16**：动态路由 `params` 是 Promise，必须 `await ctx.params`
- **页面路由**（2026-07 改名）：`/dashboard` 行情总览、`/pool` 股票池、`/positions` 持仓股、`/ashare` A股总览、`/analysis` 放量信号；`/stock/[code]` 详情页保留不动；旧路径由 `next.config.ts` 的 redirects 做 307 兼容跳转；`/stock-pool/api/*` 接口路径未动
- **涨跌配色**：行情涨跌一律用语义类 `text-up`/`text-down`/`bg-up`/`bg-down`/`border-up`/`border-down`（`globals.css` 的 `--up`/`--down` 运行时变量，默认红涨绿跌；`:root[data-up-color='green']` 互换为绿涨红跌）。偏好在设置页「通用-涨跌配色」，存 `localStorage('vius-prefs').upColor`，helper 在 `src/lib/updown.ts`，anti-flash 在 `layout.tsx` 内联脚本；语义红绿（删除/停牌/获利盘等）仍用原 Tailwind 色
- **行情总览三排卡片**：`GET /api/stocks/overview` 无参只读 `overview_cache` 缓存秒回（indices 全局 `user_id='*'`，positions/watchlist 按用户）；`?refresh=1` 重算+upsert（指数与用户股票各一次批量行情调用）。前端 `dashboard/Overview.tsx`：开页先渲染缓存，再 refresh 更新，之后 10s 轮询。持仓排按 code 汇总（`avgCost=Σ(price×qty)/Σqty`，`pnl=(current−avgCost)×totalQty`）；股票池排「关注后涨跌幅」基于 `watchlist.mark_price`（关注时价格，创建时记录、存量 null 懒回填），「资讯关联」=近 7 天 `news_flash.codes` 匹配条数
- **定时任务注册表**：`scheduler.ts` 的 `JOBS`（daily-close/intraday-alerts/sync-news/sync-lhb/sync-plates）是唯一任务来源；`cron_job` 表存 cron/enabled 覆盖（仅改过的有行），`cron_run` 表存每次运行记录；运行时改 cron 走 `rescheduleJob()`（validate→destroy 旧 task→重排），手动触发走 `triggerJob()`（进程内 Set 互斥防重入）
- **注释以中文为主**；路径别名 `@/* → ./src/*`
- **无测试框架**；`test/*.http` 用 REST Client 手动测

## 数据链路（每日自动）

`instrumentation.ts` → `scheduler.ts`（Asia/Shanghai 时区）：
- **15:30 周一~周五**：sync-daily（东财 clist 清单+快照 → 历史回补）→ volume-signals（放量信号落 `stock_signal`）→ check-alerts（自选股告警 → `alert_history` + 飞书 webhook）
- **17:30 周一~周五**：sync-lhb（东财 datacenter 龙虎榜个股榜单+席位明细，当日覆盖式落 `lhb_stock`/`lhb_seat`，数据源为 `lhb_source` 中启用项）
- **盘中每 5 分钟**：check-alerts
- **每 15 秒**：sync-news（轮询 `news_source` 启用源抓取快讯，抓取同时提取股票关键词/代码判定个股相关度，`codes`+`keywords` 一起落 `news_flash`；进程内防重入）
- **盘中每分钟**：sync-plates（腾讯行业/题材板块 + 选股宝板块涨/跌幅榜 → `plate_cache`，函数内卡 9:30-15:00；页面 `/api/stocks/plates` 只读库）

手动触发：`POST /api/ashare/sync?type=daily|news|signals|lhb|all`（登录 session 或 `Bearer $CRON_SECRET`）；`codes=` 参数可只回补指定股票历史，`type=lhb` 时 `date=` 可指定日期。admin 也可在 `/cron` 页面手动触发/改 cron/启停（`POST /api/cron/<id>/trigger`、`PUT /api/cron/<id>`）。

## 数据源注意事项

- 东财（push2/push2his）对高频请求会**临时封 IP**（TCP 重置，约数十分钟解封）：clist 有 push2delay 降级，kline 有编号镜像 + 腾讯 ifzq 兜底（腾讯源无换手率/成交额）
- 东财 volume 单位为「手」，新浪实时量为「股」（check-alerts 已做 ×100 适配）
- 东财 clist 单页上限 100 行（pz 设 200 也只返回 100，分页必须按 100）
- 批量写一律 `createMany(skipDuplicates)`，不要逐条 upsert（高延迟链路下差几个数量级）

## 环境变量（.env.example 有逐条注释）

`DATABASE_URL`（PG）、`SESSION_SECRET`、`SEED_ADMIN_PASSWORD`、`CRON_SECRET`、`FEISHU_WEBHOOK_URL`、`FEISHU_APP_ID/SECRET/REDIRECT_URI`、`LARK_*`、`GITHUB_CLIENT_ID/CLIENT_SECRET/REDIRECT_URI`（三方均未配置时登录页隐藏对应按钮）

## 飞书应用配置（首次部署）

1. 飞书开放平台创建「企业自建应用」，开启网页应用能力
2. 回调地址配置 `https://<域名>/api/auth/feishu/callback`
3. `.env` 填 `FEISHU_APP_ID/SECRET/REDIRECT_URI`，重启
4. 首次飞书登录需邮箱已被 admin 邀请（邀请命中后自动建号 role=member）；admin 账号由 seed 创建

## GitHub OAuth App 配置（首次部署）

1. https://github.com/settings/developers 创建「OAuth App」
2. Authorization callback URL 配置 `https://<域名>/api/auth/github/callback`
3. `.env` 填 `GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET/GITHUB_REDIRECT_URI`（与 OAuth App 回调一致），重启
4. 登录邮箱须先被 admin 在设置页「用户管理」邀请；GitHub 用户隐藏邮箱时须有一个已验证邮箱可读（`user:email` scope），否则登录被拒（`/login?error=noemail`）
