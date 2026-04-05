'use client';

import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2 } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  onOutput?: (data: string) => void;
  className?: string;
}

export function Terminal({ onOutput, className = '' }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const xterm = new XTerm({
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#c9d1d9',
        black: '#484f58',
        red: '#f85149',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    const linksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(linksAddon);
    xterm.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;
    setIsReady(true);

    xterm.onData((data) => {
      onOutput?.(data);
    });

    const handleResize = () => {
      fitAddon?.fit();
    };

    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    xterm.writeln('\x1b[1;32mOSAP Dev Terminal\x1b[0m');
    xterm.writeln('Type commands here. Press Enter to execute.');
    xterm.writeln('');

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      xterm.dispose();
      xtermRef.current = null;
    };
  }, [onOutput]);

  const writeToTerminal = (data: string) => {
    xtermRef.current?.write(data);
  };

  const clearTerminal = () => {
    xtermRef.current?.clear();
    xtermRef.current?.writeln('\x1b[1;32mTerminal cleared\x1b[0m');
  };

  return (
    <div className={`relative ${className}`}>
      <div
        ref={terminalRef}
        className="h-full w-full rounded-lg overflow-hidden bg-[#0d1117]"
        style={{ minHeight: '300px' }}
      />
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0d1117]">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <div className="absolute top-2 right-2 flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="size-8 p-0 bg-[#0d1117]/80 hover:bg-[#0d1117]"
          onClick={clearTerminal}
        >
          <Trash2 className="size-4 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}

export function useTerminal() {
  const inputRef = useRef<string>('');
  const commandHistory = useRef<string[]>([]);
  const historyIndex = useRef<number>(-1);

  const writeInput = (xterm: XTerm | null, char: string) => {
    if (!xterm) return;
    xterm.write(char);
    inputRef.current += char;
  };

  const handleBackspace = (xterm: XTerm | null) => {
    if (!xterm || inputRef.current.length === 0) return;
    inputRef.current = inputRef.current.slice(0, -1);
    xterm.write('\b \b');
  };

  const handleEnter = (xterm: XTerm | null): string | null => {
    if (!xterm) return null;
    const command = inputRef.current.trim();
    xterm.writeln('');
    if (command) {
      commandHistory.current.push(command);
      historyIndex.current = commandHistory.current.length;
    }
    inputRef.current = '';
    historyIndex.current = commandHistory.current.length;
    return command || null;
  };

  const handleArrowUp = (xterm: XTerm | null) => {
    if (!xterm || commandHistory.current.length === 0) return;
    if (historyIndex.current > 0) {
      historyIndex.current--;
      const cmd = commandHistory.current[historyIndex.current];
      clearLine(xterm);
      xterm.write(cmd);
      inputRef.current = cmd;
    }
  };

  const handleArrowDown = (xterm: XTerm | null) => {
    if (!xterm || commandHistory.current.length === 0) return;
    if (historyIndex.current < commandHistory.current.length - 1) {
      historyIndex.current++;
      const cmd = commandHistory.current[historyIndex.current];
      clearLine(xterm);
      xterm.write(cmd);
      inputRef.current = cmd;
    } else {
      historyIndex.current = commandHistory.current.length;
      clearLine(xterm);
      inputRef.current = '';
    }
  };

  const clearLine = (xterm: XTerm | null) => {
    if (!xterm) return;
    const len = inputRef.current.length;
    for (let i = 0; i < len; i++) {
      xterm.write('\b \b');
    }
    inputRef.current = '';
  };

  return {
    writeInput,
    handleBackspace,
    handleEnter,
    handleArrowUp,
    handleArrowDown,
    clearLine,
  };
}
