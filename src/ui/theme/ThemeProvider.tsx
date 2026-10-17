import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { useMediaQuery } from "../hooks/useMediaQuery.ts";
import {
  applyTheme,
  DARK_SCHEME_QUERY,
  type ResolvedTheme,
  resolveTheme,
  type ThemePreference,
} from "./theme.ts";

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Follows the OS colour scheme unless the user picks light or dark.
 * The override lives in memory for now; it is persisted in S16.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const systemPrefersDark = useMediaQuery(DARK_SCHEME_QUERY);
  const resolved = resolveTheme(preference, systemPrefersDark);

  useLayoutEffect(() => {
    applyTheme(document.documentElement, resolved);
  }, [resolved]);

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>");
  return value;
}
