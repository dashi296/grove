import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";

import { HomeRoute } from "./routes";
import { RootRoute } from "./routes/__root";

const rootRoute = createRootRoute({
  component: RootRoute,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomeRoute,
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({
  routeTree,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
