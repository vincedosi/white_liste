'use client';

import { useRef, useEffect, useCallback } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface AuditLogProps {
  logs: string[];
  isRunning: boolean;
}

export function AuditLog({ logs, isRunning }: AuditLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([logs.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [logs]);

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="bg-sidebar rounded-xl p-4 max-h-72 overflow-y-auto font-mono text-xs leading-relaxed"
      >
        {logs.length === 0 && (
          <span className="text-white/20 select-none">En attente du lancement...</span>
        )}
        {logs.map((line, i) => (
          <div key={i} className="text-white/50 whitespace-pre-wrap break-all">
            {colorize(line)}
          </div>
        ))}
        {isRunning && (
          <div className="inline-block mt-1">
            <span className="inline-block w-1.5 h-3.5 bg-accent animate-pulse" />
          </div>
        )}
      </div>

      {!isRunning && logs.length > 0 && (
        <div className="flex justify-end mt-2">
          <Button variant="ghost" size="sm" onClick={handleDownload}>
            <Download size={12} />
            Telecharger
          </Button>
        </div>
      )}
    </div>
  );
}

function colorize(line: string): React.ReactNode {
  if (line.includes('━━')) return <span className="text-accent font-semibold">{line}</span>;
  if (line.includes('✓') || line.includes('OK')) return <span className="text-emerald-400/80">{line}</span>;
  if (line.includes('✗') || line.includes('ERREUR') || line.includes('ERROR')) return <span className="text-red-400">{line}</span>;
  if (line.includes('⚠') || line.includes('WARN')) return <span className="text-amber-400">{line}</span>;
  if (/^\[[\d:]+\]/.test(line)) {
    const match = line.match(/^(\[[\d:]+\])(.*)$/);
    if (match) {
      return <><span className="text-white/25">{match[1]}</span><span>{match[2]}</span></>;
    }
  }
  return line;
}
