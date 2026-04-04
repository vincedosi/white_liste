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

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs.length]);

  const handleDownload = useCallback(() => {
    const content = logs.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
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
        className="bg-[#090e17] rounded-lg border border-outline/10 p-4 max-h-80 overflow-y-auto font-mono text-xs leading-relaxed"
      >
        {logs.length === 0 && (
          <span className="text-dim/50 select-none">
            En attente du lancement...
          </span>
        )}
        {logs.map((line, i) => (
          <div key={i} className="text-[#94a3b8] whitespace-pre-wrap break-all">
            {colorize(line)}
          </div>
        ))}
        {isRunning && (
          <div className="inline-block mt-1">
            <span className="inline-block w-2 h-3.5 bg-primary/80 animate-pulse" />
          </div>
        )}
      </div>

      {!isRunning && logs.length > 0 && (
        <div className="flex justify-end mt-2">
          <Button variant="ghost" size="sm" onClick={handleDownload}>
            <Download size={13} />
            Telecharger
          </Button>
        </div>
      )}
    </div>
  );
}

/** Apply color styling to log lines based on content patterns */
function colorize(line: string): React.ReactNode {
  // Section headers (e.g., ━━ HEALTH CHECK ━━━━)
  if (line.includes('━━')) {
    return <span className="text-primary font-semibold">{line}</span>;
  }
  // Success lines
  if (line.includes('✓') || line.includes('OK')) {
    return <span className="text-primary/90">{line}</span>;
  }
  // Error lines
  if (line.includes('✗') || line.includes('ERREUR') || line.includes('ERROR')) {
    return <span className="text-danger">{line}</span>;
  }
  // Warning lines
  if (line.includes('⚠') || line.includes('WARN')) {
    return <span className="text-warning">{line}</span>;
  }
  // Timestamp prefix colorization
  if (/^\[[\d:]+\]/.test(line)) {
    const match = line.match(/^(\[[\d:]+\])(.*)$/);
    if (match) {
      return (
        <>
          <span className="text-dim">{match[1]}</span>
          <span>{match[2]}</span>
        </>
      );
    }
  }
  return line;
}
