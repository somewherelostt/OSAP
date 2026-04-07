'use client';

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const SUGGESTED_PROMPTS = [
  "Fetch my last 5 emails",
  "What's in my GitHub notifications?",
  "Summarize my day",
  "Remember that I prefer dark mode",
  "What do you know about me?",
  "Check my calendar for tomorrow",
  "Create a Jira issue for the login bug",
  "Translate 'Hello world' into Spanish"
];

interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void;
  className?: string;
}

export function SuggestedPrompts({ onSelect, className }: SuggestedPromptsProps) {
  return (
    <div className={cn("w-full flex flex-col gap-3 py-4", className)}>
      <div className="flex items-center gap-2 px-4">
        <Sparkles className="size-3.5 text-primary animate-pulse" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Suggested Actions
        </span>
      </div>
      
      <div className="flex overflow-x-auto gap-2 px-4 pb-2 scrollbar-none custom-scrollbar">
        {SUGGESTED_PROMPTS.map((prompt, i) => (
          <button
            key={i}
            onClick={() => onSelect(prompt)}
            className={cn(
              "whitespace-nowrap px-4 py-2 rounded-full border border-border/50",
              "bg-muted/40 hover:bg-muted/60 hover:border-primary/30 transition-all duration-200",
              "text-xs font-medium text-muted-foreground hover:text-foreground",
              "shadow-sm hover:shadow-md active:scale-95"
            )}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
