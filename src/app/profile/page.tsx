'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUser, useClerk, UserButton } from '@clerk/nextjs';
import { useTheme } from 'next-themes';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { SectionHeader } from '@/components/section-header';
import {
  User,
  Mail,
  Moon,
  Shield,
  Palette,
  LogOut,
  ChevronRight,
  Zap,
  Loader2,
  Check,
  Search,
  ArrowRight,
  Info,
  Layers,
} from 'lucide-react';
import { Input } from '@/components/ui/input';

interface Toolkit {
  slug: string;
  name: string;
  description: string;
  logo?: string;
  category?: string;
  authSchemes: string[];
  connection?: {
    is_active: boolean;
    connected_account?: any;
  } | null;
}

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

const settingsSections = [
  {
    title: 'Account',
    items: [
      { id: 'profile-info', icon: User, label: 'Profile Information', description: 'Update your profile details' },
      { id: 'email-prefs', icon: Mail, label: 'Email Preferences', description: 'Manage notification emails' },
    ],
  },
  {
    title: 'Appearance',
    items: [
      { id: 'dark-mode', icon: Moon, label: 'Dark Mode', description: 'Toggle dark/light theme', hasSwitch: true },
      { id: 'accent-color', icon: Palette, label: 'Accent Color', description: 'Primary color for UI' },
    ],
  },
  {
    title: 'Security',
    items: [
      { id: '2fa', icon: Shield, label: 'Two-Factor Authentication', description: 'Add extra security' },
    ],
  },
];

export default function ProfilePage() {
  const { user, isLoaded } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  const [stats, setStats] = useState<UserStats>({ tasksCompleted: 0, memoriesStored: 0, activeTime: '0h' });
  const [appLoading, setAppLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  
  const [toolkits, setToolkits] = useState<Toolkit[]>([]);
  const [connectedSlugs, setConnectedSlugs] = useState<string[]>([]);
  const [toolkitsLoading, setToolkitsLoading] = useState(true);
  const [toolkitsError, setToolkitsError] = useState<string | null>(null);
  const [connectingToolkit, setConnectingToolkit] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);

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
      const memories: any[] = memoryData.memories || [];

      const completedCount = tasks.filter(t => t.status === 'done').length;
      const hours = Math.round(tasks.reduce((acc, task) => {
        if (task.updated_at && task.created_at) {
          return acc + (new Date(task.updated_at).getTime() - new Date(task.created_at).getTime());
        }
        return acc;
      }, 0) / 3600000);

      setStats({
        tasksCompleted: completedCount,
        memoriesStored: memories.length,
        activeTime: `${hours}h`,
      });
    } catch (error) {
      console.error('[Profile] Error fetching stats:', error);
    }
  }, [user?.id]);

  const fetchConnectedToolkits = useCallback(async () => {
    setToolkitsLoading(true);
    setToolkitsError(null);
    try {
      const res = await fetch('/api/composio/status');
      if (!res.ok) {
        setToolkitsError(`Server returned status ${res.status}.`);
        return;
      }
      const data = await res.json();
      if (data.error) {
        setToolkitsError(data.error);
        return;
      }
      const fetchedToolkits = data.toolkits || [];
      setToolkits(fetchedToolkits);
      setConnectedSlugs(data.connected || []);
      
      if (fetchedToolkits.length === 0) {
        setToolkitsError('No toolkits available in library.');
      }
    } catch (error) {
      console.error('[Profile] Error fetching toolkits:', error);
      setToolkitsError('Failed to load toolkit catalog.');
    } finally {
      setToolkitsLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    if (isLoaded && user?.id) {
      Promise.all([fetchStats(), fetchConnectedToolkits()]).finally(() => setAppLoading(false));
    } else if (isLoaded && !user) {
      setAppLoading(false);
    }
  }, [isLoaded, user?.id, user, fetchStats, fetchConnectedToolkits]);

  const filteredToolkits = useMemo(() => {
    return toolkits
      .filter((t) => {
        const query = searchQuery.toLowerCase();
        return t.name.toLowerCase().includes(query) || t.slug.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        const aConnected = connectedSlugs.includes(a.slug) ? 1 : 0;
        const bConnected = connectedSlugs.includes(b.slug) ? 1 : 0;
        return bConnected - aConnected;
      });
  }, [toolkits, searchQuery, connectedSlugs]);

  const handleConnectToolkit = async (slug: string) => {
    console.log('[Profile] Connecting:', slug);
    setConnectingToolkit(slug);
    try {
      const res = await fetch('/api/composio/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolkit: slug }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Connection failed: ${res.statusText}`);
      }

      const data = await res.json();
      if (data.authUrl) {
        console.log('[Profile] Opening auth URL:', data.authUrl);
        window.open(data.authUrl, '_blank');
        setTimeout(fetchConnectedToolkits, 5000);
      }
    } catch (error: any) {
      console.error('[Profile] Connection error:', error);
      alert(error.message || 'Failed to initiate connection. Please try again.');
    } finally {
      setConnectingToolkit(null);
    }
  };

  const handleDisconnectToolkit = async (slug: string) => {
    console.log('[Profile] Disconnecting:', slug);
    try {
      await fetch('/api/composio/connect', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolkit: slug }),
      });
      fetchConnectedToolkits();
    } catch (error) {
      console.error('[Profile] Disconnect error:', error);
    }
  };

  if (!isLoaded || appLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-4">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Loading your profile...</p>
      </div>
    );
  }

  const initials = user?.firstName && user?.lastName 
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user?.firstName ? user.firstName[0] : 'U';

  return (
    <div className="max-w-5xl mx-auto space-y-8 px-4 sm:px-6 lg:px-8 py-10 pb-32">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Profile</h1>
          <p className="text-muted-foreground text-sm">Manage your OSAP account and integration preferences</p>
        </div>
        <div className="relative z-50">
          <UserButton />
        </div>
      </div>

      {/* Profile Card */}
      <Card className="p-6 rounded-[2rem] border-border/50 bg-card/50 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <Avatar className="size-20 rounded-3xl shadow-lg border-4 border-background">
            <AvatarImage src={user?.imageUrl} />
            <AvatarFallback className="rounded-3xl bg-primary/10 text-primary text-xl font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 text-center sm:text-left space-y-2">
            <div>
              <h2 className="font-bold text-2xl text-foreground">{user?.fullName || 'OSAP User'}</h2>
              <p className="text-sm text-muted-foreground font-medium">{user?.primaryEmailAddress?.emailAddress || 'No account email'}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <Badge variant="secondary" className="bg-primary/10 text-primary border-none text-[10px] uppercase tracking-widest font-bold h-6">
                <Zap className="size-3 mr-1.5" />
                Developer Tier
              </Badge>
              <Badge variant="outline" className="text-[10px] uppercase tracking-widest font-bold h-6 border-border/50 text-muted-foreground">
                Beta Access
              </Badge>
            </div>
          </div>
          <Button 
            variant="outline" 
            className="rounded-2xl border-border/50 shadow-none hover:bg-muted font-bold px-6 h-11" 
            onClick={() => openUserProfile()}
          >
            Manage Identity
          </Button>
        </div>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard value={stats.tasksCompleted} label="Tasks Completed" />
        <StatCard value={stats.memoriesStored} label="Memories Stored" />
        <StatCard value={stats.activeTime} label="Active Session Time" />
      </div>

      {/* Toolkits Catalog */}
      <div id="connected-toolkits" className="space-y-6 pt-6 border-t border-border/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <SectionHeader title="Available Toolkits" />
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground opacity-40" />
            <Input
              placeholder="Search 250+ integrations (GitHub, Gmail...)"
              className="pl-11 bg-card border-border/50 rounded-2xl h-12 shadow-none focus-visible:ring-primary/20 border-2"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleCount(20);
              }}
            />
          </div>
        </div>

        <div className="min-h-[300px]">
          {toolkitsLoading && toolkits.length === 0 ? (
            <div className="py-32 flex flex-col items-center justify-center gap-4">
              <Loader2 className="size-10 animate-spin text-primary/30" />
              <p className="text-sm text-muted-foreground font-semibold animate-pulse">Scanning Composio ecosystem...</p>
            </div>
          ) : toolkitsError ? (
            <div className="py-24 px-8 text-center rounded-[2.5rem] border-2 border-destructive/20 bg-destructive/[0.01] border-dashed space-y-6">
              <div className="size-20 rounded-full bg-destructive/10 mx-auto flex items-center justify-center">
                <Info className="size-10 text-destructive" />
              </div>
              <div className="space-y-2">
                 <p className="text-xl font-black text-foreground tracking-tight">Toolkit Sync Interrupted</p>
                 <p className="text-sm text-muted-foreground max-w-sm mx-auto font-medium">{toolkitsError}</p>
              </div>
              <Button size="lg" className="rounded-2xl px-12 font-bold" onClick={fetchConnectedToolkits}>
                Force Refresh
              </Button>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {filteredToolkits.slice(0, visibleCount).map((app) => (
                  <ToolkitCard
                    key={app.slug}
                    app={app}
                    isConnected={connectedSlugs.includes(app.slug)}
                    isFeatured={['gmail', 'github', 'slack', 'googlecalendar', 'twitter', 'notion'].includes(app.slug)}
                    handleConnect={handleConnectToolkit}
                    handleDisconnect={handleDisconnectToolkit}
                    connectingToolkit={connectingToolkit}
                    toolkitsLoading={toolkitsLoading}
                  />
                ))}
              </div>

              {filteredToolkits.length > visibleCount && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    className="rounded-2xl px-12 py-7 border-2 border-border/50 hover:bg-muted/50 transition-all font-bold group shadow-none"
                    onClick={() => setVisibleCount(prev => prev + 20)}
                  >
                    Load More Toolkits
                    <ArrowRight className="size-5 ml-3 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </div>
              )}

              {filteredToolkits.length === 0 && (
                <div className="py-24 text-center rounded-[2.5rem] border-2 border-dashed border-border/20 bg-muted/5">
                  <div className="size-24 rounded-full bg-muted/50 mx-auto flex items-center justify-center mb-6">
                    <Search className="size-12 text-muted-foreground opacity-20" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">No integrations found</h3>
                  <p className="text-sm text-muted-foreground mt-2 mb-8 font-medium">We couldn&apos;t find any tool matching &quot;{searchQuery}&quot;</p>
                  <Button variant="outline" className="rounded-2xl px-8 h-12 font-bold border-2" onClick={() => setSearchQuery('')}>
                    Reset Search
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 p-6 rounded-[2rem] bg-muted/30 border-2 border-border/20 text-[12px] text-muted-foreground flex gap-5 items-start">
          <Info className="size-6 shrink-0 text-primary/50" />
          <div className="space-y-1">
            <p className="leading-relaxed font-medium">
              Toolkit integration allows your OSAP agent to securely perform cross-platform actions. 
              <strong> All credentials are encrypted and stored solely within the Composio infrastructure.</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="space-y-6 pt-6 border-t border-border/40">
        <SectionHeader title="Account Settings" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {settingsSections.map((section) => (
             <Card key={section.title} className="p-6 rounded-[2rem] border-border/50 bg-card/30 shadow-none border-2">
                <h3 className="text-[11px] uppercase tracking-[0.2em] font-black text-muted-foreground/60 mb-6 flex items-center gap-2">
                  {section.title}
                </h3>
                <div className="space-y-3">
                  {section.items.map((item) => (
                    <div 
                      key={item.id} 
                      className={`flex items-center justify-between p-4 rounded-2xl transition-all duration-200 group border-2 border-transparent ${item.hasSwitch ? 'cursor-default' : 'cursor-pointer hover:bg-muted hover:border-border/30'}`}
                      onClick={() => {
                        if (!item.hasSwitch) {
                          setExpandedSection(expandedSection === item.id ? null : item.id);
                        }
                      }}
                    >
                      <div className="flex items-center gap-5">
                        <div className="size-12 rounded-xl bg-muted/80 flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-all">
                          <item.icon className="size-6" />
                        </div>
                        <div>
                          <p className="text-sm font-bold leading-tight text-foreground">{item.label}</p>
                          <p className="text-[12px] text-muted-foreground mt-0.5 font-medium">{item.description}</p>
                        </div>
                      </div>
                      {item.hasSwitch ? (
                        <div className="relative z-10" onClick={(e) => e.stopPropagation()}>
                          <Switch 
                            checked={mounted && theme === 'dark'}
                            onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')} 
                            className="data-[state=checked]:bg-primary"
                          />
                        </div>
                      ) : (
                        <ChevronRight className={`size-5 text-muted-foreground/30 transition-transform duration-300 ${expandedSection === item.id ? 'rotate-90 text-primary' : ''}`} />
                      )}
                    </div>
                  ))}
                </div>
             </Card>
          ))}
        </div>
      </div>
      
      {/* Sign Out Action */}
      <div className="pt-12">
        <Button 
          variant="outline" 
          className="w-full rounded-2xl border-destructive/20 text-destructive hover:bg-destructive/5 hover:border-destructive/40 py-8 font-black text-lg transition-all shadow-none group"
          onClick={() => {
            console.log('[Profile] Signing out...');
            signOut().catch(err => console.error('[Profile] Sign out failed:', err));
          }}
        >
          <LogOut className="size-6 mr-3 group-hover:scale-110 transition-transform" />
          Terminate OSAP Session
        </Button>
        <p className="text-center text-[11px] text-muted-foreground mt-4 font-bold uppercase tracking-widest opacity-40">
          Build 0.1.4-beta • Made with love at OSAP
        </p>
      </div>
    </div>
  );
}

function ToolkitCard({ app, isConnected, isFeatured, handleConnect, handleDisconnect, connectingToolkit, toolkitsLoading }: any) {
  return (
    <div 
      className={`group relative p-6 rounded-[2.25rem] border-2 border-border/50 bg-card hover:bg-muted/30 transition-all duration-300 shadow-none border-dashed ${isConnected ? 'border-primary/40 ring-2 ring-primary/5 bg-primary/[0.01] border-solid' : ''}`}
    >
        <div className="flex items-start gap-5">
          <div className={`relative size-16 rounded-[1.25rem] flex items-center justify-center shrink-0 overflow-hidden border-2 border-border/30 shadow-inner ${!app.logo ? 'bg-secondary/50' : 'bg-white'}`}>
            {app.logo ? (
              <img src={app.logo} alt={app.name} className="size-10 object-contain p-1" />
            ) : (
              <Layers className="size-8 text-muted-foreground/30" />
            )}
            {isConnected && (
              <div className="absolute inset-0 bg-green-500/15 flex items-center justify-center backdrop-blur-[1px]">
                <div className="size-7 bg-green-500 rounded-full border-2 border-white flex items-center justify-center shadow-lg transform scale-110">
                   <Check className="size-4 text-white stroke-[3]" />
                </div>
              </div>
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2 pt-1">
              <h3 className="text-lg font-black truncate leading-none text-foreground">{app.name}</h3>
              {isFeatured && (
                <Badge variant="outline" className="text-[10px] py-0 px-2 font-black border-amber-500/20 text-amber-600 bg-amber-500/5 uppercase tracking-tighter h-5">
                  Featured
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 h-9 leading-relaxed font-medium">
              {app.description || `Integrate ${app.name} to expand your agent's technical capabilities.`}
            </p>
            
            <div className="flex items-center justify-between mt-6">
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-black bg-muted/80 px-2.5 py-1 rounded-xl border border-border/30">
                {app.category || 'Module'}
              </span>
              
              <div className="flex gap-2">
                {isConnected && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[10px] h-8 px-3 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/5 rounded-xl font-bold lowercase tracking-normal"
                    onClick={() => handleDisconnect(app.slug)}
                    disabled={connectingToolkit === app.slug || toolkitsLoading}
                  >
                    Disconnect
                  </Button>
                )}
                <div className="flex items-center">
                  {!isConnected ? (
                    <Button
                      size="sm"
                      className="text-[11px] h-9 px-5 rounded-2xl font-black bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/10 transition-all flex items-center gap-2"
                      onClick={() => handleConnect(app.slug)}
                      disabled={connectingToolkit === app.slug || toolkitsLoading}
                    >
                      {connectingToolkit === app.slug ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>
                          Link
                          <ArrowRight className="size-4" />
                        </>
                      )}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1.5 px-4 py-1.5 rounded-2xl bg-green-500/10 border border-green-500/20 text-green-600">
                      <Check className="size-3.5 stroke-[3]" />
                      <span className="text-[11px] font-black uppercase tracking-wider">Connected</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}

function StatCard({ value, label }: { value: string | number, label: string }) {
  return (
    <Card className="p-6 rounded-[2rem] border-2 border-border/50 bg-card text-center hover:border-primary/20 transition-all group shadow-sm border-dashed">
      <p className="text-4xl font-black group-hover:text-primary transition-colors tracking-tighter text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground uppercase tracking-[0.2em] font-black mt-2 opacity-60 group-hover:opacity-100 transition-opacity">{label}</p>
    </Card>
  );
}
