# 观微 vius

A 股行情同步、多维分析与持仓监控工具。

- 行情总览：指数、快讯流、板块
- 股票池：自选股/持仓、实时盈亏、阈值告警（飞书推送）
- A股总览：全市场日线每日自动同步、底部/顶部放量信号、筹码分布、资讯关联
- 登录：飞书 OAuth / 账号密码

## 快速开始

```bash
cp .env.example .env   # 填写 DATABASE_URL、SESSION_SECRET 等
npm install
npm run db:migrate     # 建表
npm run db:seed        # 种子管理员 admin / admin123（可用 SEED_ADMIN_PASSWORD 覆盖）
npm run dev            # http://localhost:3000
```

生产：`npm run build && npm start`。定时任务（每日 15:30 收盘同步、盘中告警、快讯抓取）随服务启动自动注册。

## 手动同步

```bash
# 全量（清单+快照+信号+快讯），历史不足的股票自动回补
curl -X POST 'http://localhost:3000/api/ashare/sync?type=all' \
  -H "Authorization: Bearer $CRON_SECRET"

# 只回补指定股票历史
curl -X POST 'http://localhost:3000/api/ashare/sync?type=daily&codes=600519,000001' \
  -H "Authorization: Bearer $CRON_SECRET"
```

## 飞书登录配置

见 `AGENTS.md` 的「飞书应用配置」一节。

## 技术栈

Next.js 16 · React 19 · Tailwind CSS v4 · Prisma + PostgreSQL · jose session · node-cron · SWR · recharts
