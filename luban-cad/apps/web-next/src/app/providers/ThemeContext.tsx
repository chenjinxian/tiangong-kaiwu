import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'luban-next-theme';

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({
  theme: 'light',
  toggleTheme: () => {},
});

function readInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* 隐私模式等——走默认 */ }
  return 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* 忽略 */ }
  }, [theme]);
  const toggleTheme = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : 'light')), []);
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  return useContext(ThemeContext);
}
