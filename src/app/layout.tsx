import type { Metadata } from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: '观微 vius',
  description: 'A股行情同步、多维分析与持仓监控',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      data-theme="light"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="h-full">
        {/* 防闪烁主题引导脚本：首帧渲染前解析持久化偏好
            （主题 'light' | 'dark' | 'system'，默认 light；
            涨跌配色取 localStorage('vius-prefs') 的 upColor 字段，'green' 时绿涨红跌），
            逻辑与 src/lib/theme.ts、src/lib/updown.ts 保持同步。 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('theme');var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';var p=JSON.parse(localStorage.getItem('vius-prefs')||'{}');if(p.upColor==='green')document.documentElement.dataset.upColor='green'}catch(e){}",
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
