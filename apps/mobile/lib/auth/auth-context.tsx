import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getSupabaseClient, registerSessionAutoRefresh } from "./supabase";

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
}

const AuthContext = createContext<AuthContextValue>({
  configured: false,
  loading: true,
  session: null,
});

export function AuthProvider({ children }: PropsWithChildren) {
  const supabase = getSupabaseClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const auth = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    const unregisterRefresh = registerSessionAutoRefresh(supabase);
    return () => {
      auth.data.subscription.unsubscribe();
      unregisterRefresh();
    };
  }, [supabase]);

  const value = useMemo(
    () => ({ configured: Boolean(supabase), loading, session }),
    [loading, session, supabase],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
