import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
export function getHumanReadableToolName(tool: string) {
  if (!tool) return 'Tool';
  const t = tool.toLowerCase();
  if (t.includes('gmail')) {
    if (t.includes('fetch') || t.includes('list') || t.includes('get')) return 'Gmail Fetch';
    if (t.includes('send') || t.includes('draft')) return 'Gmail Send';
    if (t.includes('attachment')) return 'Gmail Attachment';
    return 'Gmail';
  }
  if (t.includes('github')) {
    if (t.includes('repo')) return 'GitHub Fetch';
    if (t.includes('commit') || t.includes('push')) return 'GitHub Commit';
    if (t.includes('pr') || t.includes('pull')) return 'GitHub PR';
    if (t.includes('issue')) return 'GitHub Issue';
    if (t.includes('search')) return 'GitHub Search';
    return 'GitHub';
  }
  if (t.includes('search')) return 'Web Search';
  if (t.includes('memory') || t.includes('hydra')) return 'Memory Logic';
  if (t.includes('slack')) return 'Slack';
  if (t.includes('discord')) return 'Discord';
  if (t.includes('twitter')) return 'Twitter';
  if (t.includes('notion')) return 'Notion';
  return tool.split('_').join(' ');
}

export function cleanDescription(desc: string | undefined, toolName: string) {
  if (!desc || desc.startsWith('Executing') || desc.startsWith('Running')) {
    return `Using ${getHumanReadableToolName(toolName)} to process this step.`;
  }
  return desc;
}
