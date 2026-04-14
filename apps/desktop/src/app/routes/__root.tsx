import { Outlet } from "@tanstack/react-router";

export function RootRoute() {
  return (
    <main
      style={{
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        margin: 0,
        minHeight: "100vh",
      }}
    >
      <Outlet />
    </main>
  );
}
