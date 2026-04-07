import { Bot, Trash2, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';

interface ChatHeaderProps {
  isThinking: boolean;
  onClear: () => void;
  onNew: () => void;
}

export function ChatHeader({ isThinking, onClear, onNew }: ChatHeaderProps) {
  return (
    <TooltipProvider>
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-background/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="size-10 rounded-xl bg-slate-900 flex items-center justify-center border border-slate-800 transition-all duration-300 hover:scale-105 shadow-sm group">
              <Bot className="size-5 text-white transition-transform duration-300 group-hover:rotate-12" />
            </div>
            <div 
              className={cn(
                "absolute -bottom-1 -right-1 size-3.5 rounded-full border-2 border-background transition-all duration-500",
                isThinking ? "bg-blue-500 animate-pulse scale-110 shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.3)]"
              )} 
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight">OSAP Agent</h2>
              {isThinking && (
                <div className="flex gap-0.5 items-center">
                  <div className="size-1 bg-blue-500 rounded-full animate-bounce" />
                  <div className="size-1 bg-blue-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="size-1 bg-blue-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              )}
            </div>
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-widest leading-tight mt-0.5">
              {isThinking ? "Processing..." : "Online"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={onClear}
                  className="size-9 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                />
              }
            >
              <Trash2 className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">
              <p className="text-xs">Clear history</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={onNew}
                  className="size-9 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10"
                />
              }
            >
              <PlusCircle className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">
              <p className="text-xs">New conversation</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </header>
    </TooltipProvider>
  );
}
