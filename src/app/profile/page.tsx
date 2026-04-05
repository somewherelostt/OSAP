'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser, useClerk, UserButton } from '@clerk/nextjs';
import { useTheme } from 'next-themes';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { SectionHeader } from '@/components/section-header';
import { useRouter } from 'next/navigation';
import {
  User,
  Mail,
  Bell,
  Moon,
  Shield,
  Palette,
  LogOut,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Zap,
  Clock,
  Loader2,
  Check,
} from 'lucide-react';

interface UserStats {
  tasksCompleted: number;
  memoriesStored: number;
  activeTime: string;
}

interface RecentTask {
  id: string;
  input: string;
  title?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface EmailPreferences {
  taskCompletionEmails: boolean;
  memoryDigestEmails: boolean;
  weeklySummary: boolean;
}

const ACCENT_COLORS = [
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Amber', value: '#f59e0b' },
];

const settingsSections = [
  {
    title: 'Account',
    items: [
      {
        id: 'profile-info',
        icon: User,
        label: 'Profile Information',
        description: 'Update your profile details',
      },
      {
        id: 'email-prefs',
        icon: Mail,
        label: 'Email Preferences',
        description: 'Manage notification emails',
      },
    ],
  },
  {
    title: 'Appearance',
    items: [
      {
        id: 'dark-mode',
        icon: Moon,
        label: 'Dark Mode',
        description: 'Toggle dark/light theme',
        hasSwitch: true,
      },
      {
        id: 'accent-color',
        icon: Palette,
        label: 'Accent Color',
        description: 'Primary color for UI',
      },
    ],
  },
  {
    title: 'Security',
    items: [
      {
        id: '2fa',
        icon: Shield,
        label: 'Two-Factor Authentication',
        description: 'Add extra security',
      },
    ],
  },
];

export default function ProfilePage() {
  const { user, isLoaded } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const router = useRouter();
  const [stats, setStats] = useState<UserStats>({ tasksCompleted: 0, memoriesStored: 0, activeTime: '0h' });
  const [recentTasks, setRecentTasks] = useState<RecentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [emailPrefs, setEmailPrefs] = useState<EmailPreferences>({
    taskCompletionEmails: true,
    memoryDigestEmails: true,
    weeklySummary: false,
  });
  const [emailPrefsLoading, setEmailPrefsLoading] = useState(false);
  const [accentColor, setAccentColor] = useState<string>('#8b5cf6');

  const fetchStats = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [tasksRes, memoryRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/memory'),
      ]);
      if (!tasksRes.ok || !memoryRes.ok) throw new Error('Failed to fetch');
      const tasksData = await tasksRes.json();
      const memoryData = await memoryRes.json();
      const tasks: RecentTask[] = tasksData.tasks || [];
      const memories: unknown[] = memoryData.memories || [];

      const doneTasks = tasks.filter(t => t.status === 'done');
      const completedCount = doneTasks.length;
      const memoriesCount = memories.length;

      const totalMs = tasks.reduce((acc, task) => {
        if (task.updated_at && task.created_at) {
          const diff = new Date(task.updated_at).getTime() - new Date(task.created_at).getTime();
          return acc + Math.max(0, diff);
        }
        return acc;
      }, 0);
      const hours = Math.round(totalMs / 3600000);

      setStats({
        tasksCompleted: completedCount,
        memoriesStored: memoriesCount,
        activeTime: hours > 0 ? `${hours}h` : '0h',
      });

      setRecentTasks(tasks.slice(0, 5));
    } catch (error) {
      console.error('[Profile] Error fetching stats:', error);
    }
  }, [user?.id]);

  const fetchEmailPreferences = useCallback(async () => {
    try {
      const res = await fetch('/api/profile/preferences');
      if (!res.ok) return;
      const data = await res.json();
      setEmailPrefs(data.preferences);
    } catch (error) {
      console.error('[Profile] Error fetching preferences:', error);
    }
  }, []);

  useEffect(() => {
    if (isLoaded && user?.id) {
      Promise.all([fetchStats(), fetchEmailPreferences()]).finally(() => setLoading(false));
    }
  }, [isLoaded, user?.id, fetchStats, fetchEmailPreferences]);

  useEffect(() => {
    const saved = localStorage.getItem('osap-accent-color');
    if (saved) {
      setAccentColor(saved);
      document.documentElement.style.setProperty('--accent', saved);
    }
  }, []);

  const handleDarkModeToggle = (checked: boolean) => {
    setTheme(checked ? 'dark' : 'light');
  };

  const handleEmailPrefToggle = async (key: keyof EmailPreferences, value: boolean) => {
    const updated = { ...emailPrefs, [key]: value };
    setEmailPrefs(updated);
    setEmailPrefsLoading(true);
    try {
      await fetch('/api/profile/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferenceKey: key, value }),
      });
    } catch (error) {
      console.error('[Profile] Error updating preference:', error);
      setEmailPrefs(emailPrefs);
    } finally {
      setEmailPrefsLoading(false);
    }
  };

  const handleAccentColorSelect = (color: string) => {
    setAccentColor(color);
    localStorage.setItem('osap-accent-color', color);
    document.documentElement.style.setProperty('--accent', color);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const toggleSection = (id: string) => {
    setExpandedSection(expandedSection === id ? null : id);
  };

  const isDarkMode = resolvedTheme === 'dark';

  if (!isLoaded || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const initials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user?.firstName?.[0] || user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() || 'U';

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'done':
      case 'success':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Done</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Pending</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
          <p className="text-muted-foreground text-sm">
            Manage your account and preferences
          </p>
        </div>
        <UserButton />
      </div>

      <Card className="p-6 rounded-2xl border-border/50 bg-card">
        <div className="flex items-center gap-4">
          <Avatar className="size-16 rounded-2xl">
            <AvatarImage src={user?.imageUrl} />
            <AvatarFallback className="rounded-2xl bg-primary/10 text-primary font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h2 className="font-semibold text-lg">
              {user?.fullName || 'OSAP User'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {user?.primaryEmailAddress?.emailAddress || 'No email'}
            </p>
            <Badge variant="secondary" className="mt-2 bg-primary/10 text-primary">
              <Zap className="size-3 mr-1" />
              Pro Plan
            </Badge>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl"
            onClick={() => openUserProfile()}
          >
            Edit
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 rounded-2xl border-border/50 bg-card text-center">
          <p className="text-2xl font-bold">{stats.tasksCompleted}</p>
          <p className="text-xs text-muted-foreground">Tasks Completed</p>
        </Card>
        <Card className="p-4 rounded-2xl border-border/50 bg-card text-center">
          <p className="text-2xl font-bold">{stats.memoriesStored}</p>
          <p className="text-xs text-muted-foreground">Memories Stored</p>
        </Card>
        <Card className="p-4 rounded-2xl border-border/50 bg-card text-center">
          <p className="text-2xl font-bold">{stats.activeTime}</p>
          <p className="text-xs text-muted-foreground">Active Time</p>
        </Card>
      </div>

      <div className="space-y-6">
        <SectionHeader title="Settings" />

        {settingsSections.map((section) => (
          <div key={section.title} className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground px-1">
              {section.title}
            </h3>
            <Card className="rounded-2xl border-border/50 bg-card overflow-hidden">
              {section.items.map((item, index) => (
                <div key={item.id}>
                  {item.id === 'dark-mode' ? (
                    <div className="flex items-center justify-between p-4 hover:bg-accent/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-xl bg-muted flex items-center justify-center">
                          <item.icon className="size-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{item.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.description}
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={isDarkMode}
                        onCheckedChange={handleDarkModeToggle}
                      />
                    </div>
                  ) : item.id === '2fa' ? (
                    <div className="flex items-center justify-between p-4 hover:bg-accent/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-xl bg-muted flex items-center justify-center">
                          <item.icon className="size-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{item.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.description}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl text-xs"
                        onClick={() => openUserProfile()}
                      >
                        Enable
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="flex items-center justify-between p-4 hover:bg-accent/50 transition-colors cursor-pointer"
                      onClick={() => toggleSection(item.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-xl bg-muted flex items-center justify-center">
                          <item.icon className="size-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{item.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.description}
                          </p>
                        </div>
                      </div>
                      {item.hasSwitch ? (
                        <Switch
                          checked={item.id === 'dark-mode' ? isDarkMode : false}
                          onCheckedChange={(checked) => {
                            if (item.id === 'dark-mode') handleDarkModeToggle(checked);
                          }}
                        />
                      ) : (
                        expandedSection === item.id ? (
                          <ChevronUp className="size-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="size-4 text-muted-foreground" />
                        )
                      )}
                    </div>
                  )}
                  {index < section.items.length - 1 && <Separator className="mx-4" />}

                  {expandedSection === 'profile-info' && item.id === 'profile-info' && (
                    <div className="p-4 bg-muted/30 border-t border-border">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Shield className="size-3" />
                          Managed by Clerk
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-muted-foreground">Name</label>
                            <p className="text-sm font-medium">{user?.fullName || 'Not set'}</p>
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Email</label>
                            <p className="text-sm font-medium">{user?.primaryEmailAddress?.emailAddress || 'Not set'}</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl text-xs"
                          onClick={() => openUserProfile()}
                        >
                          Edit in Clerk
                        </Button>
                      </div>
                    </div>
                  )}

                  {expandedSection === 'email-prefs' && item.id === 'email-prefs' && (
                    <div className="p-4 bg-muted/30 border-t border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Task completion emails</p>
                          <p className="text-xs text-muted-foreground">Get notified when tasks finish</p>
                        </div>
                        <Switch
                          checked={emailPrefs.taskCompletionEmails}
                          onCheckedChange={(v) => handleEmailPrefToggle('taskCompletionEmails', v)}
                          disabled={emailPrefsLoading}
                        />
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Memory digest emails</p>
                          <p className="text-xs text-muted-foreground">Weekly summary of stored memories</p>
                        </div>
                        <Switch
                          checked={emailPrefs.memoryDigestEmails}
                          onCheckedChange={(v) => handleEmailPrefToggle('memoryDigestEmails', v)}
                          disabled={emailPrefsLoading}
                        />
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Weekly summary</p>
                          <p className="text-xs text-muted-foreground">A weekly recap of your activity</p>
                        </div>
                        <Switch
                          checked={emailPrefs.weeklySummary}
                          onCheckedChange={(v) => handleEmailPrefToggle('weeklySummary', v)}
                          disabled={emailPrefsLoading}
                        />
                      </div>
                    </div>
                  )}

                  {expandedSection === 'accent-color' && item.id === 'accent-color' && (
                    <div className="p-4 bg-muted/30 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-3">Choose an accent color</p>
                      <div className="flex gap-2 flex-wrap">
                        {ACCENT_COLORS.map((color) => (
                          <button
                            key={color.value}
                            onClick={() => handleAccentColorSelect(color.value)}
                            className="size-8 rounded-full flex items-center justify-center transition-all"
                            style={{ backgroundColor: color.value }}
                            title={color.name}
                          >
                            {accentColor === color.value && (
                              <Check className="size-4 text-white" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </Card>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <SectionHeader title="Recent Activity" />
        <Card className="p-4 rounded-2xl border-border/50 bg-card">
          <div className="space-y-3">
            {recentTasks.length > 0 ? (
              recentTasks.map((task, index) => (
                <div key={task.id}>
                  <button
                    className="w-full flex items-center gap-3 text-left hover:bg-accent/30 rounded-lg p-2 -m-2 transition-colors"
                    onClick={() => router.push(`/tasks?id=${task.id}`)}
                  >
                    <div className={`size-8 rounded-lg flex items-center justify-center ${
                      task.status === 'done' || task.status === 'success'
                        ? 'bg-green-500/10'
                        : task.status === 'failed'
                        ? 'bg-red-500/10'
                        : 'bg-yellow-500/10'
                    }`}>
                      <Clock className={`size-4 ${
                        task.status === 'done' || task.status === 'success'
                          ? 'text-green-500'
                          : task.status === 'failed'
                          ? 'text-red-500'
                          : 'text-yellow-500'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {task.title || task.input.substring(0, 40) + (task.input.length > 40 ? '...' : '')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTimestamp(task.updated_at)}
                      </p>
                    </div>
                    {getStatusBadge(task.status)}
                    <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                  </button>
                  {index < recentTasks.length - 1 && <Separator className="my-3" />}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
            )}
          </div>
        </Card>
      </div>

      <Button
        variant="outline"
        className="w-full rounded-xl flex items-center gap-2 justify-center text-destructive hover:bg-destructive/10"
        onClick={handleSignOut}
      >
        <LogOut className="size-4" />
        Sign Out
      </Button>
    </div>
  );
}
