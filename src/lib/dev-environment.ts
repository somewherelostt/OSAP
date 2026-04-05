'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { FileNode } from '@/components/dev/editor';

export interface DevEnvironmentState {
  files: FileNode[];
  currentFile: FileNode | null;
  terminalHistory: string[];
  gitRepos: GitRepoState[];
}

export interface GitRepoState {
  id: string;
  name: string;
  path: string;
  branch: string;
  status: 'synced' | 'ahead' | 'behind' | 'diverged';
  hasChanges: boolean;
  lastCommit: string;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
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
        content: `// Welcome to OSAP Dev Environment
// Start building your project here

export function main() {
  console.log("Hello from OSAP!");
}

main();
`,
        language: 'typescript',
      },
      {
        id: 'utils.ts',
        name: 'utils.ts',
        type: 'file',
        content: `// Utility functions

export function formatDate(date: Date): string {
  return date.toLocaleDateString();
}

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}
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
      scripts: {
        dev: 'ts-node src/index.ts',
        build: 'tsc',
        test: 'jest',
      },
      dependencies: {},
    }, null, 2),
    language: 'json',
  },
  {
    id: 'README.md',
    name: 'README.md',
    type: 'file',
    content: `# My OSAP Project

Built with OSAP Dev Environment.

## Getting Started

1. Edit files in the editor
2. Run commands in the terminal
3. Your changes are automatically saved
`,
    language: 'markdown',
  },
];

export function useDevEnvironment() {
  const [files, setFiles] = useState<FileNode[]>(defaultFiles);
  const [currentFile, setCurrentFile] = useState<FileNode | null>(null);
  const [terminalHistory, setTerminalHistory] = useState<string[]>([]);

  const findFileById = useCallback((id: string, nodes: FileNode[] = files): FileNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findFileById(id, node.children);
        if (found) return found;
      }
    }
    return null;
  }, [files]);

  const updateFileContent = useCallback((id: string, content: string) => {
    const updateNodes = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.id === id) {
          return { ...node, content };
        }
        if (node.children) {
          return { ...node, children: updateNodes(node.children) };
        }
        return node;
      });
    };
    setFiles(prev => updateNodes(prev));
  }, []);

  const createFile = useCallback((parentId: string | null, name: string) => {
    const newFile: FileNode = {
      id: `${Date.now()}`,
      name,
      type: 'file',
      content: '',
      language: name.split('.').pop() || 'text',
    };

    if (!parentId) {
      setFiles(prev => [...prev, newFile]);
      return;
    }

    const addToParent = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.id === parentId && node.type === 'folder') {
          return {
            ...node,
            children: [...(node.children || []), newFile],
          };
        }
        if (node.children) {
          return { ...node, children: addToParent(node.children) };
        }
        return node;
      });
    };

    setFiles(prev => addToParent(prev));
  }, []);

  const deleteFile = useCallback((id: string) => {
    const removeFromNodes = (nodes: FileNode[]): FileNode[] => {
      return nodes
        .filter(node => node.id !== id)
        .map(node => ({
          ...node,
          children: node.children ? removeFromNodes(node.children) : undefined,
        }));
    };
    setFiles(prev => removeFromNodes(prev));
    if (currentFile?.id === id) {
      setCurrentFile(null);
    }
  }, [currentFile]);

  const addToTerminalHistory = useCallback((line: string) => {
    setTerminalHistory(prev => [...prev, line]);
  }, []);

  const selectFile = useCallback((file: FileNode) => {
    if (file.type === 'file') {
      setCurrentFile(file);
    }
  }, []);

  return {
    files,
    currentFile,
    terminalHistory,
    findFileById,
    updateFileContent,
    createFile,
    deleteFile,
    selectFile,
    addToTerminalHistory,
    setFiles,
    setCurrentFile,
  };
}

export interface ApiRequest {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers: Record<string, string>;
  body?: string;
  collection?: string;
}

export interface ApiCollection {
  id: string;
  name: string;
  requests: ApiRequest[];
}

export function useApiCollections() {
  const [collections, setCollections] = useState<ApiCollection[]>([
    {
      id: 'default',
      name: 'OSAP API',
      requests: [
        { id: '1', name: 'List Tasks', method: 'GET', url: '/api/tasks', headers: {}, collection: 'default' },
        { id: '2', name: 'Create Task', method: 'POST', url: '/api/tasks', headers: { 'Content-Type': 'application/json' }, body: '{}', collection: 'default' },
        { id: '3', name: 'Get Memory', method: 'GET', url: '/api/hydra-memory', headers: {}, collection: 'default' },
      ],
    },
  ]);

  const addCollection = (name: string) => {
    setCollections(prev => [...prev, { id: Date.now().toString(), name, requests: [] }]);
  };

  const addRequest = (collectionId: string, request: Omit<ApiRequest, 'id'>) => {
    setCollections(prev => prev.map(c => {
      if (c.id === collectionId) {
        return { ...c, requests: [...c.requests, { ...request, id: Date.now().toString() }] };
      }
      return c;
    }));
  };

  const deleteRequest = (collectionId: string, requestId: string) => {
    setCollections(prev => prev.map(c => {
      if (c.id === collectionId) {
        return { ...c, requests: c.requests.filter(r => r.id !== requestId) };
      }
      return c;
    }));
  };

  return { collections, addCollection, addRequest, deleteRequest };
}
