'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Square, Paperclip, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';

interface ChatInputProps {
  onSend: (value: string) => void;
  onStop?: () => void;
  isThinking: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSend, onStop, isThinking, disabled }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const maxChars = 2000;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [value]);

  const handleSubmit = useCallback(() => {
    if (value.trim() && !isThinking && !disabled) {
      onSend(value.trim());
      setValue('');
    }
  }, [value, onSend, isThinking, disabled]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <TooltipProvider>
      <div className="border-t border-border/50 bg-background/95 backdrop-blur-md p-4 sticky bottom-0 z-10">
        <div className="max-w-4xl mx-auto flex flex-col gap-2">
          <div className={cn(
            "relative group flex flex-col items-end gap-2 p-3 rounded-2xl border transition-all duration-300",
            "bg-muted/30 hover:bg-muted/50 focus-within:bg-card focus-within:border-primary/40 focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.3)]",
            "border-border/50"
          )}>
            <div className="flex w-full items-start gap-3">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      disabled 
                      className="size-8 mt-0.5 rounded-full text-muted-foreground/40 hover:text-primary transition-colors shrink-0"
                    />
                  }
                >
                  <Paperclip className="size-4" />
                </TooltipTrigger>
                <TooltipContent side="top">Coming soon</TooltipContent>
              </Tooltip>

              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => setValue(e.target.value.slice(0, maxChars))}
                onKeyDown={handleKeyDown}
                placeholder="Message OSAP..."
                disabled={disabled}
                rows={1}
                className="flex-1 bg-transparent border-0 outline-none resize-none text-sm py-1.5 leading-relaxed text-foreground placeholder:text-muted-foreground min-h-[36px] max-h-[150px] custom-scrollbar selection:bg-primary/20"
              />

              <div className="flex items-center shrink-0 mt-0.5">
                {isThinking ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon"
                          onClick={onStop}
                          className="size-8 rounded-full bg-slate-900 shadow-sm hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-900 transition-all active:scale-95"
                        />
                      }
                    >
                      <Square className="size-3.5 fill-current" />
                    </TooltipTrigger>
                    <TooltipContent side="top">Stop generating</TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    size="icon"
                    onClick={handleSubmit}
                    disabled={!value.trim() || disabled}
                    className={cn(
                      "size-8 rounded-full shadow-sm transition-all active:scale-95",
                      value.trim() 
                        ? "bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-900" 
                        : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                    )}
                  >
                    <Send className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex w-full justify-between items-center px-1">
              <div className="flex gap-4 items-center">
                <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                  <Sparkles className="size-2.5 text-primary/60" />
                  Press Enter to send
                </span>
              </div>
              
              {value.length > 100 && (
                <span className={cn(
                  "text-[10px] tabular-nums font-medium",
                  value.length > maxChars * 0.9 ? "text-orange-500" : "text-muted-foreground/50"
                )}>
                  {value.length} / {maxChars}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
