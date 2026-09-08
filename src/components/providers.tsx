import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { LocaleProvider } from "@/lib/locale";

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <LocaleProvider>
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </LocaleProvider>
    </QueryClientProvider>
  );
}
