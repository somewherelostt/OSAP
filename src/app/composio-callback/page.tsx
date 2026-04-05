'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export default function ComposioCallback() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Completing connection...');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const error = params.get('error');

    if (success === 'true') {
      queueMicrotask(() => {
        setStatus('success');
        setMessage('App connected successfully!');
        setTimeout(() => {
          if (window.opener) {
            window.opener.postMessage({ type: 'COMPOSIO_CONNECTED' }, '*');
            window.close();
          } else {
            window.location.href = '/profile#connected-apps';
          }
        }, 1500);
      });
    } else if (error) {
      queueMicrotask(() => {
        setStatus('error');
        setMessage(decodeURIComponent(error));
      });
    } else {
      queueMicrotask(() => {
        setStatus('error');
        setMessage('No response from Composio');
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-card rounded-2xl border border-border p-8 text-center space-y-4">
          {status === 'loading' && (
            <>
              <Loader2 className="size-12 animate-spin text-primary mx-auto" />
              <h2 className="text-lg font-semibold">Connecting...</h2>
              <p className="text-sm text-muted-foreground">{message}</p>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle2 className="size-12 text-green-500 mx-auto" />
              <h2 className="text-lg font-semibold">Connected!</h2>
              <p className="text-sm text-muted-foreground">{message}</p>
              <p className="text-xs text-muted-foreground">This window will close automatically...</p>
            </>
          )}
          {status === 'error' && (
            <>
              <XCircle className="size-12 text-destructive mx-auto" />
              <h2 className="text-lg font-semibold">Connection Failed</h2>
              <p className="text-sm text-muted-foreground">{message}</p>
              <button
                onClick={() => window.close()}
                className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:opacity-90 transition-opacity"
              >
                Close Window
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}