import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { env } from './env';

/* Cookie session：jose HS256 签名的 token 放在 HttpOnly cookie 里，
   payload { uid, username, role }。服务端代码通过 getSession()/requireUser()
   读取；登录路由通过 createSessionCookie() 写入。 */

export const SESSION_COOKIE = 'vius_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 天

export interface SessionPayload {
  uid: string;
  username: string;
  role: string; // 'admin' | 'member'
}

/** 未登录错误：requireUser() 在会话缺失/无效时抛出。 */
export class UnauthorizedError extends Error {
  constructor(message = '未登录') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.sessionSecret);
}

/* 为用户签发 session token 并返回要写入的 cookie：
   route handler 里 `const c = await createSessionCookie(user);
   response.cookies.set(c.name, c.value, c.options)`。 */
export async function createSessionCookie(user: { id: string; username: string; role: string }) {
  const value = await new SignJWT({ uid: user.id, username: user.username, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey());
  return {
    name: SESSION_COOKIE,
    value,
    options: {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: MAX_AGE_SECONDS,
      secure: process.env.NODE_ENV === 'production',
    } as const,
  };
}

/* 校验原始 session token → payload；无效/过期返回 null。 */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const { uid, username, role } = payload;
    if (typeof uid !== 'string' || typeof username !== 'string' || typeof role !== 'string') {
      return null;
    }
    return { uid, username, role };
  } catch {
    return null;
  }
}

/* 从请求 cookie 读取当前会话（route handler / server component）。
   未登录返回 null。 */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/* 受保护接口的门槛：返回会话，未登录抛 UnauthorizedError。 */
export async function requireUser(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError('未登录');
  return session;
}
