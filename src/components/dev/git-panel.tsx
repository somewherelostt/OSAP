'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  Plus,
  RefreshCw,
  Loader2,
  Check,
  X,
  AlertCircle,
  ExternalLink,
  Copy,
} from 'lucide-react';

interface GitRepo {
  id: string;
  name: string;
  url: string;
  branch: string;
  branches: string[];
  status: 'synced' | 'ahead' | 'behind' | 'diverged';
  commits: GitCommit[];
}

interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

interface GitPanelProps {
  onClone?: (url: string) => Promise<void>;
  onCommit?: (message: string) => Promise<void>;
  onPush?: () => Promise<void>;
  onPull?: () => Promise<void>;
}

const mockCommits: GitCommit[] = [
  { hash: 'a1b2c3d', message: 'Add memory integration', author: 'Dev', date: '2 hours ago' },
  { hash: 'e4f5g6h', message: 'Fix task execution bug', author: 'Dev', date: '1 day ago' },
  { hash: 'i7j8k9l', message: 'Update dependencies', author: 'Dev', date: '3 days ago' },
];

export function GitPanel({ onClone, onCommit, onPush, onPull }: GitPanelProps) {
  const [repoUrl, setRepoUrl] = useState('');
  const [cloneStatus, setCloneStatus] = useState<string | null>(null);
  const [isCloning, setIsCloning] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [repos] = useState<GitRepo[]>([
    {
      id: '1',
      name: 'osap-app',
      url: 'https://github.com/user/osap-app',
      branch: 'main',
      branches: ['main', 'develop', 'feature/new-ui'],
      status: 'synced',
      commits: mockCommits,
    },
  ]);
  const [selectedRepo, setSelectedRepo] = useState<GitRepo | null>(repos[0]);
  const [activeTab, setActiveTab] = useState('commits');

  const handleClone = async () => {
    if (!repoUrl) return;
    setIsCloning(true);
    setCloneStatus(null);
    try {
      if (onClone) {
        await onClone(repoUrl);
        setCloneStatus('Cloned successfully');
      } else {
        await new Promise(resolve => setTimeout(resolve, 2000));
        setCloneStatus('Cloned successfully (mock)');
      }
    } catch (error) {
      setCloneStatus(`Clone failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCloning(false);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    setIsCommitting(true);
    try {
      if (onCommit) {
        await onCommit(commitMessage);
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      setCommitMessage('');
    } catch (error) {
      console.error('Commit failed:', error);
    } finally {
      setIsCommitting(false);
    }
  };

  const handlePush = async () => {
    setIsPushing(true);
    try {
      if (onPush) {
        await onPush();
      } else {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error('Push failed:', error);
    } finally {
      setIsPushing(false);
    }
  };

  const handlePull = async () => {
    setIsPulling(true);
    try {
      if (onPull) {
        await onPull();
      } else {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error('Pull failed:', error);
    } finally {
      setIsPulling(false);
    }
  };

  const getStatusBadge = (status: GitRepo['status']) => {
    switch (status) {
      case 'synced':
        return <Badge className="bg-green-500/10 text-green-500"><Check className="size-3 mr-1" /> Synced</Badge>;
      case 'ahead':
        return <Badge className="bg-blue-500/10 text-blue-500"><GitCommit className="size-3 mr-1" /> Ahead</Badge>;
      case 'behind':
        return <Badge className="bg-yellow-500/10 text-yellow-500"><RefreshCw className="size-3 mr-1" /> Behind</Badge>;
      case 'diverged':
        return <Badge className="bg-red-500/10 text-red-500"><AlertCircle className="size-3 mr-1" /> Diverged</Badge>;
    }
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
        <TabsList>
          <TabsTrigger value="commits">Commits</TabsTrigger>
          <TabsTrigger value="clone">Clone</TabsTrigger>
          <TabsTrigger value="branches">Branches</TabsTrigger>
        </TabsList>

        <TabsContent value="commits" className="space-y-4">
          <div className="flex items-center gap-3">
            <select
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
              value={selectedRepo?.id || ''}
              onChange={(e) => setSelectedRepo(repos.find(r => r.id === e.target.value) || null)}
            >
              {repos.map(repo => (
                <option key={repo.id} value={repo.id}>{repo.name}</option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={handlePull} disabled={isPulling}>
              {isPulling ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </Button>
            <Button size="sm" variant="outline" onClick={handlePush} disabled={isPushing}>
              {isPushing ? <Loader2 className="size-4 animate-spin" /> : <GitBranch className="size-4" />}
            </Button>
          </div>

          {selectedRepo && (
            <>
              <div className="flex items-center gap-2">
                <GitBranch className="size-4 text-muted-foreground" />
                <span className="font-medium">{selectedRepo.branch}</span>
                {getStatusBadge(selectedRepo.status)}
              </div>

              <div className="space-y-2">
                {selectedRepo.commits.map((commit) => (
                  <Card key={commit.hash} className="p-3 flex items-start gap-3">
                    <GitCommit className="size-4 text-muted-foreground mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{commit.message}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span
                          className="font-mono cursor-pointer hover:text-foreground"
                          onClick={() => copyHash(commit.hash)}
                        >
                          {commit.hash}
                          <Copy className="size-3 inline ml-1" />
                        </span>
                        <span>•</span>
                        <span>{commit.author}</span>
                        <span>•</span>
                        <span>{commit.date}</span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="space-y-2 pt-2 border-t">
                <Input
                  placeholder="Commit message"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                />
                <Button onClick={handleCommit} disabled={!commitMessage.trim() || isCommitting} className="w-full">
                  {isCommitting ? <Loader2 className="size-4 animate-spin mr-2" /> : <GitCommit className="size-4 mr-2" />}
                  Commit
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="clone" className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="https://github.com/user/repo.git"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
            />
            <Button onClick={handleClone} disabled={!repoUrl || isCloning}>
              {isCloning ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            </Button>
          </div>
          {cloneStatus && (
            <div className={`text-sm ${cloneStatus.includes('failed') ? 'text-red-500' : 'text-green-500'}`}>
              {cloneStatus}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Enter a Git repository URL to clone it into your workspace.
          </p>
        </TabsContent>

        <TabsContent value="branches" className="space-y-4">
          {selectedRepo && (
            <div className="space-y-2">
              {selectedRepo.branches.map((branch) => (
                <Card
                  key={branch}
                  className={`p-3 flex items-center justify-between cursor-pointer ${
                    branch === selectedRepo.branch ? 'border-primary' : ''
                  }`}
                  onClick={() => setSelectedRepo({ ...selectedRepo, branch })}
                >
                  <div className="flex items-center gap-3">
                    <GitBranch className="size-4 text-muted-foreground" />
                    <span className="font-medium">{branch}</span>
                    {branch === selectedRepo.branch && (
                      <Badge variant="secondary">current</Badge>
                    )}
                  </div>
                  {branch !== selectedRepo.branch && (
                    <Button size="sm" variant="ghost">
                      <GitPullRequest className="size-4" />
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
