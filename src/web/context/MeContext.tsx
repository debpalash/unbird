import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

export interface MeData {
  id: string;
  username: string;
}

interface MeCtx {
  me: MeData | null;
  lists: any[] | null;
  loading: boolean;
}

const MeContext = createContext<MeCtx>({ me: null, lists: null, loading: true });

export function useMe() {
  return useContext(MeContext);
}

export function MeProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => fetch("/api/me").then(r => r.json()),
    staleTime: Infinity,
    retry: false,
  });

  const { data: listsData } = useQuery({
    queryKey: ["me_lists"],
    queryFn: () => fetch("/api/me/lists").then(r => r.json()),
    staleTime: Infinity,
    retry: false,
    enabled: !!data?.id,
  });

  const me: MeData | null = data?.id ? data : null;
  const lists = listsData?.lists || null;

  return <MeContext.Provider value={{ me, lists, loading: isLoading }}>{children}</MeContext.Provider>;
}
