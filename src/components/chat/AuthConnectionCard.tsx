'use client';

import { motion } from 'framer-motion';
import { ExternalLink, ShieldCheck, Mail, Link as LinkIcon, MessageSquare, Database } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AuthConnectionCardProps {
  toolkit: string;
  authUrl: string;
  message?: string;
}

export function AuthConnectionCard({ toolkit, authUrl, message }: AuthConnectionCardProps) {
  const getProviderIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('gmail') || n.includes('google')) return <Mail className="size-5 text-red-500" />;
    if (n.includes('github')) return <LinkIcon className="size-5 text-slate-900 dark:text-white" />;
    if (n.includes('slack')) return <MessageSquare className="size-5 text-[#E01E5A]" />;
    if (n.includes('discord')) return <MessageSquare className="size-5 text-[#5865F2]" />;
    return <Database className="size-5 text-blue-500" />;
  };

  const providerName = toolkit.charAt(0).toUpperCase() + toolkit.slice(1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="mt-3 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-primary/5 p-4 shadow-xl backdrop-blur-md"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-inner dark:bg-slate-800">
          {getProviderIcon(toolkit)}
        </div>
        
        <div className="flex-1 space-y-1">
          <h4 className="text-sm font-bold tracking-tight text-foreground">
            Connect {providerName}
          </h4>
          <p className="text-xs leading-relaxed text-muted-foreground/80">
            {message || `Your agent needs permission to access ${providerName} to complete this task.`}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <a
          href={authUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white transition-all hover:bg-slate-800 active:scale-95 dark:bg-primary"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
          Connect {providerName}
          <ExternalLink className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </a>
        
        <div className="flex items-center justify-center gap-1.5 text-[10px] font-medium text-muted-foreground/60">
          <ShieldCheck className="size-3" />
          Securely managed by Composio
        </div>
      </div>
    </motion.div>
  );
}
