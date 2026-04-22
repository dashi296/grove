import { appName } from "@grove/core";

export function ShellCard() {
  return (
    <div
      style={{
        maxWidth: "40rem",
        padding: "2rem",
        borderRadius: "1.5rem",
        backgroundColor: "var(--color-shell-card-bg)",
        boxShadow: "var(--shadow-shell-card)",
      }}
    >
      <p style={{ margin: 0, letterSpacing: "0.12em", textTransform: "uppercase" }}>
        Desktop Shell
      </p>
      <h1 style={{ marginBottom: "0.75rem", fontSize: "2.5rem" }}>{appName}</h1>
      <p style={{ margin: 0, lineHeight: 1.6 }}>
        Tauri v2 and React are wired into the monorepo so later desktop feature slices can land on a
        stable shell.
      </p>
    </div>
  );
}
