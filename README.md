# 观微 vius

A 股行情同步、多维分析与持仓监控工具，自 [orioles-service](https://github.com/innev/orioles-service) 的 stock/stock-pool 功能抽离而来。

## 功能

- **行情总览**（`/stock`）：指数卡片、华尔街见闻/选股宝快讯流、行业/涨跌板块
- **股票池**（`/stock-pool`）：自选股/持仓管理、实时盈亏、阈值告警（飞书 webhook 推送）、审计日志
- **A股总览**（`/stock-pool/ashare`）：全市场 4900+ 股票清单与日线统计、手动触发同步、股票检索、快讯流
- **放量信号**（`/stock-pool/analysis`）：每日收盘后自动计算的底部/顶部放量信号
- **个股详情**：K 线（MA/MACD/RSI/BOLL）、筹码分布（近似模型）、关联资讯

## 技术栈

Next.js 16 · React 19 · Tailwind CSS v4（CSS-first token 体系）· Prisma + PostgreSQL · 自研 jose cookie session · 飞书/Lark OAuth · node-cron 定时调度 · SWR · recharts

## 快速开始

```bash
cp .env.example .env   # 填写 DATABASE_URL、SESSION_SECRET 等
npm install
npm run db:migrate     # 建表
npm run db:seed        # 创建种子数据（见下）
npm run dev            # http://localhost:3000
```

生产：`npm run build && npm start`。定时任务（每日 15:30 收盘同步、盘中每 5 分钟告警、每 30 分钟快讯抓取）随服务启动自动注册。

## 管理员账号

`npm run db:seed` 会创建种子数据：

- **管理员账号**：用户名 `admin`，密码默认为 `admin123`（可通过环境变量 `SEED_ADMIN_PASSWORD` 自定义），角色 `admin`
- **指数清单**：上证指数、深证成指、创业板指、科创50、深证100、沪深300、中证500、中证1000（行情总览页使用）

> 生产环境请务必通过 `SEED_ADMIN_PASSWORD` 设置强密码后重新执行 `npm run db:seed`（幂等，会更新密码哈希）。

除账号密码外，也支持飞书/Lark OAuth 登录（配置后登录页自动显示入口，首次登录自动创建用户）：

1. 飞书开放平台创建「企业自建应用」，开启网页应用能力
2. 回调地址配置 `https://<域名>/api/auth/feishu/callback`
3. `.env` 填入 `FEISHU_APP_ID` / `FEISHU_APP_SECRET` / `FEISHU_REDIRECT_URI`，重启

## 手动同步

```bash
# 全量（清单+快照+信号+快讯），历史不足的股票自动回补
curl -X POST 'http://localhost:3000/api/ashare/sync?type=all' \
  -H "Authorization: Bearer $CRON_SECRET"

# 只回补指定股票历史
curl -X POST 'http://localhost:3000/api/ashare/sync?type=daily&codes=600519,000001' \
  -H "Authorization: Bearer $CRON_SECRET"
```

更多架构与约定见 [AGENTS.md](./AGENTS.md)。
