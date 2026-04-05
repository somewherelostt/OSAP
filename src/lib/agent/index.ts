'use client';

export * from './orchestrator';
export * from './self-correction';
export * from './background-tasks';
export * from './triggers';
export * from './memory-feedback';

import { AgentOrchestrator, getAgentOrchestrator } from './orchestrator';
import { SelfCorrectionEngine, getSelfCorrectionEngine } from './self-correction';
import { BackgroundTaskManager, getBackgroundTaskManager } from './background-tasks';
import { TriggerSystem, getTriggerSystem } from './triggers';
import { MemoryFeedbackLoop, getMemoryFeedbackLoop } from './memory-feedback';

export interface AgentSystem {
  orchestrator: AgentOrchestrator;
  selfCorrection: SelfCorrectionEngine;
  backgroundTasks: BackgroundTaskManager;
  triggers: TriggerSystem;
  feedbackLoop: MemoryFeedbackLoop;
}

export interface AgentSystemOptions {
  orchestrator?: ConstructorParameters<typeof AgentOrchestrator>[0];
  selfCorrection?: ConstructorParameters<typeof SelfCorrectionEngine>[0];
  feedbackLoop?: ConstructorParameters<typeof MemoryFeedbackLoop>[0];
}

let systemInstance: AgentSystem | null = null;

export function getAgentSystem(): AgentSystem {
  if (!systemInstance) {
    systemInstance = {
      orchestrator: getAgentOrchestrator(),
      selfCorrection: getSelfCorrectionEngine(),
      backgroundTasks: getBackgroundTaskManager(),
      triggers: getTriggerSystem(),
      feedbackLoop: getMemoryFeedbackLoop(),
    };
  }
  return systemInstance;
}

export function initializeAgentSystem(options?: AgentSystemOptions): AgentSystem {
  resetAgentSystem();

  const orchestrator = new AgentOrchestrator(options?.orchestrator);
  const selfCorrection = new SelfCorrectionEngine(options?.selfCorrection);
  const backgroundTasks = new BackgroundTaskManager();
  const triggers = new TriggerSystem();
  const feedbackLoop = new MemoryFeedbackLoop(options?.feedbackLoop);

  systemInstance = {
    orchestrator,
    selfCorrection,
    backgroundTasks,
    triggers,
    feedbackLoop,
  };

  return systemInstance;
}

export function resetAgentSystem(): void {
  if (systemInstance) {
    systemInstance.backgroundTasks.destroy();
    systemInstance.triggers.destroy();
  }
  systemInstance = null;
}

export { AgentOrchestrator, getAgentOrchestrator };
export { SelfCorrectionEngine, getSelfCorrectionEngine };
export { BackgroundTaskManager, getBackgroundTaskManager };
export { TriggerSystem, getTriggerSystem };
export { MemoryFeedbackLoop, getMemoryFeedbackLoop };
