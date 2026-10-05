'use client';

import { useTheme } from '@/lib/theme-context';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const themes = [
    { value: 'dark' as const, label: '深色', icon: '☾' },
    { value: 'light' as const, label: '浅色', icon: '☀' },
    { value: 'system' as const, label: '系统', icon: '◑' },
  ];

  return (
    <div className="relative inline-block">
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value as any)}
        className="appearance-none px-4 py-2 pr-10 rounded-full text-sm font-medium
                   bg-card-bg border border-card-border text-foreground
                   hover:bg-tile transition-colors cursor-pointer
                   focus:outline-none focus:ring-2 focus:ring-accent"
      >
        {themes.map((t) => (
          <option key={t.value} value={t.value}>
            {t.icon} {t.label}
          </option>
        ))}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  );
}
