'use client';

import { useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload } from 'lucide-react';

// 页面只保留底部放量：导入固定 bottom_volume（API 的 type 契约不变）
const IMPORT_TYPE = 'bottom_volume';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // 导入成功后回调（带回导入日期，页面切到该日期刷新）
  onImported: (date: string) => void;
}

// 从文件名提取 8 位日期（如 底部放量股票筛选_20260731.csv → 2026-07-31）
function dateFromFilename(name: string): string | null {
  const m = name.match(/(20\d{2})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function todayString(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/* 导入外部工具计算的放量信号 CSV（样例列：代码,名称,收盘价,涨跌幅%,近一年最高价,高点日期,回撤%,放量倍数,当日量(万股),20日均量(万股)）。
   代码兼容 sh/sz/bj 前缀、fullCode、6 位裸码；信号日期默认取文件名中的 8 位日期，可手改。 */
export function ImportDialog({ open, onOpenChange, onImported }: ImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [date, setDate] = useState(todayString());
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    setFileName(file.name);
    // 信号日期优先取文件名里的 8 位数字
    const d = dateFromFilename(file.name);
    if (d) setDate(d);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ''));
    reader.onerror = () => {
      setIsError(true);
      setMessage('文件读取失败');
    };
    reader.readAsText(file, 'utf-8');
  };

  const runImport = async () => {
    try {
      setImporting(true);
      setMessage(null);
      setIsError(false);
      const res = await fetch('/api/ashare/signals/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText, date, type: IMPORT_TYPE }),
      });
      const result = await res.json().catch(() => null);
      if (!res.ok || !result || result.code !== 200) {
        throw new Error(result?.message || '导入失败');
      }
      const d = result.data;
      const parts = [`导入 ${d.imported} 条`];
      if (d.skipped?.length) parts.push(`跳过未入字典 ${d.skipped.length} 只（${d.skipped.slice(0, 5).join('、')}${d.skipped.length > 5 ? ' 等' : ''}）`);
      if (d.invalid) parts.push(`无效行 ${d.invalid}`);
      setMessage(`${parts.join('，')}`);
      onImported(d.date);
    } catch (e) {
      setIsError(true);
      setMessage(`导入失败：${(e as Error).message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border w-[min(520px,92vw)] p-6">
        <div className="text-lg font-semibold mb-1">导入放量信号</div>
        <p className="text-xs text-fg-3 mb-4">
          支持外部工具筛选的 CSV（需含 代码/收盘价/放量倍数 列），同 (股票,日期,类型) 重复导入会覆盖更新。
        </p>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="text-xs"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-fg-3">信号日期</span>
              <Input
                type="date"
                value={date}
                max={todayString()}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className="w-[150px] h-8 text-xs"
              />
            </div>
          </div>

          {message && (
            <div className={`text-sm border rounded-lg px-3 py-2 ${isError ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/5' : 'text-fg-3 border-border bg-bg'}`}>
              {message}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
            <Button
              size="sm"
              onClick={runImport}
              disabled={importing || !csvText || !date}
            >
              <Upload className={`w-4 h-4 mr-2 ${importing ? 'animate-bounce' : ''}`} />
              {importing ? '导入中...' : '开始导入'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
