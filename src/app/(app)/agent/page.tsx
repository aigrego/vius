'use client';

import * as React from 'react';
import { KeyRound } from 'lucide-react';

/* Agent 接入：占位页（后续放 API 接入说明 / 密钥管理）。 */
export default function AgentPage() {
  return (
    <div className="mx-auto w-full max-w-[880px] px-6 py-8">
      <h1 className="m-0 text-[22px] font-semibold tracking-tight text-fg-1">Agent 接入</h1>
      <p className="mb-5 mt-1 text-[13px] text-fg-3">让外部 Agent / 脚本安全调用观微的数据与能力</p>

      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-surface px-6 py-16 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-surface-2 text-fg-3">
          <KeyRound size={20} />
        </span>
        <div className="text-[14px] font-medium text-fg-1">即将上线</div>
        <p className="m-0 max-w-[420px] text-[12.5px] leading-relaxed text-fg-3">
          这里将提供 API 密钥管理与接入说明，供 Agent 和脚本调用行情、股票池与信号数据。
        </p>
      </div>
    </div>
  );
}
