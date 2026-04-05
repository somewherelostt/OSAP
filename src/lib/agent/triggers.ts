'use client';

export type TriggerType = 'time' | 'event' | 'interval' | 'cron';
export type TriggerStatus = 'active' | 'paused' | 'disabled' | 'error';

export interface TimeTrigger {
  type: 'time';
  at: string;
}

export interface IntervalTrigger {
  type: 'interval';
  everyMs: number;
}

export interface CronTrigger {
  type: 'cron';
  expression: string;
  timezone?: string;
}

export interface EventTrigger {
  type: 'event';
  eventName: string;
  condition?: Record<string, unknown>;
}

export type Trigger = TimeTrigger | IntervalTrigger | CronTrigger | EventTrigger;

export interface TriggerConfig {
  id: string;
  name: string;
  description?: string;
  trigger: Trigger;
  action: TriggerAction;
  status: TriggerStatus;
  lastFired?: string;
  nextFire?: string;
  fireCount: number;
  maxFires?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TriggerAction {
  type: 'task' | 'agent' | 'webhook' | 'notification';
  config: {
    taskId?: string;
    agentId?: string;
    webhookUrl?: string;
    webhookMethod?: 'GET' | 'POST' | 'PUT';
    webhookHeaders?: Record<string, string>;
    message?: string;
    [key: string]: unknown;
  };
}

export interface TriggerEvent {
  name: string;
  data: Record<string, unknown>;
  timestamp: string;
}

function generateId(): string {
  return `trigger_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function parseCronExpression(expression: string): { interval: number; description: string } {
  const parts = expression.split(' ');
  if (parts.length === 5) {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    
    if (minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return { interval: 60000, description: 'Every minute' };
    }
    
    if (minute !== '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return { interval: parseInt(minute) * 60000, description: `Every ${minute} minutes` };
    }
    
    if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return { interval: 3600000, description: `At ${hour}:${minute.padStart(2, '0')}` };
    }
  }
  
  return { interval: 60000, description: 'Every minute (default)' };
}

export class TriggerSystem {
  private triggers: Map<string, TriggerConfig> = new Map();
  private eventListeners: Map<string, Set<(event: TriggerEvent) => void>> = new Map();
  private intervalIds: Map<string, ReturnType<typeof setInterval>> = new Map();
  private timeoutIds: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private onTrigger?: (trigger: TriggerConfig, event?: TriggerEvent) => void;
  private onError?: (triggerId: string, error: string) => void;
  private isProcessing = false;

  constructor(options?: {
    onTrigger?: (trigger: TriggerConfig, event?: TriggerEvent) => void;
    onError?: (triggerId: string, error: string) => void;
  }) {
    this.onTrigger = options?.onTrigger;
    this.onError = options?.onError;
  }

  createTrigger(config: Omit<TriggerConfig, 'id' | 'fireCount' | 'createdAt' | 'updatedAt'> & { id?: string }): TriggerConfig {
    const trigger: TriggerConfig = {
      ...config,
      id: (config as { id?: string }).id || generateId(),
      fireCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.triggers.set(trigger.id, trigger);
    
    if (trigger.status === 'active') {
      this.activateTrigger(trigger);
    }

    return trigger;
  }

  private activateTrigger(trigger: TriggerConfig): void {
    this.deactivateTrigger(trigger.id);

    switch (trigger.trigger.type) {
      case 'time':
        this.scheduleTimeTrigger(trigger);
        break;
      
      case 'interval':
        this.startIntervalTrigger(trigger);
        break;
      
      case 'cron':
        this.startCronTrigger(trigger);
        break;
      
      case 'event':
        break;
    }
  }

  private deactivateTrigger(triggerId: string): void {
    const intervalId = this.intervalIds.get(triggerId);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervalIds.delete(triggerId);
    }

    const timeoutId = this.timeoutIds.get(triggerId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.timeoutIds.delete(triggerId);
    }
  }

  private scheduleTimeTrigger(trigger: TriggerConfig): void {
    const triggerTime = new Date((trigger.trigger as TimeTrigger).at).getTime();
    const now = Date.now();
    const delay = Math.max(0, triggerTime - now);

    if (delay > 0) {
      const timeoutId = setTimeout(() => {
        this.fireTrigger(trigger.id);
      }, delay);
      this.timeoutIds.set(trigger.id, timeoutId);
      
      trigger.nextFire = (trigger.trigger as TimeTrigger).at;
    } else {
      trigger.status = 'disabled';
      trigger.error = 'Scheduled time is in the past';
    }
  }

  private startIntervalTrigger(trigger: TriggerConfig): void {
    const intervalMs = (trigger.trigger as IntervalTrigger).everyMs;
    
    const intervalId = setInterval(() => {
      this.fireTrigger(trigger.id);
    }, intervalMs);
    
    this.intervalIds.set(trigger.id, intervalId);
    trigger.nextFire = new Date(Date.now() + intervalMs).toISOString();
  }

  private startCronTrigger(trigger: TriggerConfig): void {
    const { interval } = parseCronExpression((trigger.trigger as CronTrigger).expression);
    
    const intervalId = setInterval(() => {
      this.fireTrigger(trigger.id);
    }, interval);
    
    this.intervalIds.set(trigger.id, intervalId);
    trigger.nextFire = new Date(Date.now() + interval).toISOString();
  }

  private async fireTrigger(triggerId: string, event?: TriggerEvent): Promise<void> {
    const trigger = this.triggers.get(triggerId);
    if (!trigger || trigger.status !== 'active') return;

    try {
      await this.executeAction(trigger, event);
      
      trigger.lastFired = new Date().toISOString();
      trigger.fireCount++;
      trigger.updatedAt = new Date().toISOString();
      trigger.error = undefined;

      if (trigger.maxFires && trigger.fireCount >= trigger.maxFires) {
        trigger.status = 'disabled';
        this.deactivateTrigger(triggerId);
      } else if (trigger.trigger.type === 'time') {
        trigger.status = 'disabled';
        this.deactivateTrigger(triggerId);
      } else if (trigger.trigger.type === 'interval') {
        const intervalMs = (trigger.trigger as IntervalTrigger).everyMs;
        trigger.nextFire = new Date(Date.now() + intervalMs).toISOString();
      } else if (trigger.trigger.type === 'cron') {
        const { interval } = parseCronExpression((trigger.trigger as CronTrigger).expression);
        trigger.nextFire = new Date(Date.now() + interval).toISOString();
      }

      this.onTrigger?.(trigger, event);
    } catch (error) {
      trigger.error = error instanceof Error ? error.message : 'Trigger execution failed';
      trigger.updatedAt = new Date().toISOString();
      this.onError?.(triggerId, trigger.error);
    }
  }

  private async executeAction(trigger: TriggerConfig, event?: TriggerEvent): Promise<void> {
    const { action } = trigger;

    switch (action.type) {
      case 'task':
        await this.executeTaskAction(action.config, event);
        break;
      
      case 'agent':
        await this.executeAgentAction(action.config, event);
        break;
      
      case 'webhook':
        await this.executeWebhookAction(action.config, event);
        break;
      
      case 'notification':
        console.log('[TriggerSystem] Notification:', action.config.message);
        break;
    }
  }

  private async executeTaskAction(config: TriggerAction['config'], event?: TriggerEvent): Promise<void> {
    const taskId = config.taskId as string;
    if (!taskId) throw new Error('No task ID specified');
    
    const { getBackgroundTaskManager } = await import('./background-tasks');
    const manager = getBackgroundTaskManager();
    
    const task = manager.getTask(taskId);
    if (task && task.status === 'paused') {
      manager.resume(taskId);
    }
    
    console.log('[TriggerSystem] Executing task:', taskId, event?.data);
  }

  private async executeAgentAction(config: TriggerAction['config'], event?: TriggerEvent): Promise<void> {
    const agentId = config.agentId as string;
    if (!agentId) throw new Error('No agent ID specified');
    
    console.log('[TriggerSystem] Executing agent:', agentId, event?.data);
  }

  private async executeWebhookAction(config: TriggerAction['config'], event?: TriggerEvent): Promise<void> {
    const url = config.webhookUrl as string;
    if (!url) throw new Error('No webhook URL specified');
    
    const method = (config.webhookMethod as string) || 'POST';
    const headers = (config.webhookHeaders as Record<string, string>) || {};
    
    await fetch(url, {
      method: method as RequestInit['method'],
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
      }),
    });
  }

  emitEvent(name: string, data: Record<string, unknown> = {}): void {
    const event: TriggerEvent = {
      name,
      data,
      timestamp: new Date().toISOString(),
    };

    this.eventListeners.get(name)?.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error(`[TriggerSystem] Event listener error for ${name}:`, error);
      }
    });

    const matchingTriggers = Array.from(this.triggers.values()).filter(
      t => t.trigger.type === 'event' && (t.trigger as EventTrigger).eventName === name
    );

    for (const trigger of matchingTriggers) {
      const eventTrigger = trigger.trigger as EventTrigger;
      const condition = eventTrigger.condition;
      
      if (condition) {
        const matches = Object.entries(condition).every(
          ([key, value]) => event.data[key] === value
        );
        if (!matches) continue;
      }

      this.fireTrigger(trigger.id, event);
    }
  }

  onEvent(eventName: string, callback: (event: TriggerEvent) => void): () => void {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }
    this.eventListeners.get(eventName)!.add(callback);
    
    return () => {
      this.eventListeners.get(eventName)?.delete(callback);
    };
  }

  getTrigger(id: string): TriggerConfig | undefined {
    return this.triggers.get(id);
  }

  getAllTriggers(): TriggerConfig[] {
    return Array.from(this.triggers.values());
  }

  getActiveTriggers(): TriggerConfig[] {
    return this.getAllTriggers().filter(t => t.status === 'active');
  }

  updateTrigger(id: string, updates: Partial<TriggerConfig>): boolean {
    const trigger = this.triggers.get(id);
    if (!trigger) return false;

    Object.assign(trigger, updates, { updatedAt: new Date().toISOString() });
    
    if (updates.status !== undefined && updates.status !== trigger.status) {
      if (updates.status === 'active') {
        this.activateTrigger(trigger);
      } else {
        this.deactivateTrigger(id);
      }
    }

    return true;
  }

  deleteTrigger(id: string): boolean {
    this.deactivateTrigger(id);
    return this.triggers.delete(id);
  }

  pauseTrigger(id: string): boolean {
    const trigger = this.triggers.get(id);
    if (!trigger || trigger.status !== 'active') return false;

    trigger.status = 'paused';
    trigger.updatedAt = new Date().toISOString();
    this.deactivateTrigger(id);
    return true;
  }

  resumeTrigger(id: string): boolean {
    const trigger = this.triggers.get(id);
    if (!trigger || trigger.status !== 'paused') return false;

    trigger.status = 'active';
    trigger.updatedAt = new Date().toISOString();
    this.activateTrigger(trigger);
    return true;
  }

  pauseAll(): void {
    this.getActiveTriggers().forEach(t => this.pauseTrigger(t.id));
  }

  resumeAll(): void {
    this.getAllTriggers()
      .filter(t => t.status === 'paused')
      .forEach(t => this.resumeTrigger(t.id));
  }

  testTrigger(id: string): boolean {
    const trigger = this.triggers.get(id);
    if (!trigger) return false;

    this.fireTrigger(id);
    return true;
  }

  getMetrics(): {
    total: number;
    active: number;
    paused: number;
    disabled: number;
    totalFires: number;
  } {
    const triggers = this.getAllTriggers();
    return {
      total: triggers.length,
      active: triggers.filter(t => t.status === 'active').length,
      paused: triggers.filter(t => t.status === 'paused').length,
      disabled: triggers.filter(t => t.status === 'disabled').length,
      totalFires: triggers.reduce((sum, t) => sum + t.fireCount, 0),
    };
  }

  destroy(): void {
    this.intervalIds.forEach(id => clearInterval(id));
    this.timeoutIds.forEach(id => clearTimeout(id));
    this.intervalIds.clear();
    this.timeoutIds.clear();
    this.triggers.clear();
    this.eventListeners.clear();
  }
}

let triggerSystemInstance: TriggerSystem | null = null;

export function getTriggerSystem(): TriggerSystem {
  if (!triggerSystemInstance) {
    triggerSystemInstance = new TriggerSystem();
  }
  return triggerSystemInstance;
}

export function resetTriggerSystem(): void {
  if (triggerSystemInstance) {
    triggerSystemInstance.destroy();
  }
  triggerSystemInstance = null;
}

export { TriggerSystem as default };
