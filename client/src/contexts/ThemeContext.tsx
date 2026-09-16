import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * A escolha de quem usa: claro, escuro, ou acompanhar o aparelho. "sistema" é o
 * padrão porque quem trabalha no escuro já configurou isso no computador uma
 * vez, e o portal não deveria discordar dele.
 */
export type ThemeChoice = "claro" | "escuro" | "sistema";
type Theme = "light" | "dark";

const STORAGE_KEY = "rvd-theme";

interface ThemeContextType {
  /** O que a pessoa escolheu. */
  choice: ThemeChoice;
  /** O tema que está valendo agora — "sistema" já resolvido. */
  theme: Theme;
  setChoice: (choice: ThemeChoice) => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function readStoredChoice(fallback: ThemeChoice): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "claro" || stored === "escuro" || stored === "sistema" ? stored : fallback;
  } catch {
    // Navegador com armazenamento bloqueado não pode derrubar a tela inteira.
    return fallback;
  }
}

function systemTheme(): Theme {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({
  children,
  defaultChoice = "sistema",
  switchable = true,
}: {
  children: React.ReactNode;
  defaultChoice?: ThemeChoice;
  switchable?: boolean;
}) {
  const [choice, setChoiceState] = useState<ThemeChoice>(() =>
    switchable ? readStoredChoice(defaultChoice) : defaultChoice
  );
  const [system, setSystem] = useState<Theme>(systemTheme);

  // Em "sistema", trocar o tema do aparelho tem de trocar o do portal na hora,
  // sem recarregar a página.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystem(query.matches ? "dark" : "light");
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const theme: Theme = choice === "sistema" ? system : choice === "escuro" ? "dark" : "light";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const setChoice = (next: ThemeChoice) => {
    setChoiceState(next);
    if (!switchable) return;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // A escolha vale para esta sessão mesmo que não dê para guardar.
    }
  };

  const value = useMemo(() => ({ choice, theme, setChoice, switchable }), [choice, theme, switchable]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme precisa estar dentro do ThemeProvider");
  return context;
}
