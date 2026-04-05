'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Search,
  Plus,
  Brain,
  Clock,
  Pin,
  Heart,
  Lightbulb,
  Sparkles,
  Loader2,
  RefreshCw,
  Globe,
  ExternalLink,
  BookOpen,
  Inbox,
  Trash2,
  MessageSquare,
  CheckCircle,
  Send,
  AlertCircle,
  MoreVertical,
} from 'lucide-react';
import type { DbMemoryNode } from '@/types/database';
import { useAuth } from '@/lib/use-auth';
import { cn } from '@/lib/utils';

const typeConfig = {
  fact: {
    label: 'Fact',
    icon: Pin,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    accent: 'border-l-blue-500',
  },
  preference: {
    label: 'Preference',
    icon: Heart,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
    accent: 'border-l-purple-500',
  },
  context: {
    label: 'Context',
    icon: Lightbulb,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    accent: 'border-l-amber-500',
  },
  interaction: {
    label: 'Interaction',
    icon: MessageSquare,
    color: 'text-teal-500',
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/30',
    accent: 'border-l-teal-500',
  },
  task_summary: {
    label: 'Task Summary',
    icon: CheckCircle,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    accent: 'border-l-green-500',
  },
  key_output: {
    label: 'Output',
    icon: Send,
    color: 'text-rose-500',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    accent: 'border-l-rose-500',
  },
};

type MemoryType = DbMemoryNode['type'];
type FilterType = 'all' | MemoryType;

interface KnowledgeSource {
  id: string;
  title: string;
  content?: string;
  url?: string;
  score?: number;
}

function formatTimeAgo(dateString: string | null | undefined): string {
  if (!dateString) return 'Just now';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Just now';
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return 'Just now';
  }
}

function ImportanceDots({ score }: { score: number }) {
  // Score is 1-10
  const groups = [3, 3, 4];
  let currentPos = 0;

  return (
    <div className="flex gap-1.5 items-center">
      {groups.map((count, groupIdx) => (
        <div key={groupIdx} className="flex gap-0.5">
          {Array.from({ length: count }).map((_, i) => {
            currentPos++;
            const filled = currentPos <= score;
            return (
              <div 
                key={i} 
                className={cn(
                  "size-1.5 rounded-full",
                  filled ? "bg-primary" : "bg-muted"
                )}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function MemoryPage() {
  const { user, isLoading: isAuthLoading, isAuthenticated } = useAuth();
  const [memories, setMemories] = useState<DbMemoryNode[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [memorySearchQuery, setMemorySearchQuery] = useState('');
  const [isSearchingHydra, setIsSearchingHydra] = useState(false);
  const [hydraResults, setHydraResults] = useState<KnowledgeSource[]>([]);
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newMemory, setNewMemory] = useState({ 
    content: '', 
    type: 'context' as MemoryType,
    importance: 5 
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [memoryFilter, setMemoryFilter] = useState<FilterType>('all');
  const [isCleaning, setIsCleaning] = useState(false);

  const userId = user?.id;

  const fetchMemories = useCallback(async () => {
    if (!isAuthenticated) return;
    
    try {
      const memoriesRes = await fetch('/api/memory');
      if (memoriesRes.ok) {
        const data = await memoriesRes.json();
        setMemories(data.memories || []);
      }
    } catch (error) {
      console.error('Failed to fetch memories:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  const fetchKnowledgeList = useCallback(async () => {
    try {
      const response = await fetch('/api/knowledge?query=list&limit=20');
      if (response.ok) {
        const data = await response.json();
        if (data.knowledge && Array.isArray(data.knowledge)) {
          setKnowledge(data.knowledge);
        }
      }
    } catch (error) {
      console.error('Failed to fetch knowledge list:', error);
    }
  }, []);

  useEffect(() => {
    if (userId) {
      fetchMemories();
      fetchKnowledgeList();
    }
  }, [userId, fetchMemories, fetchKnowledgeList]);

  // Semantic search debounced
  useEffect(() => {
    if (memorySearchQuery.length <= 3) {
      setHydraResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingHydra(true);
      try {
        const response = await fetch('/api/hydra-memory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'recall',
            query: memorySearchQuery,
            maxResults: 3,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.chunks) {
            setHydraResults(data.chunks.map((c: any) => ({
              id: c.source_id || Math.random().toString(),
              title: c.source_title || 'AI Match',
              content: c.chunk_content,
              score: c.relevancy_score,
            })));
          }
        }
      } catch (e) {
        console.warn('Hydra search failed:', e);
      } finally {
        setIsSearchingHydra(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [memorySearchQuery]);

  const handleAddMemory = async () => {
    if (!newMemory.content.trim() || !userId || newMemory.content.length < 10) return;

    setIsSubmitting(true);
    try {
      // 1. Store in Supabase
      const response = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          content: newMemory.content,
          type: newMemory.type,
          source: 'user_input',
          importance: newMemory.importance,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // 2. Proactively store in HydraDB as well
        try {
          await fetch('/api/hydra-memory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'store',
              text: newMemory.content,
              metadata: { type: newMemory.type, userId }
            }),
          });
        } catch (e) {
          console.warn('Hydra storage failed:', e);
        }

        if (data.memory) {
          setMemories(prev => [data.memory, ...prev]);
        }
        setNewMemory({ content: '', type: 'context', importance: 5 });
        setIsAddDialogOpen(false);
      }
    } catch (error) {
      console.error('Failed to add memory:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      const res = await fetch(`/api/memory?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMemories(prev => prev.filter(m => m.id !== id));
      }
    } catch (e) {
      console.error('Delete failed:', e);
    }
  };

  const handleClearCorrupted = async () => {
    if (!confirm('This will delete all long memories that appear to be raw JSON/Base64. Continue?')) return;
    setIsCleaning(true);
    try {
      const res = await fetch('/api/memory/corrupted', { method: 'DELETE' });
      if (res.ok) {
        await fetchMemories();
      }
    } catch (e) {
      console.error('Cleanup failed:', e);
    } finally {
      setIsCleaning(false);
    }
  };

  const filteredMemories = memories.filter((entry) => {
    const matchesSearch = entry.content.toLowerCase().includes(memorySearchQuery.toLowerCase());
    const matchesFilter = memoryFilter === 'all' || entry.type === memoryFilter;
    return matchesSearch && matchesFilter;
  });

  const memoryTypeCounts = useMemo(() => ({
    all: memories.length,
    fact: memories.filter(m => m.type === 'fact').length,
    preference: memories.filter(m => m.type === 'preference').length,
    context: memories.filter(m => m.type === 'context').length,
    interaction: memories.filter(m => m.type === 'interaction').length,
    task_summary: memories.filter(m => m.type === 'task_summary').length,
    key_output: memories.filter(m => m.type === 'key_output').length,
  }), [memories]);

  // Base64 detection for cleanup button
  const corruptedCount = memories.filter(m => {
    const words = m.content.split(/\s+/);
    return m.content.length > 200 && words.some(w => w.length > 50);
  }).length;

  const showCleanup = corruptedCount > (memories.length * 0.3) && memories.length > 5;

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Memory</h1>
          <p className="text-muted-foreground text-sm">
            Professional persistence and agent context.
          </p>
        </div>
        <div className="flex gap-2">
          {showCleanup && (
            <Button 
              variant="destructive" 
              size="sm" 
              className="rounded-lg h-10" 
              onClick={handleClearCorrupted}
              disabled={isCleaning}
            >
              {isCleaning ? <Loader2 className="size-4 animate-spin mr-2" /> : <Trash2 className="size-4 mr-2" />}
              Purge Raw Data
            </Button>
          )}
          <Button className="rounded-lg h-10 gap-2 font-medium" onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="size-4" />
            Add Memory
          </Button>
        </div>
      </div>

      {/* Main Search & Filters */}
      <div className="space-y-4 sticky top-0 z-20 bg-background/95 backdrop-blur-md pb-4 pt-1 border-b border-border/40">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search memories or ask semantically..."
            value={memorySearchQuery}
            onChange={(e) => setMemorySearchQuery(e.target.value)}
            className="pl-10 h-12 rounded-xl bg-muted/20 border-border/50 focus:bg-background transition-all"
          />
          {isSearchingHydra && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 overflow-x-auto pb-2 no-scrollbar">
          <button
            onClick={() => setMemoryFilter('all')}
            className={cn(
              "px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all border",
              memoryFilter === 'all' 
                ? "bg-primary text-primary-foreground border-primary shadow-sm" 
                : "bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/50"
            )}
          >
            All ({memoryTypeCounts.all})
          </button>
          {Object.entries(typeConfig).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setMemoryFilter(key as MemoryType)}
              className={cn(
                "px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all border",
                memoryFilter === key 
                  ? "bg-primary text-primary-foreground border-primary shadow-sm" 
                  : "bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/50"
              )}
            >
               <config.icon className="size-3.5" />
               {config.label} ({memoryTypeCounts[key as keyof typeof memoryTypeCounts]})
            </button>
          ))}
        </div>
      </div>

      {/* Results Workspace */}
      <div className="space-y-8">
        
        {/* Semantic Section */}
        {hydraResults.length > 0 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-purple-500" />
              <h3 className="text-sm font-bold tracking-tight text-purple-500 uppercase">Semantic AI Matches</h3>
            </div>
            <div className="grid gap-4">
              {hydraResults.map((result, idx) => (
                <Card key={idx} className="p-4 border-purple-500/30 bg-purple-500/[0.03] rounded-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-[10px]">AI Rank {idx + 1}</Badge>
                  </div>
                  <div className="flex gap-4">
                    <div className="shrink-0 size-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500">
                      <Brain className="size-5" />
                    </div>
                    <div className="space-y-1 flex-1">
                      <p className="text-sm font-medium leading-relaxed text-foreground/90">{result.content}</p>
                      <div className="flex items-center gap-2 pt-1 text-[10px] text-muted-foreground">
                        <Badge variant="outline" className="text-[9px] border-purple-500/20 text-purple-500">Hydra Match</Badge>
                        <span>Relevancy: {Math.round((result.score || 0) * 100)}%</span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Regular Memory List */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="size-10 animate-spin text-muted-foreground/30" />
              <p className="text-muted-foreground font-medium">Retrieving memory nodes...</p>
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 border-2 border-dashed border-border/50 rounded-3xl bg-muted/10">
              <div className="size-16 rounded-3xl bg-muted/30 flex items-center justify-center">
                <Brain className="size-8 text-muted-foreground/40" />
              </div>
              <div className="text-center px-6">
                <h3 className="font-bold text-lg mb-1">No Memories Found</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  Try adjusting your search or filters to see more results.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-5">
              {filteredMemories.map((entry) => {
                const config = typeConfig[entry.type] || typeConfig.context;
                return (
                  <MemoryCard 
                    key={entry.id} 
                    memory={entry} 
                    config={config} 
                    onDelete={handleDeleteMemory} 
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add Memory Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[450px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 py-2">
              <Brain className="size-5 text-primary" />
              Store New Knowledge
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pt-2">
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Detailed Content</label>
              <Textarea
                placeholder="Agent context, facts, or observations..."
                value={newMemory.content}
                onChange={(e) => setNewMemory((prev) => ({ ...prev, content: e.target.value }))}
                className="min-h-[140px] rounded-2xl resize-none bg-muted/20 border-border/50 focus:bg-background transition-all p-4"
              />
              <p className="text-[10px] text-muted-foreground">Min. 10 characters required.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Classification</label>
                <Select 
                  value={newMemory.type} 
                  onValueChange={(value) => setNewMemory((prev) => ({ ...prev, type: value as MemoryType }))}
                >
                  <SelectTrigger className="rounded-xl h-11 border-border/50 bg-muted/20">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {Object.entries(typeConfig).map(([key, config]) => (
                      <SelectItem key={key} value={key} className="rounded-lg">
                        <div className="flex items-center gap-2">
                          <config.icon className={cn("size-3.5", config.color)} />
                          {config.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Priority</label>
                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">{newMemory.importance} / 10</span>
                </div>
                <div className="flex items-center h-11 px-1">
                   <input 
                    type="range" 
                    min="1" 
                    max="10" 
                    value={newMemory.importance} 
                    onChange={(e) => setNewMemory(p => ({ ...p, importance: parseInt(e.target.value) }))}
                    className="w-full accent-primary"
                   />
                </div>
              </div>
            </div>
            
            <DialogFooter className="pt-2">
              <Button 
                onClick={handleAddMemory} 
                disabled={!newMemory.content.trim() || isSubmitting || newMemory.content.length < 10}
                className="w-full h-12 rounded-2xl shadow-xl shadow-primary/20 gap-2 font-bold"
              >
                {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Brain className="size-4" />}
                Persist to Memory
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MemoryCard({ memory, config, onDelete }: { 
  memory: DbMemoryNode, 
  config: any, 
  onDelete: (id: string) => void 
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = memory.content.length > 280;
  const contentToDisplay = (expanded || !isLong) ? memory.content : memory.content.substring(0, 280) + '...';

  return (
    <Card className={cn(
      "p-5 rounded-2xl border-border/50 bg-card hover:border-border transition-all group border-l-4",
      config.accent
    )}>
      <div className="flex flex-col gap-4">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={cn("p-1.5 rounded-lg", config.bg, config.color)}>
              <config.icon className="size-3.5" />
            </div>
            <span className={cn("text-[10px] font-bold tracking-widest uppercase", config.color)}>
              {config.label}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground tabular-nums">
              <Clock className="size-3" />
              {formatTimeAgo(memory.created_at)}
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="size-7 rounded-full text-muted-foreground hover:text-destructive transition-all md:opacity-0 group-hover:opacity-100"
              onClick={() => onDelete(memory.id)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Content Section */}
        <div className="space-y-2">
          <p className={cn(
            "text-[14px] leading-relaxed font-normal text-foreground/90 whitespace-pre-wrap break-words",
          )}>
            {contentToDisplay}
          </p>
          {isLong && (
            <button 
              onClick={() => setExpanded(!expanded)} 
              className="text-[11px] font-bold text-primary hover:underline"
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>

        {/* Footer row */}
        <div className="pt-2 flex items-center justify-between border-t border-border/40">
          <ImportanceDots score={memory.importance} />
          {memory.source && (
            <Badge variant="outline" className="text-[9px] font-medium text-muted-foreground border-border/50 uppercase tracking-tighter">
              via {memory.source}
            </Badge>
          )}
        </div>
      </div>
    </Card>
  );
}