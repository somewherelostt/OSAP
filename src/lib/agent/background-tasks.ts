export type BackgroundTaskStatus = 
  | 'pending'
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type BackgroundTaskPriority = 'low' | 'normal' | 'high' | 'critical';

export interface BackgroundTask {
  id: string;
  name: string;
  description?: string;
  status: BackgroundTaskStatus;
  priority: BackgroundTaskPriority;
  progress: number;
  progressMessage?: string;
  
  agentId?: string;
  parentTaskId?: string;
  childTaskIds: string[];
  
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
  
  createdAt: string;
  startedAt?: string;
  pausedAt?: string;
  completedAt?: string;
  nextRetryAt?: string;
  
  retryCount: number;
  maxRetries: number;
  
  metadata: Record<string, unknown>;
  
  onProgress?: (progress: number, message?: string) => void;
  onComplete?: (output: unknown) => void;
  onError?: (error: string) => void;
}

export interface TaskQueue {
  id: string;
  name: string;
  concurrency: number;
  tasks: BackgroundTask[];
  running: string[];
  completed: string[];
  failed: string[];
}

export interface BackgroundTaskOptions {
  id?: string;
  name: string;
  description?: string;
  priority?: BackgroundTaskPriority;
  maxRetries?: number;
  agentId?: string;
  metadata?: Record<string, unknown>;
  onProgress?: (progress: number, message?: string) => void;
  onComplete?: (output: unknown) => void;
  onError?: (error: string) => void;
}

function generateId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export class BackgroundTaskManager {
  private tasks: Map<string, BackgroundTask> = new Map();
  private queues: Map<string, TaskQueue> = new Map();
  private isProcessing = false;
  private processingInterval: ReturnType<typeof setInterval> | null = null;
  private eventListeners: Map<string, Set<(task: BackgroundTask) => void>> = new Map();

  private defaultQueueId = 'default';
  private maxConcurrency = 5;

  constructor() {
    this.initializeDefaultQueue();
    this.startProcessing();
  }

  private initializeDefaultQueue(): void {
    this.queues.set(this.defaultQueueId, {
      id: this.defaultQueueId,
      name: 'Default Queue',
      concurrency: this.maxConcurrency,
      tasks: [],
      running: [],
      completed: [],
      failed: [],
    });
  }

  private startProcessing(): void {
    if (this.processingInterval) return;
    
    this.processingInterval = setInterval(() => {
      this.processNext();
    }, 1000);
  }

  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  createTask(options: BackgroundTaskOptions): BackgroundTask {
    const task: BackgroundTask = {
      id: options.id || generateId(),
      name: options.name,
      description: options.description,
      status: 'pending',
      priority: options.priority || 'normal',
      progress: 0,
      
      agentId: options.agentId,
      parentTaskId: undefined,
      childTaskIds: [],
      
      input: {},
      output: undefined,
      error: undefined,
      
      createdAt: new Date().toISOString(),
      retryCount: 0,
      maxRetries: options.maxRetries ?? 3,
      
      metadata: options.metadata || {},
      
      onProgress: options.onProgress,
      onComplete: options.onComplete,
      onError: options.onError,
    };

    this.tasks.set(task.id, task);
    this.emit('task:created', task);
    
    return task;
  }

  async execute(
    taskId: string,
    executor: (task: BackgroundTask, update: (progress: number, message?: string) => void) => Promise<unknown>
  ): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    if (task.status === 'cancelled' || task.status === 'completed') {
      return;
    }

    task.status = 'running';
    task.startedAt = new Date().toISOString();
    this.emit('task:started', task);

    const update = (progress: number, message?: string) => {
      task.progress = progress;
      task.progressMessage = message;
      task.onProgress?.(progress, message);
      this.emit('task:progress', task);
    };

    try {
      const result = await executor(task, update);
      task.output = result;
      task.status = 'completed';
      task.progress = 100;
      task.completedAt = new Date().toISOString();
      task.onComplete?.(result);
      this.emit('task:completed', task);
    } catch (error) {
      task.error = error instanceof Error ? error.message : 'Unknown error';
      
      if (task.retryCount < task.maxRetries) {
        task.retryCount++;
        task.status = 'pending';
        task.nextRetryAt = new Date(Date.now() + Math.pow(2, task.retryCount) * 1000).toISOString();
        this.emit('task:retrying', task);
      } else {
        task.status = 'failed';
        task.completedAt = new Date().toISOString();
        task.onError?.(task.error);
        this.emit('task:failed', task);
      }
    }
  }

  private processNext(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const queue = this.queues.get(this.defaultQueueId);
      if (!queue) return;

      const runningCount = queue.running.length;
      if (runningCount >= queue.concurrency) return;

      const pendingTasks = queue.tasks
        .filter(t => t.status === 'pending')
        .sort((a, b) => {
          const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        });

      const availableSlots = queue.concurrency - runningCount;
      const tasksToStart = pendingTasks.slice(0, availableSlots);

      for (const task of tasksToStart) {
        this.startTask(task.id);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async startTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'pending') return;

    const queue = this.queues.get(this.defaultQueueId);
    if (queue) {
      queue.running.push(taskId);
    }

    task.status = 'queued';
    this.emit('task:queued', task);
  }

  pause(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'running') return false;

    task.status = 'paused';
    task.pausedAt = new Date().toISOString();
    this.emit('task:paused', task);
    return true;
  }

  resume(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'paused') return false;

    task.status = 'pending';
    task.pausedAt = undefined;
    this.emit('task:resumed', task);
    return true;
  }

  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.status === 'completed' || task.status === 'failed') {
      return false;
    }

    task.status = 'cancelled';
    task.completedAt = new Date().toISOString();
    
    const queue = this.queues.get(this.defaultQueueId);
    if (queue) {
      queue.running = queue.running.filter(id => id !== taskId);
      queue.failed.push(taskId);
    }

    this.emit('task:cancelled', task);
    return true;
  }

  getTask(taskId: string): BackgroundTask | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values());
  }

  getTasksByStatus(status: BackgroundTaskStatus): BackgroundTask[] {
    return this.getAllTasks().filter(t => t.status === status);
  }

  getTasksByAgent(agentId: string): BackgroundTask[] {
    return this.getAllTasks().filter(t => t.agentId === agentId);
  }

  getRunningTasks(): BackgroundTask[] {
    return this.getTasksByStatus('running');
  }

  getPendingTasks(): BackgroundTask[] {
    return this.getTasksByStatus('pending');
  }

  deleteTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.status === 'running') {
      return false;
    }

    const queue = this.queues.get(this.defaultQueueId);
    if (queue) {
      queue.tasks = queue.tasks.filter(t => t.id !== taskId);
      queue.completed = queue.completed.filter(id => id !== taskId);
      queue.failed = queue.failed.filter(id => id !== taskId);
    }

    return this.tasks.delete(taskId);
  }

  clearCompleted(): void {
    const completedTasks = this.getTasksByStatus('completed');
    completedTasks.forEach(t => this.tasks.delete(t.id));
    
    const queue = this.queues.get(this.defaultQueueId);
    if (queue) {
      queue.completed = [];
    }
  }

  on(event: string, callback: (task: BackgroundTask) => void): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
    
    return () => {
      this.eventListeners.get(event)?.delete(callback);
    };
  }

  private emit(event: string, task: BackgroundTask): void {
    this.eventListeners.get(event)?.forEach(callback => {
      try {
        callback(task);
      } catch (error) {
        console.error(`[BackgroundTaskManager] Event listener error for ${event}:`, error);
      }
    });

    this.eventListeners.get('*')?.forEach(callback => {
      try {
        callback(task);
      } catch (error) {
        console.error(`[BackgroundTaskManager] Wildcard event listener error:`, error);
      }
    });
  }

  getMetrics(): {
    total: number;
    running: number;
    pending: number;
    completed: number;
    failed: number;
    paused: number;
  } {
    const tasks = this.getAllTasks();
    return {
      total: tasks.length,
      running: tasks.filter(t => t.status === 'running').length,
      pending: tasks.filter(t => t.status === 'pending').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      paused: tasks.filter(t => t.status === 'paused').length,
    };
  }

  setConcurrency(concurrency: number): void {
    this.maxConcurrency = Math.max(1, Math.min(concurrency, 10));
    const queue = this.queues.get(this.defaultQueueId);
    if (queue) {
      queue.concurrency = this.maxConcurrency;
    }
  }

  destroy(): void {
    this.stopProcessing();
    this.tasks.clear();
    this.queues.clear();
    this.eventListeners.clear();
  }
}

let managerInstance: BackgroundTaskManager | null = null;

export function getBackgroundTaskManager(): BackgroundTaskManager {
  if (!managerInstance) {
    managerInstance = new BackgroundTaskManager();
  }
  return managerInstance;
}

export function resetBackgroundTaskManager(): void {
  if (managerInstance) {
    managerInstance.destroy();
  }
  managerInstance = null;
}
