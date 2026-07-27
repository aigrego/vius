// 服务端环境变量集中访问。仅在服务端代码（route handler、server component、
// 脚本）中引用 —— 客户端组件不要 import 本文件。

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  // 会话签名密钥（jose HS256）。生成：openssl rand -hex 32
  get sessionSecret() {
    return required('SESSION_SECRET');
  },
  // 飞书（CN）OAuth 登录 —— 可选；未配置（空串）时登录页隐藏对应按钮。
  feishuAppId: process.env.FEISHU_APP_ID ?? '',
  feishuAppSecret: process.env.FEISHU_APP_SECRET ?? '',
  feishuRedirectUri: process.env.FEISHU_REDIRECT_URI ?? '',
  // Lark（国际版）OAuth 登录 —— 可选；未配置（空串）时登录页隐藏对应按钮。
  larkAppId: process.env.LARK_APP_ID ?? '',
  larkAppSecret: process.env.LARK_APP_SECRET ?? '',
  larkRedirectUri: process.env.LARK_REDIRECT_URI ?? '',
  // 仅 seed 脚本使用：覆盖默认管理员密码（默认 'admin123'）。
  get seedAdminPassword() {
    return process.env.SEED_ADMIN_PASSWORD || 'admin123';
  },
} as const;
