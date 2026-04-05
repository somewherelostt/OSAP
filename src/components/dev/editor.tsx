'use client';

import { useRef, useCallback, useEffect } from 'react';
import Editor, { OnMount, Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
  language?: string;
  children?: FileNode[];
}

interface CodeEditorProps {
  file?: FileNode;
  files?: FileNode[];
  onChange?: (content: string, fileId: string) => void;
  onSave?: (content: string, fileId: string) => void;
  onFileSelect?: (file: FileNode) => void;
}

const defaultCode = `// Welcome to OSAP Dev Environment
// Start coding here

function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet('Developer'));
`;

const languageMap: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  html: 'html',
  css: 'css',
  json: 'json',
  md: 'markdown',
  sql: 'sql',
  yml: 'yaml',
  yaml: 'yaml',
  sh: 'shell',
  bash: 'shell',
};

function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return languageMap[ext] || 'plaintext';
}

export function CodeEditor({
  file,
  onChange,
  onSave,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const value = editor.getValue();
      if (file && onSave) {
        onSave(value, file.id);
      }
    });

    editor.updateOptions({
      minimap: { enabled: true },
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      lineNumbers: 'on',
      renderLineHighlight: 'all',
      scrollBeyondLastLine: false,
      automaticLayout: false,
      tabSize: 2,
      wordWrap: 'on',
      padding: { top: 16 },
    });

    // Force initial layout
    setTimeout(() => {
      editor.layout();
    }, 100);
  }, [file, onSave]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (editorRef.current) {
        editorRef.current.layout();
      }
    };

    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(() => {
      if (editorRef.current) {
        editorRef.current.layout();
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, []);

  const handleChange = useCallback((value: string | undefined) => {
    if (file && onChange && value !== undefined) {
      onChange(value, file.id);
    }
  }, [file, onChange]);

  const editorContent = file?.content ?? defaultCode;
  const language = file?.language || (file ? getLanguage(file.name) : 'typescript');

  return (
    <div 
      ref={containerRef} 
      className="h-full w-full"
      style={{ minHeight: '400px' }}
    >
      <Editor
        height="100%"
        width="100%"
        language={language}
        value={editorContent}
        onChange={handleChange}
        onMount={handleMount}
        theme="vs-dark"
        options={{
          minimap: { enabled: true },
          fontSize: 13,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          lineNumbers: 'on',
          renderLineHighlight: 'all',
          scrollBeyondLastLine: false,
          automaticLayout: false,
          tabSize: 2,
          wordWrap: 'on',
          padding: { top: 16 },
        }}
        loading={
          <div className="flex items-center justify-center h-full bg-[#1e1e1e] text-muted-foreground">
            Loading editor...
          </div>
        }
      />
    </div>
  );
}

export function DiffEditor({
  original,
  modified,
  language = 'typescript',
  height = '300px',
}: {
  original: string;
  modified: string;
  language?: string;
  height?: string;
}) {
  return (
    <div className="h-full w-full rounded-lg overflow-hidden border border-border/50 flex">
      <div className="flex-1 border-r border-border">
        <div className="px-2 py-1 bg-muted/50 text-xs text-muted-foreground border-b border-border">Original</div>
        <Editor
          height={height}
          language={language}
          value={original}
          theme="vs-dark"
          options={{
            readOnly: true,
            fontSize: 13,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          }}
        />
      </div>
      <div className="flex-1">
        <div className="px-2 py-1 bg-muted/50 text-xs text-muted-foreground border-b border-border">Modified</div>
        <Editor
          height={height}
          language={language}
          value={modified}
          theme="vs-dark"
          options={{
            readOnly: true,
            fontSize: 13,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          }}
        />
      </div>
    </div>
  );
}
