import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: App });

function App() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-semibold tracking-wide text-main">Welcome</p>
        <h1 className="text-3xl font-heading">Local RAG starter</h1>
        <p className="text-foreground/80">
          Get set up by downloading an embedding model, then come back for chat
          and documents soon.
        </p>
      </div>

      <Link
        to="/models"
        className="inline-flex items-center justify-center rounded-base bg-main px-4 py-2 text-sm font-medium text-main-foreground outline-transparent transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-border"
        preload="intent"
      >
        Go to Models
      </Link>
    </div>
  );
}
