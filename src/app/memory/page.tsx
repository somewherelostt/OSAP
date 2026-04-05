'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Search,
  Plus,
  Brain,
  Clock,
  FileText,
  Heart,
  Lightbulb,
  Sparkles,
  Loader2,
  RefreshCw,
  Globe,
  ExternalLink,
  BookOpen,
  Inbox,
} from 'lucide-react';
import type { DbMemoryNode } from '@/types/database';
import { useAuth } from '@/lib/use-auth';

const typeConfig = {
  fact: {
    label: 'Fact',
    icon: FileText,
    color: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  },
  preference: {
    label: 'Preference',
    icon: Heart,
    color: 'text-pink-500 bg-pink-500/10 border-pink-500/20',
  },
  context: {
    label: 'Context',
    icon: Lightbulb,
    color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
  },
  interaction: {
    label: 'Interaction',
    icon: Sparkles,
    color: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
  },
  task_summary: {
    label: 'Task',
    icon: Sparkles,
    color: 'text-green-500 bg-green-500/10 border-green-500/20',
  },
  key_output: {
    label: 'Output',
    icon: FileText,
    color: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
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
  if (!dateString) return 'Unknown';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Unknown';
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return 'Unknown';
  }
}

export default function MemoryPage() {
  const { user, isLoading: isAuthLoading, isAuthenticated } = useAuth();
  const [memories, setMemories] = useState<DbMemoryNode[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [memorySearchQuery, setMemorySearchQuery] = useState('');
  const [knowledgeQuery, setKnowledgeQuery] = useState('');
  const [knowledgeUrl, setKnowledgeUrl] = useState('');
  const [isKnowledgeIngesting, setIsKnowledgeIngesting] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newMemory, setNewMemory] = useState({ 
    content: '', 
    type: 'context' as MemoryType,
    importance: 5 
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [memoryFilter, setMemoryFilter] = useState<FilterType>('all');
  const [hydraSearchResults, setHydraSearchResults] = useState<KnowledgeSource[]>([]);
  const [isSearchingHydra, setIsSearchingHydra] = useState(false);

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
      const response = await fetch('/api/knowledge?query=list&limit=50');
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

  const handleAddMemory = async () => {
    if (!newMemory.content.trim() || !userId) return;

    setIsSubmitting(true);
    try {
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

  const handleIngestKnowledge = async () => {
    if (!knowledgeUrl.trim()) return;

    setIsKnowledgeIngesting(true);
    try {
      const response = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ingest',
          url: knowledgeUrl,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.knowledge) {
          setKnowledge(prev => [{
            id: data.knowledge.id,
            title: data.knowledge.title,
            url: data.knowledge.url,
            content: data.knowledge.summary,
          }, ...prev]);
        }
        setKnowledgeUrl('');
      }
    } catch (error) {
      console.error('Failed to ingest knowledge:', error);
    } finally {
      setIsKnowledgeIngesting(false);
    }
  };

  const handleSearchHydra = async () => {
    if (!knowledgeQuery.trim()) return;

    setIsSearchingHydra(true);
    setHydraSearchResults([]);
    try {
      const response = await fetch('/api/hydra-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recall',
          query: knowledgeQuery,
          maxResults: 10,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.chunks && Array.isArray(data.chunks)) {
          const results = data.chunks.map((chunk: { source_id?: string; source_title?: string; chunk_content?: string; relevancy_score?: number }) => ({
            id: chunk.source_id || '',
            title: chunk.source_title || 'Untitled',
            content: chunk.chunk_content,
            score: chunk.relevancy_score,
          }));
          setHydraSearchResults(results);
        }
      }
    } catch (error) {
      console.error('Failed to search HydraDB:', error);
    } finally {
      setIsSearchingHydra(false);
    }
  };

  const filteredMemories = memories.filter((entry) => {
    const matchesSearch =
      entry.content.toLowerCase().includes(memorySearchQuery.toLowerCase()) ||
      entry.type.toLowerCase().includes(memorySearchQuery.toLowerCase()) ||
      entry.source?.toLowerCase().includes(memorySearchQuery.toLowerCase());
    
    if (memoryFilter === 'all') return matchesSearch;
    return matchesSearch && entry.type === memoryFilter;
  });

  const memoryTypeCounts = {
    fact: memories.filter(m => m.type === 'fact').length,
    preference: memories.filter(m => m.type === 'preference').length,
    context: memories.filter(m => m.type === 'context').length,
    interaction: memories.filter(m => m.type === 'interaction').length,
    task_summary: memories.filter(m => m.type === 'task_summary').length,
    key_output: memories.filter(m => m.type === 'key_output').length,
  };

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Memory</h1>
        <p className="text-muted-foreground text-sm">
          Your agent&apos;s persistent context and learned information
        </p>
      </div>

      {/* Knowledge Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
            <BookOpen className="size-5 text-cyan-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Knowledge</h2>
            <p className="text-xs text-muted-foreground">Ingested web content for semantic search</p>
          </div>
        </div>

        {/* Ingest URL */}
        <Card className="p-4 rounded-xl border-border/50 bg-card">
          <div className="flex gap-2">
            <Input
              placeholder="Enter URL to ingest (e.g., https://example.com)"
              value={knowledgeUrl}
              onChange={(e) => setKnowledgeUrl(e.target.value)}
              className="flex-1 rounded-lg"
            />
            <Button 
              size="sm" 
              variant="outline"
              className="rounded-lg gap-1.5"
              onClick={handleIngestKnowledge}
              disabled={!knowledgeUrl.trim() || isKnowledgeIngesting}
            >
              {isKnowledgeIngesting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Globe className="size-4" />
              )}
              Ingest
            </Button>
          </div>
        </Card>

        {/* Knowledge Search */}
        <Card className="p-4 rounded-xl border-border/50 bg-card space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search knowledge semantically..."
                value={knowledgeQuery}
                onChange={(e) => setKnowledgeQuery(e.target.value)}
                className="pl-9 rounded-lg"
              />
            </div>
            <Button 
              size="sm" 
              variant="outline"
              className="rounded-lg gap-1.5"
              onClick={handleSearchHydra}
              disabled={!knowledgeQuery.trim() || isSearchingHydra}
            >
              {isSearchingHydra ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              Search
            </Button>
          </div>

          {/* Search Results */}
          {hydraSearchResults.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border/50">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Search Results ({hydraSearchResults.length})
              </h4>
              <div className="space-y-2">
                {hydraSearchResults.map((source, index) => (
                  <Card key={`${source.id}-${index}`} className="p-3 rounded-lg bg-muted/30 border-border/50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 flex-1">
                        <Globe className="size-4 text-cyan-500 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{source.title}</p>
                          {source.content && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                              {source.content}
                            </p>
                          )}
                        </div>
                      </div>
                      {source.score && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {(source.score * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Knowledge List */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Ingested URLs ({knowledge.length})
          </h4>
          {knowledge.length > 0 ? (
            <div className="space-y-2">
              {knowledge.slice(0, 20).map((source) => (
                <Card key={source.id} className="p-3 rounded-xl border-border/50 bg-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 flex-1">
                      <Globe className="size-4 text-cyan-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{source.title}</p>
                        {source.content && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {source.content}
                          </p>
                        )}
                      </div>
                    </div>
                    {source.url && (
                      <a 
                        href={source.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center size-7 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-6 rounded-xl border-border/50 bg-card text-center">
              <Inbox className="size-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No knowledge ingested yet
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Paste a URL above to ingest web content
              </p>
            </Card>
          )}
        </div>
      </section>

      {/* Memory Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <Brain className="size-5 text-purple-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Memories</h2>
            <p className="text-xs text-muted-foreground">Structured memories stored in database</p>
          </div>
          <Button size="sm" className="rounded-lg gap-1.5" onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="size-4" />
            Add Memory
          </Button>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search memories..."
              value={memorySearchQuery}
              onChange={(e) => setMemorySearchQuery(e.target.value)}
              className="pl-9 rounded-lg bg-card border-border/50"
            />
          </div>
          <Button size="sm" variant="outline" className="rounded-lg gap-1.5" onClick={fetchMemories}>
            <RefreshCw className="size-4" />
          </Button>
        </div>

        {/* Type Filter Pills */}
        <div className="flex flex-wrap gap-1.5 p-1 bg-muted/30 rounded-xl w-fit">
          <button
            onClick={() => setMemoryFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              memoryFilter === 'all'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All ({memories.length})
          </button>
          {Object.entries(typeConfig).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setMemoryFilter(key as MemoryType)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                memoryFilter === key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {config.label} ({memoryTypeCounts[key as keyof typeof memoryTypeCounts]})
            </button>
          ))}
        </div>
      </section>

      {/* Timeline-style Memory List */}
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-6 top-0 bottom-0 w-px bg-border/50" />

        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center py-12 space-y-3">
              <Loader2 className="size-8 mx-auto text-muted-foreground animate-spin" />
              <p className="text-muted-foreground text-sm">Loading memories...</p>
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="size-12 rounded-2xl bg-muted mx-auto flex items-center justify-center">
                <Brain className="size-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">
                {memorySearchQuery || memoryFilter !== 'all' ? 'No memories match your filters' : 'No memories yet'}
              </p>
              <p className="text-xs text-muted-foreground">
                {memorySearchQuery || memoryFilter !== 'all' ? 'Try different filters' : 'Memories are stored automatically as you use the agent'}
              </p>
            </div>
          ) : (
            filteredMemories.map((entry) => {
              const config = typeConfig[entry.type] || typeConfig.context;
              const Icon = config.icon;

              return (
                <div key={entry.id} className="relative pl-14">
                  {/* Timeline dot */}
                  <div className={`absolute left-4 top-4 size-4 rounded-full bg-background border-2 z-10 ${config.color.split(' ')[1]}`} />

                  <Card className="p-4 rounded-2xl border-border/50 bg-card">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`size-6 rounded-md ${config.color} flex items-center justify-center`}>
                          <Icon className="size-3.5" />
                        </div>
                        <span className={`text-xs font-medium ${config.color}`}>
                          {config.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" />
                        {formatTimeAgo(entry.created_at)}
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed">{entry.content}</p>
                    {entry.source && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Source: {entry.source}
                      </p>
                    )}
                  </Card>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Add Memory Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="size-5 text-purple-500" />
              Add Memory
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Content</label>
              <Textarea
                placeholder="What would you like to remember?"
                value={newMemory.content}
                onChange={(e) => setNewMemory((prev) => ({ ...prev, content: e.target.value }))}
                className="min-h-[120px] resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <Select 
                value={newMemory.type} 
                onValueChange={(value) => setNewMemory((prev) => ({ ...prev, type: value as MemoryType }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(typeConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <div className={`size-2 rounded-full ${config.color.split(' ')[1]}`} />
                        {config.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Importance: {newMemory.importance}/10</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setNewMemory((prev) => ({ ...prev, importance: level }))}
                    className={`flex-1 py-2 rounded text-xs font-medium transition-colors ${
                      newMemory.importance === level
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Low</span>
                <span>Medium</span>
                <span>High</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAddMemory} 
                disabled={!newMemory.content.trim() || isSubmitting}
                className="gap-1.5"
              >
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Brain className="size-4" />
                )}
                Save Memory
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}