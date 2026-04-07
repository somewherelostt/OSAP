'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Clock, 
  Reply,
  Copy,
  Search,
  Check
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import { FormattedResult } from '@/components/formatted-result';
import { cn, getHumanReadableToolName, cleanDescription } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface Step {
  step: {
    tool: string;
    description: string;
    order?: number;
  };
  result?: any;
  formatted?: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  error?: string;
}

interface TaskCardProps {
  task: {
    id: string;
    input: string;
    title?: string;
    status: 'pending' | 'running' | 'success' | 'failed';
    created_at: string;
    updated_at?: string;
    result?: {
      answer?: string;
      formatted_answer?: string;
      summary?: string;
      steps?: Step[];
    };
    error?: string;
  };
  initiallyExpanded?: boolean;
}

export function TaskCard({ task, initiallyExpanded = false }: TaskCardProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [expandedEmails, setExpandedEmails] = useState<Set<number>>(new Set());
  const [showAllEmails, setShowAllEmails] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const result = task.result;
  const steps = result?.steps || [];
  const formattedAnswer = result?.formatted_answer || result?.answer;
  
  // Calculate smart summary for header
  const smartSummary = useMemo(() => {
    const emailStep = steps.find(s => s.step.tool.includes('GMAIL_FETCH') || s.step.tool.includes('GMAIL_LIST'));
    if (emailStep?.result?.messages) {
      const messages = emailStep.result.messages;
      const count = messages.length;
      const senders = messages.slice(0, 3).map((m: any) => m.sender || m.from || 'Unknown').join(', ');
      const more = count > 3 ? ` +${count - 3} more` : '';
      return `→ ${count} emails fetched · ${senders}${more}`;
    }
    return null;
  }, [steps]);

  const toggleExpand = () => setIsExpanded(!isExpanded);
  
  const toggleStep = (index: number) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleEmail = (index: number) => {
    setExpandedEmails(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const navigateToHome = (query: string) => {
    const encoded = encodeURIComponent(query);
    router.push(`/?q=${encoded}`);
  };

  const getTaskPreview = () => {
    if (!result) return '';
    const answer = result.answer;

    if (answer &&
        !String(answer).includes('Stored in memory') &&
        !String(answer).includes('memory_store') &&
        !String(answer).includes('memory_recall')) {
      return String(answer).split('\n')[0].replace(/\*\*/g, '').slice(0, 100);
    }

    const dataStep = result.steps?.find((s: Step) =>
      s.status === 'success' &&
      s.step?.tool !== 'memory_store' &&
      s.step?.tool !== 'memory_recall'
    );

    if (dataStep?.formatted) {
      return dataStep.formatted.split('\n')[0].replace(/\*\*/g, '').slice(0, 100);
    }

    if (dataStep?.result) {
      const r = dataStep.result;
      if (Array.isArray(r) && r[0]?.name) {
        return `Found ${r.length} repositories`;
      }
      if (Array.isArray(r) && r[0]?.full_name) {
        return `Found ${r.length} repositories`;
      }
      if (r.messages && Array.isArray(r.messages)) {
        return `${r.messages.length} emails fetched`;
      }
    }

    return '';
  };

  const preview = getTaskPreview();

  const getToolBadgeStyles = (tool: string) => {
    const t = tool.toLowerCase();
    if (t.includes('gmail')) return 'bg-red-500/10 text-red-500 border-red-500/20';
    if (t.includes('github')) return 'bg-slate-950 text-white border-slate-800';
    if (t.includes('memory')) return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
    if (t.includes('http')) return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    return 'bg-muted text-muted-foreground border-border';
  };



  const getStatusBorderColor = (status: string) => {
    switch (status) {
      case 'running': return 'border-l-blue-500';
      case 'success': return 'border-l-green-500';
      case 'failed': return 'border-l-red-500';
      default: return 'border-l-muted';
    }
  };

  const getTaskDuration = () => {
    if (!task.updated_at || !task.created_at) return null;
    const start = new Date(task.created_at).getTime();
    const end = new Date(task.updated_at).getTime();
    const diff = Math.floor((end - start) / 1000);
    return diff > 0 ? `${diff}s` : null;
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffMs / 86400000)}d ago`;
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-rose-500', 'bg-blue-500', 'bg-amber-500', 
      'bg-teal-500', 'bg-purple-500', 'bg-green-500'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const renderEmailCards = (data: any) => {
    const allMessages = data?.messages || [];
    if (!Array.isArray(allMessages) || allMessages.length === 0) return null;

    const visibleMessages = showAllEmails ? allMessages : allMessages.slice(0, 3);
    const hasMore = allMessages.length > 3;

    return (
      <div className="space-y-0.5 mt-4">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2 px-1">Fetched Messages</h4>
        <div className="space-y-1">
          {visibleMessages.map((msg: any, i: number) => {
            const from = msg.sender || msg.from || 'Unknown';
            const initial = from.charAt(0).toUpperCase();
            const colorClass = getAvatarColor(from);
            const isEmailExpanded = expandedEmails.has(i);

            return (
              <div key={i} className="group border-b border-border/40 last:border-0">
                <div 
                  className="flex items-center gap-3 p-3 hover:bg-muted/40 transition-colors cursor-pointer rounded-lg"
                  onClick={() => toggleEmail(i)}
                >
                  <div className={cn("size-10 rounded-full flex items-center justify-center text-white font-bold shrink-0 shadow-sm text-sm", colorClass)}>
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-[13px] text-foreground truncate">{from}</span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">{msg.date || 'Today'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                       <h5 className="text-[13px] font-medium text-foreground/90 truncate mr-2">{msg.subject || '(No Subject)'}</h5>
                       <div className="text-muted-foreground shrink-0">
                          {isEmailExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                       </div>
                    </div>
                    {!isEmailExpanded && (
                      <p className="text-[12px] text-muted-foreground truncate leading-relaxed">
                        {msg.messageText || msg.snippet || 'No preview available.'}
                      </p>
                    )}
                  </div>
                </div>

                <AnimatePresence>
                  {isEmailExpanded && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-4 space-y-3">
                        <div className="bg-muted/30 rounded-xl p-4 font-mono text-[12px] leading-relaxed text-foreground/80 max-h-[300px] overflow-y-auto border border-border/30 whitespace-pre-wrap">
                          {(msg.messageText || msg.snippet || 'No content found.').replace(/\\r\\n/g, '\n')}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 text-[11px] gap-1.5 rounded-full"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigateToHome(`Reply to email from ${from} about ${msg.subject}:`);
                            }}
                          >
                            <Reply className="size-3" />
                            Reply
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 text-[11px] gap-1.5 rounded-full"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigateToHome(`Summarize this email: ${msg.subject} from ${from}`);
                            }}
                          >
                            <Search className="size-3" />
                            Summarize
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 text-[11px] gap-1.5 rounded-full"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(msg.messageText || msg.snippet || '', `msg-${i}`);
                            }}
                          >
                            {copiedId === `msg-${i}` ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
                            {copiedId === `msg-${i}` ? 'Copied!' : 'Copy'}
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {hasMore && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full h-8 text-[11px] font-bold text-primary hover:bg-primary/5 rounded-xl transition-all"
            onClick={() => setShowAllEmails(!showAllEmails)}
          >
            {showAllEmails ? 'Show less' : `+ ${allMessages.length - 3} more messages`}
          </Button>
        )}
      </div>
    );
  };

  return (
    <Card className={cn(
      "overflow-hidden transition-all duration-300 border border-border/50 bg-card hover:bg-accent/5",
      "p-0 border-l-[4px]",
      getStatusBorderColor(task.status),
      isExpanded ? "shadow-md" : ""
    )}>
      {/* Header / Collapsed View */}
      <div 
        className="p-4 cursor-pointer flex items-start gap-4"
        onClick={toggleExpand}
      >
        <div className="mt-1 shrink-0">
          {task.status === 'running' ? (
            <Loader2 className="size-5 animate-spin text-blue-500" />
          ) : task.status === 'failed' ? (
            <XCircle className="size-5 text-red-500" />
          ) : (
            <CheckCircle2 className="size-5 text-green-500" />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-[14px] font-bold text-foreground truncate leading-tight">
              {task.input}
            </h3>
            <div className="flex items-center gap-2">
              <StatusBadge status={task.status} />
              <div className="text-muted-foreground/60">
                {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 mt-1 underline-offset-4 decoration-muted-foreground/30">
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
              <Clock className="size-3" />
              {formatTimeAgo(task.created_at)}
            </div>
            {smartSummary && (
               <div className="text-[11px] text-muted-foreground border-l border-border pl-3 truncate">
                 {smartSummary}
               </div>
            )}
            {!smartSummary && !isExpanded && preview && (
              <div className="text-[11px] text-muted-foreground border-l border-border pl-3 truncate italic opacity-80">
                {preview}...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded View */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-6 bg-muted/5">
              <hr className="border-border/40 -mx-4 mb-4" />
              
              {/* Main Answer Section */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5 px-1">
                  Result
                </h4>
                <div className="bg-card border border-border/40 rounded-xl p-4 shadow-sm">
                  {formattedAnswer ? (
                    <FormattedResult text={formattedAnswer} />
                  ) : (
                    <p className="text-[14px] leading-relaxed text-foreground font-medium">
                      {task.status === 'success' ? 'Completed successfully' : task.error || 'Processing...'}
                    </p>
                  )}
                </div>
              </div>

              {/* Steps Section */}
              <div className="space-y-3">
                 <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1">Plan Steps</h4>
                 <div className="space-y-2 relative ml-1 pt-1">
                   {steps.map((s, i) => (
                     <div key={i} className="relative pl-5 group">
                        <div className={cn(
                          "absolute left-0 top-0 bottom-0 w-[2px] rounded-full transition-colors",
                          s.status === 'success' ? "bg-green-500" : s.status === 'failed' ? "bg-red-500" : "bg-blue-500"
                        )} />
                        <div 
                          className="flex items-center justify-between gap-4 p-3 rounded-xl bg-card border border-border/40 hover:border-primary/20 transition-all cursor-pointer shadow-sm mb-2"
                          onClick={() => toggleStep(i)}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Badge className={cn("px-2 py-0 h-5 text-[9px] font-bold uppercase tracking-tight", getToolBadgeStyles(s.step.tool))}>
                              {getHumanReadableToolName(s.step.tool)}
                            </Badge>
                            <span className="text-[12px] font-medium text-foreground truncate">
                              {cleanDescription(s.step.description, s.step.tool)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {s.status === 'success' ? (
                              <CheckCircle2 className="size-4 text-green-500" />
                            ) : s.status === 'failed' ? (
                              <XCircle className="size-4 text-red-500" />
                            ) : (
                              <Loader2 className="size-4 animate-spin text-blue-500" />
                            )}
                            <div className="text-muted-foreground/40">
                              {expandedSteps.has(i) ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                            </div>
                          </div>
                        </div>
                        
                        <AnimatePresence>
                          {expandedSteps.has(i) && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="pb-3 px-1">
                                <div className="text-[12px] text-muted-foreground font-medium mb-1">Output:</div>
                                <div className="bg-muted/20 p-3 rounded-lg border border-border/20">
                                  {s.formatted ? (
                                    <FormattedResult text={s.formatted} className="text-[13px] text-foreground/90 leading-relaxed font-normal" />
                                  ) : (
                                    <p className="text-[13px] text-foreground/90 leading-relaxed font-normal">
                                      System processed this step successfully.
                                    </p>
                                  )}
                                </div>
                                {(s.step.tool.includes('GMAIL_FETCH') || s.step.tool.includes('GMAIL_LIST')) && s.result && (
                                    renderEmailCards(s.result)
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                     </div>
                   ))}
                 </div>
              </div>

              {/* Task Footer */}
              <div className="pt-4 flex items-center justify-end gap-3 text-[11px] text-muted-foreground/60 font-medium border-t border-border/40">
                <div className="flex items-center gap-1">
                  <Check className="size-3" />
                  <span>{steps.length} {steps.length === 1 ? 'step' : 'steps'}</span>
                </div>
                {getTaskDuration() && (
                  <div className="flex items-center gap-1">
                    <Clock className="size-3" />
                    <span>{getTaskDuration()}</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
