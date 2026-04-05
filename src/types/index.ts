export interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface MemoryEntry {
  id: string;
  type: 'fact' | 'preference' | 'context' | 'interaction';
  content: string;
  source?: string;
  createdAt: string;
}

export interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  activeIcon?: React.ReactNode;
}

export interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: string;
}

export interface RecentAction {
  id: string;
  title: string;
  description?: string;
  timestamp: string;
  type: 'task' | 'memory' | 'dev' | 'system';
}
