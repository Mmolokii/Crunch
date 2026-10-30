import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { CSP_NONCE_HEADER } from "./lib/csp-nonce";
import { routeTree } from "./routeTree.gen";

// The per-request CSP nonce (CRU-39). On the server it comes from the header
// src/server.ts sets; in the browser, from the nonce on the server-rendered
// scripts, so client renders stamp the same value and hydration matches.
const getCspNonce = createIsomorphicFn()
  .server(() => getRequest().headers.get(CSP_NONCE_HEADER) ?? undefined)
  .client(
    () => (document.querySelector("script[nonce]") as HTMLScriptElement | null)?.nonce || undefined,
  );

export const getRouter = () => {
  const queryClient = new QueryClient();
  const nonce = getCspNonce();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    ...(nonce ? { ssr: { nonce } } : {}),
  });

  return router;
};
