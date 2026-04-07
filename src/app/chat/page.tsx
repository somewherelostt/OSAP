'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ChatInput } from '@/components/chat/ChatInput';
import { SuggestedPrompts } from '@/components/chat/SuggestedPrompts';
import type { ChatMessage, MessageStatus, ToolExecutionCard } from '@/types/chat';
import { useAuth } from '@/lib/use-auth';
import { LoginModal } from '@/components/login-modal';

const SESSION_STORAGE_KEY = 'osap_chat_history';

export default function ChatPage() {
  const { user, isLoaded } = useUser();
  const { isAuthenticated } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingIntervals = useRef<Record<string, NodeJS.Timeout>>({});

  // 1. Initial State & Persistence
  useEffect(() => {
    if (isLoaded && user) {
      const stored = sessionStorage.getItem(`${SESSION_STORAGE_KEY}_${user.id}`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setMessages(parsed);
        } catch (e) {
          console.error('[ChatPage] History parse failed:', e);
          addWelcomeMessage();
        }
      } else {
        addWelcomeMessage();
      }
    }
  }, [isLoaded, user]);

  useEffect(() => {
    if (user && messages.length > 0) {
      sessionStorage.setItem(`${SESSION_STORAGE_KEY}_${user.id}`, JSON.stringify(messages));
    }
  }, [messages, user]);

  const addWelcomeMessage = useCallback(() => {
    setMessages([
      {
        id: `system-welcome-${Date.now()}`,
        role: 'system',
        content: 'Conversation started',
        status: 'done',
        timestamp: new Date().toISOString(),
      },
      {
        id: `agent-welcome-${Date.now()}`,
        role: 'agent',
        content: `Hey ${user?.firstName || 'there'} 👋 I'm your OSAP agent. I can fetch your emails, manage GitHub, search the web, remember things, and more. What would you like me to do?`,
        status: 'done',
        timestamp: new Date().toISOString(),
      }
    ]);
  }, [user]);

  // 2. Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking, scrollToBottom]);

  // 3. Handlers
  const handleSend = async (messageText: string) => {
    if (!isAuthenticated) {
      setIsLoginModalOpen(true);
      return;
    }

    if (!messageText.trim() || isThinking) return;

    // A. Add user message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText,
      status: 'done',
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    // B. Add thinking placeholder
    const thinkingId = crypto.randomUUID();
    const thinkingMsg: ChatMessage = {
      id: thinkingId,
      role: 'agent',
      content: '',
      status: 'thinking',
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, thinkingMsg]);
    setIsThinking(true);

    try {
      // C. Call API
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send message');

      // D. Handle response
      if (data.type === 'answer' || data.type === 'memory') {
        setMessages(prev => prev.map(m => 
          m.id === thinkingId ? { ...m, content: data.content, status: 'done' } : m
        ));
        setIsThinking(false);
      } else if (data.type === 'task_started') {
        setMessages(prev => prev.map(m => 
          m.id === thinkingId ? { ...m, content: 'Working on it...', status: 'streaming', taskId: data.taskId } : m
        ));
        startPolling(data.taskId, thinkingId);
      }
    } catch (error) {
      console.error('[ChatPage] Send error:', error);
      setMessages(prev => prev.map(m => 
        m.id === thinkingId ? { ...m, content: 'Sorry, I encountered an error. Please try again.', status: 'error' } : m
      ));
      setIsThinking(false);
    }
  };

  const startPolling = (taskId: string, messageId: string) => {
    // Clear any existing polling for this task
    if (pollingIntervals.current[taskId]) clearInterval(pollingIntervals.current[taskId]);

    const poll = async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}`);
        const data = await res.json();
        
        if (!res.ok) {
          clearInterval(pollingIntervals.current[taskId]);
          setIsThinking(false);
          return;
        }

        const task = data.task;
        const TERMINAL = ['success', 'failed', 'done'];

        // Update message with latest step info
        setMessages(prev => prev.map(m => {
          if (m.id === messageId) {
            const toolExecutions: ToolExecutionCard[] = task.steps?.map((s: any) => ({
              tool: s.tool_name,
              description: s.description || `Executing ${s.tool_name}...`,
              status: s.status === 'success' ? 'done' : s.status === 'failed' ? 'error' : 'running',
              formattedResult: s.tool_output ? String(s.tool_output) : undefined
            })) || [];

            // Detect Auth Requirement
            const authInfo = task.result?.type === 'REQUIRES_AUTH' ? task.result : undefined;

            return {
              ...m,
              toolExecutions,
              authInfo,
              content: TERMINAL.includes(task.status) 
                ? (task.result?.formatted_answer || task.result?.answer || task.result?.summary || task.result?.message || 'Task completed.')
                : (task.result?.summary || 'Working on it...')
            };
          }
          return m;
        }));

        if (TERMINAL.includes(task.status)) {
          clearInterval(pollingIntervals.current[taskId]);
          setMessages(prev => prev.map(m => 
            m.id === messageId ? { ...m, status: task.status === 'failed' ? 'error' : 'done' } : m
          ));
          setIsThinking(false);
        }
      } catch (e) {
        console.error('[ChatPage] Polling failed:', e);
      }
    };

    // Adaptive polling: start at 2s, reduce to 500ms as task progresses
    let pollInterval = 2000;
    pollingIntervals.current[taskId] = setInterval(poll, pollInterval);
    
    // Speed up polling as we get closer to completion
    const speedUpPoll = () => {
      if (pollInterval > 500) {
        pollInterval -= 500;
        clearInterval(pollingIntervals.current[taskId]);
        pollingIntervals.current[taskId] = setInterval(poll, pollInterval);
      }
    };
    
    // Speed up after first response
    setTimeout(speedUpPoll, 2000);
    poll(); // Initial call
  };

  const handleClear = () => {
    if (user) sessionStorage.removeItem(`${SESSION_STORAGE_KEY}_${user.id}`);
    addWelcomeMessage();
  };

  const handleNew = () => {
    handleClear();
  };

  const handleStop = () => {
    setIsThinking(false);
    // In a real app, we'd call an abort API
  };

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      <LoginModal open={isLoginModalOpen} onOpenChange={setIsLoginModalOpen} />
      
      <ChatHeader 
        isThinking={isThinking} 
        onClear={handleClear} 
        onNew={handleNew} 
      />

      <main className="flex-1 overflow-y-auto px-4 py-8 custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-2">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          <div ref={messagesEndRef} className="h-4" />
        </div>
      </main>

      {(messages.length === 0 || (messages.length === 2 && messages[0].role === 'system')) && !isThinking && (
        <div className="max-w-4xl mx-auto w-full">
          <SuggestedPrompts onSelect={(p) => handleSend(p)} />
        </div>
      )}

      <ChatInput 
        onSend={handleSend} 
        onStop={handleStop} 
        isThinking={isThinking} 
        disabled={!isLoaded || !user}
      />
    </div>
  );
}
