'use client';

import { useState } from 'react';
import { File, Folder, FolderOpen, ChevronRight, ChevronDown, FileCode, FileText, FileJson, FileImage } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FileNode } from './editor';

interface FileTreeProps {
  files: FileNode[];
  selectedId?: string;
  onSelect: (file: FileNode) => void;
  onCreateFile?: (parentId: string | null, name: string) => void;
  onDeleteFile?: (id: string) => void;
  onRenameFile?: (id: string, name: string) => void;
}

const fileIcons: Record<string, typeof FileCode> = {
  ts: FileCode,
  tsx: FileCode,
  js: FileCode,
  jsx: FileCode,
  py: FileCode,
  rs: FileCode,
  go: FileCode,
  json: FileJson,
  md: FileText,
  txt: FileText,
  png: FileImage,
  jpg: FileImage,
  svg: FileImage,
};

function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return fileIcons[ext] || File;
}

function TreeItem({
  node,
  depth,
  selectedId,
  onSelect,
  onDeleteFile,
  onRenameFile,
}: {
  node: FileNode;
  depth: number;
  selectedId?: string;
  onSelect: (file: FileNode) => void;
  onDeleteFile?: (id: string) => void;
  onRenameFile?: (id: string, name: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(depth < 2);
  const isFolder = node.type === 'folder';
  const Icon = isFolder ? (isOpen ? FolderOpen : Folder) : getFileIcon(node.name);
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer transition-colors ${
          isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (isFolder) {
            setIsOpen(!isOpen);
          } else {
            onSelect(node);
          }
        }}
      >
        {isFolder && (
          <span className="size-4 flex items-center justify-center text-muted-foreground">
            {isOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </span>
        )}
        <Icon className={`size-4 ${isFolder ? 'text-yellow-500' : 'text-muted-foreground'}`} />
        <span className="text-sm truncate flex-1">{node.name}</span>
        {onDeleteFile && !isFolder && (
          <Button
            size="sm"
            variant="ghost"
            className="size-6 p-0 opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteFile(node.id);
            }}
          >
            ×
          </Button>
        )}
      </div>
      {isFolder && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onDeleteFile={onDeleteFile}
              onRenameFile={onRenameFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({
  files,
  selectedId,
  onSelect,
  onDeleteFile,
  onRenameFile,
}: FileTreeProps) {
  return (
    <div className="h-full overflow-auto py-2">
      {files.map((file) => (
        <TreeItem
          key={file.id}
          node={file}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          onDeleteFile={onDeleteFile}
          onRenameFile={onRenameFile}
        />
      ))}
    </div>
  );
}
