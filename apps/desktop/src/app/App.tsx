import { ShellCard } from "../shared/ui/ShellCard";

export function App() {
  return (
    <main
      style={{
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        minHeight: "100vh",
        margin: 0,
        padding: "3rem",
        background:
          "radial-gradient(circle at top left, rgba(151, 196, 89, 0.28), transparent 34%), #f5f1e8",
        color: "#27500A",
      }}
    >
      <ShellCard />
    </main>
  );
}
