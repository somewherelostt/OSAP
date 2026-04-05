"use client";

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CommandInput } from '@/components/command-input';
import Link from 'next/link';

function FeatureCard({
  title,
  description,
  isActive,
  progress,
  onClick,
}: {
  title: string;
  description: string;
  isActive: boolean;
  progress: number;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        'w-full px-6 py-5 flex flex-col justify-start items-start gap-2 cursor-pointer transition-all duration-300',
        isActive
          ? 'bg-card border border-primary/20 shadow-lg shadow-primary/5'
          : 'bg-transparent border-y md:border border-transparent md:border-border/50 hover:bg-card/50'
      )}
      onClick={onClick}
    >
      {isActive && (
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary/0 via-primary to-primary/0">
          <div
            className="h-full bg-primary transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="text-lg font-semibold text-foreground">
        {title}
      </div>
      <div className="text-sm text-muted-foreground leading-relaxed">
        {description}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [activeCard, setActiveCard] = useState(0);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    const progressInterval = setInterval(() => {
      if (!mountedRef.current) return;
      setProgress((prev) => {
        if (prev >= 100) {
          if (mountedRef.current) {
            setActiveCard((current) => (current + 1) % 3);
          }
          return 0;
        }
        return prev + 2;
      });
    }, 100);

    return () => {
      clearInterval(progressInterval);
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleCardClick = (index: number) => {
    if (!mountedRef.current) return;
    setActiveCard(index);
    setProgress(0);
  };

  const features = [
    {
      title: 'Persistent Memory',
      description: 'Your agent remembers everything — your preferences, context, and history across all tasks and apps.',
    },
    {
      title: 'Cross-App Execution',
      description: 'Execute tasks seamlessly across different applications. Your agent works where you work.',
    },
    {
      title: 'Developer-First',
      description: 'Built for developers who want programmable agents with full control over their workflow.',
    },
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />
      
      <div className="relative z-10 flex flex-col justify-start items-center min-h-screen">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Navigation */}
          <div className="w-full h-20 flex justify-center items-center relative">
            <div className="absolute inset-x-0 top-1/2 h-px bg-border/50" />
            <div className="relative z-10 flex items-center justify-between w-full max-w-2xl px-6 py-3 bg-background/80 backdrop-blur-xl rounded-full border border-border/50 shadow-lg">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">Z</span>
                </div>
                <span className="text-base font-semibold">OSAP</span>
              </div>
              <div className="hidden sm:flex items-center gap-6">
                <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Features
                </a>
                <Link href="/home" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  App
                </Link>
              </div>
              <Link href="/home">
                <Button size="sm" className="rounded-full">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>

          {/* Hero Section */}
          <div className="pt-20 pb-16 sm:pt-28 sm:pb-24 flex flex-col justify-center items-center gap-6 sm:gap-8">
            <div className="text-center space-y-4">
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight">
                Your personal{' '}
                <span className="text-primary">agent OS</span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Execute tasks across apps with persistent memory. Built for developers who want programmable AI agents with full control.
              </p>
            </div>

            {/* Command Input */}
            <div className="w-full max-w-2xl mt-8">
              <CommandInput
                placeholder="What do you want to do?"
                onSubmit={(value) => console.log('Command:', value)}
              />
            </div>

            {/* Install Command */}
            <div className="w-full max-w-xl flex flex-col sm:flex-row items-center justify-center gap-4 mt-4">
              <div className="w-full sm:w-auto bg-card rounded-xl px-4 py-2.5 flex items-center justify-between gap-4 border border-border/50">
                <code className="text-sm font-mono text-muted-foreground">
bun install osap
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText('bun install osap');
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch (err) {
                      console.error('Failed to copy:', err);
                    }
                  }}
                  className="shrink-0"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
            </div>
          </div>

          {/* Features Section */}
          <div id="features" className="py-16 sm:py-24">
            <div className="flex flex-col md:flex-row gap-0 md:gap-2">
              {features.map((feature, index) => (
                <FeatureCard
                  key={index}
                  title={feature.title}
                  description={feature.description}
                  isActive={activeCard === index}
                  progress={activeCard === index ? progress : 0}
                  onClick={() => handleCardClick(index)}
                />
              ))}
            </div>
          </div>

          {/* CTA Section */}
          <div className="py-16 sm:py-24 flex flex-col items-center gap-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-center">
              Ready to build?
            </h2>
            <p className="text-muted-foreground text-center max-w-md">
              Join the future of personal computing. Your agent is waiting.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/home">
                <Button size="lg" className="rounded-xl">
                  Start Building
                </Button>
              </Link>
              <Button size="lg" variant="secondary" className="rounded-xl">
                View Documentation
              </Button>
            </div>
          </div>

          {/* Footer */}
          <footer className="py-8 border-t border-border/50">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="size-6 rounded-md bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">Z</span>
                </div>
                <span className="text-sm font-semibold">OSAP</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Built for developers who demand more from their tools.
              </p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
