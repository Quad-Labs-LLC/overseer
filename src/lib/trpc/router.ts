import { router } from "./trpc";
import { providersRouter } from "./routers/providers";
import { systemRouter } from "./routers/system";
import { analyticsRouter } from "./routers/analytics";

export const appRouter = router({
  providers: providersRouter,
  system: systemRouter,
  analytics: analyticsRouter,
});

export type AppRouter = typeof appRouter;
