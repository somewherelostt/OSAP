'use client';

import { cn } from '@/lib/utils';

interface FormattedResultProps {
  text: string | null | undefined;
  className?: string;
}

export function FormattedResult({ text, className }: FormattedResultProps) {
  if (!text) return null;

  const lines = text.split('\n');
  const isNumberedList = lines.some(l => /^\d+\./.test(l.trim()));

  if (isNumberedList) {
    const items: string[][] = [];
    let current: string[] = [];
    let prefixLines: string[] = [];
    let listStarted = false;

    lines.forEach(line => {
      const isListItem = /^\d+\./.test(line.trim());
      if (isListItem) {
        if (current.length) items.push(current);
        current = [line.replace(/^\d+\.\s*/, '')];
        listStarted = true;
      } else if (!listStarted) {
        if (line.trim()) prefixLines.push(line);
      } else if (line.trim()) {
        current.push(line);
      }
    });
    if (current.length) items.push(current);

    return (
      <div className="flex flex-col gap-2">
        {prefixLines.length > 0 && (
          <div className="mb-1">
            {prefixLines.map((line, idx) => (
              <p key={idx} className="text-sm font-medium mb-1 last:mb-0">
                {line}
              </p>
            ))}
          </div>
        )}
        <ol className="space-y-3 list-none p-0">
          {items.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                {item.map((line, j) => {
                  const boldParsed = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                  const withLinks = boldParsed.replace(
                    /(https?:\/\/[^\s]+)/g,
                    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-primary underline break-all">$1</a>'
                  );
                  return (
                    <p
                      key={j}
                      className={cn(
                        j === 0 ? 'font-medium text-sm' : 'text-xs text-muted-foreground mt-0.5'
                      )}
                      dangerouslySetInnerHTML={{ __html: withLinks }}
                    />
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const html = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-primary underline">$1</a>')
    .replace(/\n/g, '<br />');

  return (
    <div
      className={cn('text-sm leading-relaxed', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
