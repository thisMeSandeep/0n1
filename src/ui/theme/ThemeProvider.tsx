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

type ThemeProviderProps = {
  children: ReactNode;
  initialPreference?: ThemePreference;
  /** Called when the user picks a theme, e.g. to save it. */
  onPreferenceChange?: (preference: ThemePreference) => void;
};

/** Follows the OS colour scheme unless the user picks light or dark. */
export function ThemeProvider({
  children,
  initialPreference = "system",
  onPreferenceChange,
}: ThemeProviderProps) {
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);
  const systemPrefersDark = useMediaQuery(DARK_SCHEME_QUERY);
  const resolved = resolveTheme(preference, systemPrefersDark);

  useLayoutEffect(() => {
    applyTheme(document.documentElement, resolved);
  }, [resolved]);

  const value = useMemo(
    () => ({
      preference,
      resolved,
      setPreference: (next: ThemePreference) => {
        setPreferenceState(next);
        onPreferenceChange?.(next);
      },
    }),
    [preference, resolved, onPreferenceChange],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>");
  return value;
}
