'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CodeEditor } from '@/components/dev/editor';
import { FileTree } from '@/components/dev/file-tree';
import {
  Code2,
  Plug,
  GitBranch,
  GitCommit,
  Plus,
  Trash2,
  Loader2,
  Send,
  RefreshCw,
  Play,
  Copy,
  X,
  ChevronDown,
  ChevronRight,
  GitPullRequest,
  ArrowUp,
  GitMerge,
  Terminal as TerminalIcon,
} from 'lucide-react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
  language?: string;
  children?: FileNode[];
}

interface TabItem {
  id: string;
  name: string;
  content: string;
  modified?: boolean;
}

interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

const defaultFiles: FileNode[] = [
  {
    id: 'src',
    name: 'src',
    type: 'folder',
    children: [
      {
        id: 'index.ts',
        name: 'index.ts',
        type: 'file',
        content: `// OSAP Dev Environment
// Start coding here!

export function greet(name: string): string {
  return \`Hello, \${name}! Ready to build?\`;
}

console.log(greet('Developer'));
`,
        language: 'typescript',
      },
      {
        id: 'utils.ts',
        name: 'utils.ts',
        type: 'file',
        content: `// Utility functions

export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
`,
        language: 'typescript',
      },
      {
        id: 'app.ts',
        name: 'app.ts',
        type: 'file',
        content: `// Main application
import { greet } from './index';

const message = greet('OSAP');
console.log(message);
`,
        language: 'typescript',
      },
    ],
  },
  {
    id: 'package.json',
    name: 'package.json',
    type: 'file',
    content: JSON.stringify({
      name: 'osap-project',
      version: '1.0.0',
      scripts: { dev: 'ts-node src/index.ts' },
    }, null, 2),
    language: 'json',
  },
  {
    id: 'README.md',
    name: 'README.md',
    type: 'file',
    content: '# OSAP Project\n\nBuilt with OSAP Dev Environment.',
    language: 'markdown',
  },
];

const languageColors: Record<string, string> = {
  typescript: 'text-blue-400',
  javascript: 'text-yellow-400',
  python: 'text-green-400',
  json: 'text-orange-400',
  markdown: 'text-purple-400',
  html: 'text-red-400',
  css: 'text-pink-400',
};

function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go',
    json: 'json', md: 'markdown',
    html: 'html', css: 'css',
  };
  return map[ext] || 'plaintext';
}

function findFileById(nodes: FileNode[], id: string): FileNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findFileById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function flattenFiles(nodes: FileNode[], depth = 0): { node: FileNode; depth: number }[] {
  const result: { node: FileNode; depth: number }[] = [];
  for (const node of nodes) {
    result.push({ node, depth });
    if (node.children) {
      result.push(...flattenFiles(node.children, depth + 1));
    }
  }
  return result;
}

export default function DevPage() {
  const [files, setFiles] = useState<FileNode[]>(defaultFiles);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(defaultFiles[0].children?.[0] || null);
  const [tabs, setTabs] = useState<TabItem[]>([
    { id: 'index.ts', name: 'index.ts', content: defaultFiles[0].children?.[0]?.content || '' },
  ]);
  const [activeTab, setActiveTab] = useState('index.ts');
  const [code, setCode] = useState(defaultFiles[0].children?.[0]?.content || '');
  
  // Three-panel layout: Editor | API | Git
  const [activePanel, setActivePanel] = useState<'editor' | 'api' | 'git'>('editor');
  
  // HTTP client state
  const [httpMethod, setHttpMethod] = useState('GET');
  const [httpUrl, setHttpUrl] = useState('/api/tasks');
  const [httpHeaders, setHttpHeaders] = useState('{}');
  const [httpBody, setHttpBody] = useState('');
  const [httpResponse, setHttpResponse] = useState<HttpResponse | null>(null);
  const [isSending, setIsSending] = useState(false);
  
  // Git panel state
  const [gitBranch, setGitBranch] = useState('main');
  const [commitMessage, setCommitMessage] = useState('');
  const [gitLog, setGitLog] = useState<string[]>([]);
  
  // Terminal refs
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const commandBufferRef = useRef('');
  const commandHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const xterm = new XTerm({
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#c9d1d9',
        black: '#484f58',
        red: '#f85149',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Write welcome message
    xterm.writeln('\x1b[1;32m╔════════════════════════════════════════╗\x1b[0m');
    xterm.writeln('\x1b[1;32m║   OSAP Dev Terminal v1.0              ║\x1b[0m');
    xterm.writeln('\x1b[1;32m╚════════════════════════════════════════╝\x1b[0m');
    xterm.writeln('');
    xterm.writeln('Type \x1b[1;33mhelp\x1b[0m for available commands');
    xterm.writeln('');

    // Handle input
    xterm.onData((data) => {
      const code = data.charCodeAt(0);
      
      if (data === '\r') { // Enter
        const cmd = commandBufferRef.current.trim();
        if (cmd) {
          commandHistoryRef.current.push(cmd);
          historyIndexRef.current = commandHistoryRef.current.length;
        }
        xterm.writeln('');
        processCommand(xterm, cmd);
        commandBufferRef.current = '';
        historyIndexRef.current = -1;
        writePrompt(xterm);
      } else if (data === '\x7f') { // Backspace
        if (commandBufferRef.current.length > 0) {
          commandBufferRef.current = commandBufferRef.current.slice(0, -1);
          xterm.write('\b \b');
        }
      } else if (data === '\x1b[A') { // Arrow up
        if (historyIndexRef.current < commandHistoryRef.current.length - 1) {
          historyIndexRef.current++;
          const histCmd = commandHistoryRef.current[commandHistoryRef.current.length - 1 - historyIndexRef.current];
          clearLine(xterm);
          xterm.write(histCmd);
          commandBufferRef.current = histCmd;
        }
      } else if (data === '\x1b[B') { // Arrow down
        if (historyIndexRef.current > 0) {
          historyIndexRef.current--;
          const histCmd = commandHistoryRef.current[commandHistoryRef.current.length - 1 - historyIndexRef.current];
          clearLine(xterm);
          xterm.write(histCmd);
          commandBufferRef.current = histCmd;
        } else if (historyIndexRef.current === 0) {
          historyIndexRef.current = -1;
          clearLine(xterm);
          commandBufferRef.current = '';
        }
      } else if (code >= 32) { // Printable characters
        commandBufferRef.current += data;
        xterm.write(data);
      }
    });

    // Initial prompt
    writePrompt(xterm);

    // Resize handler
    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(() => fitAddon.fit());
    if (terminalRef.current) resizeObserver.observe(terminalRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      xterm.dispose();
      xtermRef.current = null;
    };
  }, []);

  const writePrompt = (xterm: XTerm) => {
    xterm.write('\x1b[1;32mdeveloper@osap\x1b[0m:\x1b[1;34m~/workspace\x1b[0m$ ');
  };

  const clearLine = (xterm: XTerm) => {
    const len = commandBufferRef.current.length;
    for (let i = 0; i < len; i++) {
      xterm.write('\b \b');
    }
  };

  const processCommand = (xterm: XTerm, cmd: string) => {
    const trimmed = cmd.trim().toLowerCase();
    const parts = cmd.trim().split(/\s+/);
    const command = parts[0].toLowerCase();

    // help command
    if (command === 'help') {
      xterm.writeln('\x1b[1;36mAvailable commands:\x1b[0m');
      xterm.writeln('  \x1b[33mhelp\x1b[0m          - Show this help');
      xterm.writeln('  \x1b[33mclear\x1b[0m         - Clear terminal');
      xterm.writeln('  \x1b[33mls\x1b[0m            - List files');
      xterm.writeln('  \x1b[33mecho\x1b[0m [text]   - Print text');
      xterm.writeln('  \x1b[33mnode\x1b[0m [file]   - Run JS file');
      xterm.writeln('  \x1b[33mdate\x1b[0m          - Show current date/time');
      xterm.writeln('  \x1b[33mpwd\x1b[0m           - Print working directory');
      xterm.writeln('  \x1b[33mwhoami\x1b[0m        - Show current user');
      xterm.writeln('');
      return;
    }

    // clear command
    if (command === 'clear' || command === 'cls') {
      xterm.clear();
      return;
    }

    // date command
    if (command === 'date') {
      xterm.writeln(new Date().toString());
      xterm.writeln('');
      return;
    }

    // pwd command
    if (command === 'pwd') {
      xterm.writeln('/workspace');
      xterm.writeln('');
      return;
    }

    // whoami command
    if (command === 'whoami') {
      xterm.writeln('developer');
      xterm.writeln('');
      return;
    }

    // echo command
    if (command === 'echo') {
      const text = cmd.slice(5);
      xterm.writeln(text || '');
      xterm.writeln('');
      return;
    }

    // ls command
    if (command === 'ls') {
      const flatFiles = flattenFiles(files);
      flatFiles.forEach(({ node, depth }) => {
        const prefix = '  '.repeat(depth);
        if (node.type === 'folder') {
          xterm.writeln(`\x1b[1;34m${prefix}${node.name}/\x1b[0m`);
        } else {
          const color = getLanguage(node.name) === 'typescript' ? '\x1b[33m' : '\x1b[37m';
          xterm.writeln(`${color}${prefix}${node.name}\x1b[0m`);
        }
      });
      xterm.writeln('');
      return;
    }

    // node command - simulate running a JS file
    if (command === 'node') {
      const filename = parts[1];
      if (!filename) {
        xterm.writeln('\x1b[31mError:\x1b[0m Usage: node <filename>');
        xterm.writeln('');
        return;
      }
      
      const file = files.find(f => f.name === filename) || 
        (files[0].children?.find(f => f.name === filename));
      
      if (!file || file.type !== 'file') {
        xterm.writeln(`\x1b[31mError:\x1b[0m File not found: ${filename}`);
        xterm.writeln('');
        return;
      }

      xterm.writeln(`\x1b[33mExecuting ${filename}...\x1b[0m`);
      xterm.writeln('');
      
      try {
        // Safe eval for simple expressions
        const safeEval = (code: string): string => {
          const logs: string[] = [];
          const mockConsole = {
            log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
            error: (...args: unknown[]) => logs.push('\x1b[31m' + args.map(String).join(' ') + '\x1b[0m'),
            warn: (...args: unknown[]) => logs.push('\x1b[33m' + args.map(String).join(' ') + '\x1b[0m'),
          };
          
          const fn = new Function('console', code);
          fn(mockConsole);
          return logs.join('\n');
        };
        
        const output = safeEval(file.content || '');
        if (output) {
          xterm.writeln(output);
        }
        xterm.writeln('\x1b[32mProcess exited with code 0\x1b[0m');
      } catch (e) {
        xterm.writeln(`\x1b[31mError:\x1b[0m ${e instanceof Error ? e.message : 'Execution failed'}`);
        xterm.writeln('\x1b[31mProcess exited with code 1\x1b[0m');
      }
      xterm.writeln('');
      return;
    }

    // Unknown command
    xterm.writeln(`\x1b[31mcommand not found:\x1b[0m ${cmd}`);
    xterm.writeln("Type \x1b[33mhelp\x1b[0m for available commands.");
    xterm.writeln('');
  };

  const handleSendHttp = async () => {
    if (!httpUrl) return;
    setIsSending(true);
    setHttpResponse(null);

    try {
      const fullUrl = httpUrl.startsWith('http') ? httpUrl : `${window.location.origin}${httpUrl}`;
      const headers: Record<string, string> = {};
      try {
        const parsedHeaders = JSON.parse(httpHeaders);
        Object.assign(headers, parsedHeaders);
      } catch {
        // Use default headers
      }
      
      const options: RequestInit = {
        method: httpMethod,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      };
      if (['POST', 'PUT', 'PATCH'].includes(httpMethod) && httpBody) {
        options.body = httpBody;
      }
      
      const res = await fetch(fullUrl, options);
      let body = '';
      try {
        const json = await res.json();
        body = JSON.stringify(json, null, 2);
      } catch {
        body = await res.text();
      }
      
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      
      setHttpResponse({ 
        status: res.status, 
        statusText: res.statusText,
        headers: responseHeaders,
        body 
      });
    } catch (error) {
      setHttpResponse({ 
        status: 0, 
        statusText: 'Error',
        headers: {},
        body: error instanceof Error ? error.message : 'Request failed' 
      });
    } finally {
      setIsSending(false);
    }
  };

  const updateFileContent = (id: string, content: string) => {
    const updateNodes = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.id === id) return { ...node, content };
        if (node.children) return { ...node, children: updateNodes(node.children) };
        return node;
      });
    };
    setFiles(prev => updateNodes(prev));
    if (activeTab === id) setCode(content);
    setTabs(prev => prev.map(t => t.id === id ? { ...t, content, modified: true } : t));
  };

  const handleFileSelect = (file: FileNode) => {
    if (file.type !== 'file') return;
    setSelectedFile(file);
    if (!tabs.find(t => t.id === file.id)) {
      setTabs(prev => [...prev, { id: file.id, name: file.name, content: file.content || '' }]);
    }
    setActiveTab(file.id);
    setCode(file.content || '');
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);
    if (activeTab === id && newTabs.length > 0) {
      const lastTab = newTabs[newTabs.length - 1];
      setActiveTab(lastTab.id);
      const file = findFileById(files, lastTab.id);
      if (file) {
        setSelectedFile(file);
        setCode(lastTab.content);
      }
    }
  };

  const runCode = () => {
    if (!selectedFile) return;
    const xterm = xtermRef.current;
    if (!xterm) return;
    
    xterm.writeln('');
    xterm.writeln(`\x1b[33mRunning ${selectedFile.name}...\x1b[0m`);
    xterm.writeln('');
    
    try {
      const safeEval = (code: string): string => {
        const logs: string[] = [];
        const mockConsole = {
          log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
          error: (...args: unknown[]) => logs.push('\x1b[31m' + args.map(String).join(' ') + '\x1b[0m'),
          warn: (...args: unknown[]) => logs.push('\x1b[33m' + args.map(String).join(' ') + '\x1b[0m'),
        };
        const fn = new Function('console', code);
        fn(mockConsole);
        return logs.join('\n');
      };
      
      const output = safeEval(code);
      if (output) {
        xterm.writeln(output);
      }
      xterm.writeln('\x1b[32mProcess exited with code 0\x1b[0m');
    } catch (e) {
      xterm.writeln(`\x1b[31mError:\x1b[0m ${e instanceof Error ? e.message : 'Execution failed'}`);
      xterm.writeln('\x1b[31mProcess exited with code 1\x1b[0m');
    }
    xterm.writeln('');
    writePrompt(xterm);
  };

  const handleGitAction = (action: 'clone' | 'pull' | 'push') => {
    const timestamp = new Date().toLocaleTimeString();
    let message = '';
    
    switch (action) {
      case 'clone':
        message = `\x1b[32m[${timestamp}] Simulated: git clone https://github.com/example/repo.git\x1b[0m\n\x1b[32mCloning into 'repo'...\x1b[0m\n\x1b[32mReceiving objects: 100%\x1b[0m\n\x1b[32mResolving deltas: 100%\x1b[0m\n\x1b[32mSuccess!\x1b[0m`;
        break;
      case 'pull':
        message = `\x1b[32m[${timestamp}] Simulated: git pull origin ${gitBranch}\x1b[0m\n\x1b[32mAlready up to date.\x1b[0m\n\x1b[32mSuccess!\x1b[0m`;
        break;
      case 'push':
        message = commitMessage 
          ? `\x1b[32m[${timestamp}] Simulated: git commit -m "${commitMessage}"\x1b[0m\n\x1b[32m[${gitBranch} abc1234] ${commitMessage}\x1b[0m\n\x1b[32m1 file changed, 3 insertions(+)\x1b[0m\n\n\x1b[32m[${timestamp}] Simulated: git push origin ${gitBranch}\x1b[0m\n\x1b[32mEnumerating objects: 5, done.\x1b[0m\n\x1b[32mCounting objects: 100%\x1b[0m\n\x1b[32mWriting objects: 100%\x1b[0m\n\x1b[32mSuccess!\x1b[0m`
          : `\x1b[31m[${timestamp}] Error: No commit message provided\x1b[0m`;
        break;
    }
    
    setGitLog(prev => [...prev, message, '']);
  };

  const copyResponse = () => {
    if (httpResponse?.body) {
      navigator.clipboard.writeText(httpResponse.body);
    }
  };

  const activeTabFile = tabs.find(t => t.id === activeTab);
  const currentFile = activeTabFile ? findFileById(files, activeTab) || selectedFile : selectedFile;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-background">
      {/* Header */}
      <div className="p-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">Dev Environment</h1>
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
              <button
                onClick={() => setActivePanel('editor')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activePanel === 'editor' 
                    ? 'bg-background shadow-sm' 
                    : 'hover:bg-muted'
                }`}
              >
                <Code2 className="size-4" />
                Editor
              </button>
              <button
                onClick={() => setActivePanel('api')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activePanel === 'api' 
                    ? 'bg-background shadow-sm' 
                    : 'hover:bg-muted'
                }`}
              >
                <Plug className="size-4" />
                API
              </button>
              <button
                onClick={() => setActivePanel('git')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activePanel === 'git' 
                    ? 'bg-background shadow-sm' 
                    : 'hover:bg-muted'
                }`}
              >
                <GitBranch className="size-4" />
                Git
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activePanel === 'editor' && (
              <>
                <Button size="sm" variant="outline" onClick={runCode} className="gap-1.5">
                  <Play className="size-4" />
                  Run
                </Button>
                <span className="text-xs text-muted-foreground">
                  {currentFile?.name || 'No file selected'}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 3-Column Layout */}
      <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
        {/* File Tree - 20% */}
        {activePanel === 'editor' && (
          <div className="w-[20%] min-w-[180px] border-r border-border/50 bg-muted/20 overflow-hidden flex flex-col">
            <div className="p-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border/50">
              Explorer
            </div>
            <div className="flex-1 overflow-auto">
              <FileTree 
                files={files} 
                selectedId={selectedFile?.id} 
                onSelect={handleFileSelect}
              />
            </div>
          </div>
        )}

        {/* Editor / API / Git Panel - 50% / flex-1 */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Editor Panel */}
          {activePanel === 'editor' && (
            <>
              {/* Tab Bar */}
              <div className="flex border-b border-border/50 bg-muted/30 overflow-x-auto">
                {tabs.map((tab) => (
                  <div
                    key={tab.id}
                    className={`flex items-center gap-2 px-4 py-2 text-sm cursor-pointer border-r border-border/50 shrink-0 ${
                      activeTab === tab.id ? 'bg-background' : 'bg-muted/30 hover:bg-muted/50'
                    }`}
                    onClick={() => {
                      setActiveTab(tab.id);
                      const file = findFileById(files, tab.id);
                      if (file) {
                        setSelectedFile(file);
                        setCode(tab.content);
                      }
                    }}
                  >
                    <span className={languageColors[getLanguage(tab.name)] || 'text-muted-foreground'}>
                      {tab.name}
                    </span>
                    {tab.modified && <span className="text-xs text-yellow-500">●</span>}
                    <button
                      className="hover:text-destructive ml-1 opacity-0 group-hover:opacity-100"
                      onClick={(e) => closeTab(tab.id, e)}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Monaco Editor */}
              <div className="flex-1 overflow-hidden">
                <CodeEditor
                  file={currentFile || undefined}
                  onChange={(content, fileId) => updateFileContent(fileId, content)}
                  onSave={(content, fileId) => updateFileContent(fileId, content)}
                />
              </div>
            </>
          )}

          {/* API Client Panel */}
          {activePanel === 'api' && (
            <div className="flex-1 flex flex-col p-4 overflow-auto">
              <Card className="p-4 mb-4 border-border/50">
                <h3 className="font-medium mb-3">HTTP Request</h3>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Select value={httpMethod} onValueChange={(v) => v && setHttpMethod(v)}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="PUT">PUT</SelectItem>
                        <SelectItem value="PATCH">PATCH</SelectItem>
                        <SelectItem value="DELETE">DELETE</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="https://api.example.com/endpoint"
                      value={httpUrl}
                      onChange={(e) => setHttpUrl(e.target.value)}
                      className="flex-1"
                    />
                    <Button onClick={handleSendHttp} disabled={isSending} className="gap-1.5">
                      {isSending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                      Send
                    </Button>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Headers (JSON)</label>
                    <Input
                      placeholder='{"Authorization": "Bearer token"}'
                      value={httpHeaders}
                      onChange={(e) => setHttpHeaders(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                  {['POST', 'PUT', 'PATCH'].includes(httpMethod) && (
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Body</label>
                      <Textarea
                        placeholder="Request body (JSON)"
                        value={httpBody}
                        onChange={(e) => setHttpBody(e.target.value)}
                        className="h-24 font-mono text-xs resize-none"
                      />
                    </div>
                  )}
                </div>
              </Card>

              {httpResponse && (
                <Card className="p-4 border-border/50 flex-1">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">Response</h3>
                      <Badge className={
                        httpResponse.status >= 200 && httpResponse.status < 300 
                          ? 'bg-green-500/10 text-green-500' 
                          : 'bg-red-500/10 text-red-500'
                      }>
                        {httpResponse.status} {httpResponse.statusText}
                      </Badge>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={copyResponse}>
                      <Copy className="size-3.5" />
                      Copy
                    </Button>
                  </div>
                  <div className="mb-3">
                    <h4 className="text-xs font-medium text-muted-foreground mb-1">Headers</h4>
                    <div className="bg-muted/50 rounded p-2 font-mono text-xs max-h-32 overflow-auto">
                      {Object.entries(httpResponse.headers).map(([key, value]) => (
                        <div key={key}>
                          <span className="text-blue-500">{key}</span>: {value}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-1">Body</h4>
                    <pre className="p-3 rounded-lg bg-[#0d1117] text-[#c9d1d9] font-mono text-xs overflow-auto max-h-96">
                      {httpResponse.body}
                    </pre>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* Git Panel */}
          {activePanel === 'git' && (
            <div className="flex-1 flex flex-col p-4 overflow-auto">
              <Card className="p-4 mb-4 border-border/50">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <GitBranch className="size-5" />
                    <div>
                      <h3 className="font-medium">osap-project</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">branch:</span>
                        <Input
                          value={gitBranch}
                          onChange={(e) => setGitBranch(e.target.value)}
                          className="h-6 text-xs w-32"
                          placeholder="main"
                        />
                      </div>
                    </div>
                  </div>
                  <Badge className="bg-green-500/10 text-green-500">Synced</Badge>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Commit Message</label>
                    <Textarea
                      placeholder="Enter commit message..."
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      className="h-20 resize-none text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
<Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleGitAction('clone')}>
                      <GitMerge className="size-4" />
                      Clone
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleGitAction('pull')}>
                      <GitPullRequest className="size-4" />
                      Pull
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleGitAction('push')}>
                      <ArrowUp className="size-4" />
                      Push
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleGitAction('pull')}>
                      <GitPullRequest className="size-4" />
                      Pull
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleGitAction('push')}>
                      <ArrowUp className="size-4" />
                      Push
                    </Button>
                  </div>
                </div>
              </Card>

              <Card className="p-4 border-border/50 flex-1">
                <h3 className="font-medium mb-3">Git Log</h3>
                <div className="bg-[#0d1117] rounded-lg p-3 font-mono text-xs h-64 overflow-auto">
                  {gitLog.length > 0 ? (
                    gitLog.map((line, i) => (
                      <div key={i} className="whitespace-pre-wrap">{line}</div>
                    ))
                  ) : (
                    <span className="text-muted-foreground">No git operations yet</span>
                  )}
                </div>
              </Card>

              <Card className="p-4 mt-4 border-border/50">
                <h3 className="font-medium mb-3">Recent Commits</h3>
                <div className="space-y-3">
                  {[
                    { hash: 'a1b2c3d', msg: 'Add memory integration', time: '2 hours ago' },
                    { hash: 'e4f5g6h', msg: 'Fix task execution bug', time: '1 day ago' },
                    { hash: 'i7j8k9l', msg: 'Update dependencies', time: '3 days ago' },
                  ].map((commit) => (
                    <div key={commit.hash} className="flex items-start gap-3">
                      <GitCommit className="size-4 mt-0.5 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{commit.msg}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <code className="font-mono">{commit.hash}</code>
                          <span>•</span>
                          <span>{commit.time}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>

        {/* Terminal - 30% */}
        <div className="w-[30%] min-w-[250px] border-l border-border/50 flex flex-col bg-[#0d1117]">
          <div className="p-2 border-b border-border/50 bg-muted/30 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <TerminalIcon className="size-3.5" />
              Terminal
            </span>
          </div>
          <div
            ref={terminalRef}
            className="flex-1 p-2 overflow-hidden"
          />
        </div>
      </div>
    </div>
  );
}