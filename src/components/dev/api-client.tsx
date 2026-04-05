'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Send,
  Plus,
  Trash2,
  Loader2,
  Copy,
  Clock,
} from 'lucide-react';

interface RequestHeader {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

interface RequestParam {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

interface SavedRequest {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: RequestHeader[];
  body?: string;
  collection?: string;
}

interface ApiClientProps {
  onRequest?: (req: SavedRequest) => void;
}

const methodColors: Record<string, string> = {
  GET: 'bg-green-500/10 text-green-500',
  POST: 'bg-blue-500/10 text-blue-500',
  PUT: 'bg-yellow-500/10 text-yellow-500',
  PATCH: 'bg-purple-500/10 text-purple-500',
  DELETE: 'bg-red-500/10 text-red-500',
};

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export function ApiClient({ onRequest }: ApiClientProps) {
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState<RequestHeader[]>([
    { id: '1', key: 'Content-Type', value: 'application/json', enabled: true },
  ]);
  const [body, setBody] = useState('');
  const [params, setParams] = useState<RequestParam[]>([]);
  const [response, setResponse] = useState<{
    status: number;
    statusText: string;
    time: number;
    headers: Record<string, string>;
    body: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('params');
  const [savedRequests, setSavedRequests] = useState<SavedRequest[]>([
    { id: '1', name: 'Get Tasks', method: 'GET', url: '/api/tasks', headers: [] },
    { id: '2', name: 'Create Task', method: 'POST', url: '/api/tasks', headers: [{ id: '1', key: 'Content-Type', value: 'application/json', enabled: true }] },
  ]);
  const [newRequestName, setNewRequestName] = useState('');

  const addHeader = () => {
    setHeaders([...headers, { id: Date.now().toString(), key: '', value: '', enabled: true }]);
  };

  const updateHeader = (id: string, field: keyof RequestHeader, value: string | boolean) => {
    setHeaders(headers.map(h => h.id === id ? { ...h, [field]: value } : h));
  };

  const removeHeader = (id: string) => {
    setHeaders(headers.filter(h => h.id !== id));
  };

  const addParam = () => {
    setParams([...params, { id: Date.now().toString(), key: '', value: '', enabled: true }]);
  };

  const updateParam = (id: string, field: keyof RequestParam, value: string | boolean) => {
    setParams(params.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const removeParam = (id: string) => {
    setParams(params.filter(p => p.id !== id));
  };

  const buildUrl = () => {
    let fullUrl = url;
    const enabledParams = params.filter(p => p.enabled && p.key);
    if (enabledParams.length > 0) {
      const queryString = enabledParams.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
      fullUrl += (url.includes('?') ? '&' : '?') + queryString;
    }
    return fullUrl;
  };

  const sendRequest = async () => {
    if (!url) return;

    setIsLoading(true);
    const startTime = Date.now();

    try {
      const fullUrl = buildUrl();
      const enabledHeaders = headers.filter(h => h.enabled && h.key);
      const headerObj: Record<string, string> = {};
      enabledHeaders.forEach(h => { headerObj[h.key] = h.value; });

      const fetchOptions: RequestInit = {
        method,
        headers: headerObj,
      };

      if (['POST', 'PUT', 'PATCH'].includes(method) && body) {
        fetchOptions.body = body;
      }

      const res = await fetch(fullUrl, fetchOptions);
      const time = Date.now() - startTime;
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => { responseHeaders[key] = value; });

      let responseBody = '';
      try {
        const json = await res.json();
        responseBody = JSON.stringify(json, null, 2);
      } catch {
        responseBody = await res.text();
      }

      setResponse({
        status: res.status,
        statusText: res.statusText,
        time,
        headers: responseHeaders,
        body: responseBody,
      });
    } catch (error) {
      setResponse({
        status: 0,
        statusText: 'Network Error',
        time: Date.now() - startTime,
        headers: {},
        body: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveRequest = () => {
    if (!newRequestName.trim()) return;
    const newRequest: SavedRequest = {
      id: Date.now().toString(),
      name: newRequestName,
      method,
      url,
      headers,
      body,
    };
    setSavedRequests([...savedRequests, newRequest]);
    setNewRequestName('');
    onRequest?.(newRequest);
  };

  const loadRequest = (request: SavedRequest) => {
    setMethod(request.method);
    setUrl(request.url);
    setHeaders(request.headers.length > 0 ? request.headers : [{ id: '1', key: 'Content-Type', value: 'application/json', enabled: true }]);
    setBody(request.body || '');
  };

  const deleteRequest = (id: string) => {
    setSavedRequests(savedRequests.filter(r => r.id !== id));
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex gap-2">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="w-[120px] px-3 py-2 rounded-lg border border-border bg-background"
        >
          {methods.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <Input
          placeholder="https://api.example.com/endpoint"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1"
        />
        <Button onClick={sendRequest} disabled={isLoading || !url}>
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>

      <div className="flex gap-2 border-b border-border/50">
        {['params', 'headers', 'body', 'saved'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm capitalize ${activeTab === tab ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'params' && (
        <div className="space-y-2">
          {params.map((param) => (
            <div key={param.id} className="flex gap-2 items-center">
              <input
                type="checkbox"
                checked={param.enabled}
                onChange={(e) => updateParam(param.id, 'enabled', e.target.checked)}
                className="rounded"
              />
              <Input
                placeholder="Key"
                value={param.key}
                onChange={(e) => updateParam(param.id, 'key', e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="Value"
                value={param.value}
                onChange={(e) => updateParam(param.id, 'value', e.target.value)}
                className="flex-1"
              />
              <Button size="sm" variant="ghost" onClick={() => removeParam(param.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addParam}>
            <Plus className="size-4 mr-1" /> Add Parameter
          </Button>
        </div>
      )}

      {activeTab === 'headers' && (
        <div className="space-y-2">
          {headers.map((header) => (
            <div key={header.id} className="flex gap-2 items-center">
              <input
                type="checkbox"
                checked={header.enabled}
                onChange={(e) => updateHeader(header.id, 'enabled', e.target.checked)}
                className="rounded"
              />
              <Input
                placeholder="Header name"
                value={header.key}
                onChange={(e) => updateHeader(header.id, 'key', e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="Header value"
                value={header.value}
                onChange={(e) => updateHeader(header.id, 'value', e.target.value)}
                className="flex-1"
              />
              <Button size="sm" variant="ghost" onClick={() => removeHeader(header.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addHeader}>
            <Plus className="size-4 mr-1" /> Add Header
          </Button>
        </div>
      )}

      {activeTab === 'body' && (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder='{"key": "value"}'
          className="w-full h-[200px] p-3 rounded-lg border border-border bg-background font-mono text-sm resize-none"
        />
      )}

      {activeTab === 'saved' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Request name"
              value={newRequestName}
              onChange={(e) => setNewRequestName(e.target.value)}
              className="flex-1"
            />
            <Button onClick={saveRequest} disabled={!newRequestName.trim()}>
              <Plus className="size-4 mr-1" /> Save
            </Button>
          </div>
          <div className="space-y-2">
            {savedRequests.map((req) => (
              <Card key={req.id} className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => loadRequest(req)}>
                  <Badge className={methodColors[req.method]}>{req.method}</Badge>
                  <span className="font-medium">{req.name}</span>
                  <span className="text-sm text-muted-foreground truncate max-w-[200px]">{req.url}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => deleteRequest(req.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {response && (
        <Card className="p-4 rounded-xl border-border/50 bg-card">
          <div className="flex items-center gap-4 mb-3">
            <Badge className={response.status >= 200 && response.status < 300 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}>
              {response.status} {response.statusText}
            </Badge>
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="size-4" />
              {response.time}ms
            </span>
            <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(response.body)}>
              <Copy className="size-4" />
            </Button>
          </div>
          <div className="max-h-[300px] overflow-auto">
            <pre className="text-sm font-mono p-3 bg-muted rounded-lg overflow-auto">
              {response.body}
            </pre>
          </div>
        </Card>
      )}
    </div>
  );
}
