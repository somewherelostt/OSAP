'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CommandInputProps {
  placeholder?: string;
  onSubmit?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  initialValue?: string;
}

export function CommandInput({
  placeholder = 'What do you want to do?',
  onSubmit,
  disabled,
  className,
  initialValue = ''
}: CommandInputProps) {
  const [value, setValue] = useState(initialValue);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialValue) {
      setValue(initialValue);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  }, [initialValue]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  const handleSubmit = () => {
    if (value.trim() && onSubmit) {
      onSubmit(value.trim());
      setValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className={cn(
        'relative group rounded-2xl border border-border/50 bg-card transition-all duration-200',
        isFocused && 'border-primary/50 shadow-lg shadow-primary/5',
        className
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <Sparkles className="size-5 text-primary mt-1 shrink-0" />
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          className="flex-1 bg-transparent border-0 outline-none resize-none text-foreground placeholder:text-muted-foreground min-h-[24px] max-h-[120px]"
        />
        <Button
          size="icon"
          variant="ghost"
          onClick={handleSubmit}
          disabled={!value.trim()}
          className={cn(
            'size-8 shrink-0 transition-all duration-200',
            value.trim() && 'text-primary hover:text-primary hover:bg-primary/10'
          )}
        >
          <Send className="size-4" />
        </Button>
      </div>

      {isFocused && (
        <div className="absolute bottom-3 left-4 text-[10px] text-muted-foreground">
          Press Enter to execute · Shift + Enter for new line
        </div>
      )}
    </div>
  );
}
