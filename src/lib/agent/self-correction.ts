'use client';

import type { AgentStep, Correction, AgentMemory } from './orchestrator';

export type CorrectionStrategy = 
  | 'retry_immediate'
  | 'retry_exponential'
  | 'retry_alternate'
  | 'replan'
  | 'simplify'
  | 'decompose'
  | 'escalate'
  | 'abort';

export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
}

export interface CorrectionRule {
  errorPattern: RegExp;
  strategy: CorrectionStrategy;
  maxAttempts?: number;
  alternativeApproaches?: string[];
}

const defaultRetryPolicy: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.2,
};

const defaultCorrectionRules: CorrectionRule[] = [
  {
    errorPattern: /timeout|timed?out/i,
    strategy: 'retry_exponential',
    alternativeApproaches: ['Use cached data if available', 'Break into smaller steps', 'Increase timeout'],
  },
  {
    errorPattern: /rate.?limit|too.?many.?requests|429/i,
    strategy: 'retry_exponential',
    maxAttempts: 5,
    alternativeApproaches: ['Wait before retry', 'Batch requests', 'Use alternative endpoint'],
  },
  {
    errorPattern: /unauthorized|401|authentication/i,
    strategy: 'escalate',
    alternativeApproaches: ['Refresh credentials', 'Re-authenticate user'],
  },
  {
    errorPattern: /forbidden|403|permission/i,
    strategy: 'escalate',
    alternativeApproaches: ['Request permissions', 'Use alternative action'],
  },
  {
    errorPattern: /not.?found|404|does.?not.?exist/i,
    strategy: 'replan',
    alternativeApproaches: ['Search for alternatives', 'Create the resource', 'Skip this step'],
  },
  {
    errorPattern: /invalid|malformed|bad.?request|400/i,
    strategy: 'simplify',
    alternativeApproaches: ['Validate input', 'Use defaults', 'Request clarification'],
  },
  {
    errorPattern: /server.?error|500|503|502/i,
    strategy: 'retry_immediate',
    alternativeApproaches: ['Wait and retry', 'Try alternative service', 'Report to user'],
  },
  {
    errorPattern: /network|dns|connection/i,
    strategy: 'retry_exponential',
    alternativeApproaches: ['Check connection', 'Use offline mode', 'Retry later'],
  },
  {
    errorPattern: /parse|decode|json/i,
    strategy: 'simplify',
    alternativeApproaches: ['Request raw data', 'Try different format', 'Skip parsing'],
  },
];

export interface SelfCorrectionConfig {
  enabled: boolean;
  retryPolicy: RetryPolicy;
  rules: CorrectionRule[];
  learnFromMistakes: boolean;
  maxCorrectionsPerStep: number;
}

const defaultConfig: SelfCorrectionConfig = {
  enabled: true,
  retryPolicy: defaultRetryPolicy,
  rules: defaultCorrectionRules,
  learnFromMistakes: true,
  maxCorrectionsPerStep: 5,
};

export class SelfCorrectionEngine {
  private config: SelfCorrectionConfig;
  private corrections: Map<string, Correction[]> = new Map();
  private learnedRules: CorrectionRule[] = [];

  constructor(config: Partial<SelfCorrectionConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  async correct(
    step: AgentStep,
    error: string,
    context?: {
      previousAttempts?: AgentStep[];
      userContext?: Record<string, unknown>;
      memories?: AgentMemory[];
    }
  ): Promise<Correction> {
    const stepKey = `${step.id}_corrections`;
    const stepCorrections = this.corrections.get(stepKey) || [];
    
    if (stepCorrections.length >= this.config.maxCorrectionsPerStep) {
      return {
        type: 'abort',
        reason: `Maximum corrections (${this.config.maxCorrectionsPerStep}) exceeded for step`,
        originalStep: step.action,
        success: false,
      };
    }

    const matchedRule = this.findMatchingRule(error);
    const correction = this.determineCorrection(step, error, matchedRule, context);

    stepCorrections.push(correction);
    this.corrections.set(stepKey, stepCorrections);

    if (matchedRule && this.config.learnFromMistakes) {
      this.learnFromCorrection(correction, error);
    }

    return correction;
  }

  private findMatchingRule(error: string): CorrectionRule | undefined {
    for (const rule of [...this.config.rules, ...this.learnedRules]) {
      if (rule.errorPattern.test(error)) {
        return rule;
      }
    }
    return undefined;
  }

  private determineCorrection(
    step: AgentStep,
    error: string,
    rule: CorrectionRule | undefined,
    context?: {
      previousAttempts?: AgentStep[];
      userContext?: Record<string, unknown>;
      memories?: AgentMemory[];
    }
  ): Correction {
    if (!rule) {
      return this.defaultCorrection(step);
    }

    switch (rule.strategy) {
      case 'retry_immediate':
        return this.createRetryCorrection(step, 'immediate', rule);
      
      case 'retry_exponential':
        return this.createRetryCorrection(step, 'exponential', rule);
      
      case 'retry_alternate':
        return this.createRetryCorrection(step, 'alternate', rule);
      
      case 'replan':
        return {
          type: 'replan',
          reason: `Replanning due to: ${error}`,
          originalStep: step.action,
          newApproach: rule.alternativeApproaches?.[0] || 'Generate new approach',
          success: true,
        };
      
      case 'simplify':
        return {
          type: 'replan',
          reason: `Simplifying approach due to: ${error}`,
          originalStep: step.action,
          newApproach: rule.alternativeApproaches?.[0] || 'Reduce complexity',
          success: true,
        };
      
      case 'decompose':
        return {
          type: 'replan',
          reason: `Breaking into smaller steps due to: ${error}`,
          originalStep: step.action,
          newApproach: 'Decompose into multiple simpler steps',
          success: true,
        };
      
      case 'escalate':
        return {
          type: 'escalate',
          reason: `Escalating due to: ${error}`,
          originalStep: step.action,
          success: false,
        };
      
      case 'abort':
      default:
        return {
          type: 'abort',
          reason: `Aborting due to: ${error}`,
          originalStep: step.action,
          success: false,
        };
    }
  }

  private createRetryCorrection(
    step: AgentStep,
    retryType: 'immediate' | 'exponential' | 'alternate',
    rule: CorrectionRule
  ): Correction {
    const delay = retryType === 'immediate' 
      ? this.config.retryPolicy.baseDelayMs
      : this.calculateExponentialDelay(step.retryCount);

    return {
      type: 'retry',
      reason: `Retrying ${retryType} after ${delay}ms (attempt ${step.retryCount + 1}/${this.config.retryPolicy.maxRetries}): ${rule.alternativeApproaches?.[0] || 'Previous approach failed'}`,
      originalStep: step.action,
      newApproach: retryType === 'alternate' && rule.alternativeApproaches
        ? rule.alternativeApproaches[step.retryCount % rule.alternativeApproaches.length]
        : step.action,
      success: true,
    };
  }

  private calculateExponentialDelay(retryCount: number): number {
    const { baseDelayMs, maxDelayMs, backoffMultiplier, jitterFactor } = this.config.retryPolicy;
    
    let delay = baseDelayMs * Math.pow(backoffMultiplier, retryCount);
    delay = Math.min(delay, maxDelayMs);
    
    const jitter = delay * jitterFactor * (Math.random() * 2 - 1);
    delay += jitter;
    
    return Math.floor(delay);
  }

  private defaultCorrection(step: AgentStep): Correction {
    if (step.retryCount < this.config.retryPolicy.maxRetries) {
      return {
        type: 'retry',
        reason: `Retrying step after minor error (attempt ${step.retryCount + 1})`,
        originalStep: step.action,
        success: true,
      };
    }

    return {
      type: 'abort',
      reason: 'Max retries exceeded with unknown error type',
      originalStep: step.action,
      success: false,
    };
  }

  private learnFromCorrection(correction: Correction, error: string): void {
    if (correction.success && correction.newApproach) {
      const existingIndex = this.learnedRules.findIndex(
        r => r.errorPattern.source === new RegExp(error, 'i').source
      );

      if (existingIndex < 0) {
        this.learnedRules.push({
          errorPattern: new RegExp(error.substring(0, Math.min(50, error.length)), 'i'),
          strategy: correction.type === 'retry' ? 'retry_alternate' : 'replan',
          alternativeApproaches: [correction.newApproach],
        });
      }
    }
  }

  shouldRetry(step: AgentStep): boolean {
    return step.retryCount < step.maxRetries;
  }

  getRetryDelay(step: AgentStep): number {
    return this.calculateExponentialDelay(step.retryCount);
  }

  recordSuccess(stepId: string): void {
    const corrections = this.corrections.get(`${stepId}_corrections`);
    if (corrections) {
      corrections.forEach(c => {
        if (c.success) {
          c.success = true;
        }
      });
    }
  }

  getCorrectionHistory(stepId: string): Correction[] {
    return this.corrections.get(`${stepId}_corrections`) || [];
  }

  clearHistory(stepId?: string): void {
    if (stepId) {
      this.corrections.delete(`${stepId}_corrections`);
    } else {
      this.corrections.clear();
    }
  }

  updateConfig(config: Partial<SelfCorrectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): SelfCorrectionConfig {
    return { ...this.config };
  }

  addRule(rule: CorrectionRule): void {
    this.config.rules.push(rule);
  }

  removeRule(errorPattern: string): void {
    this.config.rules = this.config.rules.filter(
      r => r.errorPattern.source !== errorPattern
    );
  }

  getLearnedRules(): CorrectionRule[] {
    return [...this.learnedRules];
  }
}

let engineInstance: SelfCorrectionEngine | null = null;

export function getSelfCorrectionEngine(): SelfCorrectionEngine {
  if (!engineInstance) {
    engineInstance = new SelfCorrectionEngine();
  }
  return engineInstance;
}

export function resetSelfCorrectionEngine(): void {
  engineInstance = null;
}
