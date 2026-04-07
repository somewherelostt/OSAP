import { useMemo, useEffect, useState, useRef } from 'react';
import { Bot, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp, Clock, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, getHumanReadableToolName, cleanDescription } from '@/lib/utils';
import { FormattedResult } from '@/components/formatted-result';
import { AuthConnectionCard } from './AuthConnectionCard';
import type { ChatMessage, ToolExecutionCard as ToolCardType } from '@/types/chat';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isAgent = message.role === 'agent';
  const isThinking = message.status === 'thinking' || message.status === 'streaming';

  if (isSystem) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-center w-full my-4"
      >
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 px-2 py-1 bg-muted/30 rounded-md">
          {message.content}
        </span>
      </motion.div>
    );
  }

  const timestampStr = typeof message.timestamp === 'string' 
    ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className={cn(
        "flex w-full mb-6",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div className={cn(
        "flex max-w-[90%] md:max-w-[80%] gap-3",
        isUser ? "flex-reverse items-end" : "items-start"
      )}>
        {isAgent && (
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="size-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 mt-0.5 shadow-lg relative"
          >
            <Bot className="size-4 text-white" />
            <div className="absolute -bottom-0.5 -right-0.5 size-2.5 bg-green-500 rounded-full border-2 border-background" />
          </motion.div>
        )}

        <div className={cn(
          "flex flex-col gap-1.5",
          isUser ? "items-end" : "items-start"
        )}>
          {isAgent && isThinking && (
            <ThoughtDisplay running={true} text={message.content || 'Processing...'} />
          )}

          <div className={cn(
            "relative px-4 py-3 shadow-sm transition-all duration-500",
            isUser 
              ? "bg-slate-900 text-white rounded-2xl rounded-br-sm dark:bg-slate-800" 
              : "bg-card border border-border/60 rounded-2xl rounded-bl-sm",
            isThinking && !isUser && "bg-gradient-to-br from-card to-muted/20"
          )}>
            {isThinking && !message.content ? (
              <div className="flex gap-1 items-center px-1 py-1">
                <motion.div 
                  animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="size-1.5 bg-primary/60 rounded-full" 
                />
                <motion.div 
                  animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
                  transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }}
                  className="size-1.5 bg-primary/60 rounded-full" 
                />
                <motion.div 
                  animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
                  transition={{ repeat: Infinity, duration: 1.5, delay: 0.4 }}
                  className="size-1.5 bg-primary/60 rounded-full" 
                />
              </div>
            ) : (
              <FormattedResult 
                text={message.content} 
                className={isUser ? "text-slate-100" : ""}
              />
            )}
          </div>

          <AnimatePresence>
            {!isThinking && message.authInfo && (
              <AuthConnectionCard 
                toolkit={message.authInfo.toolkit}
                authUrl={message.authInfo.authUrl}
                message={message.authInfo.message}
              />
            )}
            
            {!isThinking && message.toolExecutions && message.toolExecutions.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="w-full flex flex-col gap-2 mt-1"
              >
                {message.toolExecutions.map((tool, idx) => (
                  <ToolCard key={idx} tool={tool} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <span className="text-[10px] text-muted-foreground/50 px-1 font-medium select-none">
            {timestampStr}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function ThoughtDisplay({ running, text }: { running: boolean; text: string }) {
  const [elapsed, setElapsed] = useState(0);
  
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      className="flex items-center gap-2 px-3 py-1 mb-1 rounded-full bg-primary/5 border border-primary/10 w-fit"
    >
      <Loader2 className="size-3 animate-spin text-primary/70" />
      <span className="text-[10px] font-semibold text-primary/70 uppercase tracking-tight truncate max-w-[150px]">
        {text}
      </span>
      <span className="text-[9px] tabular-nums text-muted-foreground/60 flex items-center gap-1">
        <Clock className="size-2" />
        {elapsed}s
      </span>
    </motion.div>
  );
}

function ToolCard({ tool }: { tool: ToolCardType }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const getToolColor = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('gmail')) return 'text-red-500 bg-red-50 border-red-100 dark:bg-red-950/30 dark:border-red-900/50';
    if (n.includes('github')) return 'text-black bg-slate-100 border-slate-200 dark:text-white dark:bg-slate-800 dark:border-slate-700';
    if (n.includes('memory') || n.includes('hydra')) return 'text-purple-500 bg-purple-50 border-purple-100 dark:bg-purple-950/30 dark:border-purple-900/50';
    return 'text-blue-500 bg-blue-50 border-blue-100 dark:bg-blue-950/30 dark:border-blue-900/50';
  };

  return (
    <motion.div 
      layout
      className="bg-muted/30 border border-border/40 rounded-xl overflow-hidden backdrop-blur-sm"
    >
      <div 
        className="flex items-center justify-between p-2 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <div className={cn(
            "text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider",
            getToolColor(tool.tool)
          )}>
            {getHumanReadableToolName(tool.tool)}
          </div>
          <span className="text-[11px] font-medium text-muted-foreground truncate max-w-[150px]">
            {cleanDescription(tool.description, tool.tool)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {tool.status === 'running' && (
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            >
              <Loader2 className="size-3 text-primary" />
            </motion.div>
          )}
          {tool.status === 'done' && <CheckCircle2 className="size-3 text-green-500" />}
          {tool.status === 'error' && <XCircle className="size-3 text-red-500" />}
          <motion.div 
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="size-3 text-muted-foreground/50" />
          </motion.div>
        </div>
      </div>
      
      <AnimatePresence>
        {isOpen && !!tool.result && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 border-t border-border/20 bg-muted/20">
              <div className="text-[10px] font-mono whitespace-pre-wrap overflow-x-auto text-muted-foreground/80 max-h-40 overflow-y-auto custom-scrollbar leading-relaxed">
                {(tool.formattedResult as string) || (typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result as any, null, 2))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
