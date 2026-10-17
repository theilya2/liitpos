import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

const FALLBACK_MESSAGE = "An unexpected error occurred. Try reloading the page.";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const stack = error instanceof Error && error.stack ? error.stack : "";
  return (
    <main
      className={
        "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center " +
        "bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50"
      }
    >
      <span className="text-red-500" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">
        המסך הזה הוא תקלה, לא הקופה. השורה הבאה היא הסיבה הטכנית.
      </p>
      <p className="max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400">{errorMessage(error)}</p>
      <button
        type="button"
        className="mt-1 h-11 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
        onClick={() => window.location.reload()}
      >
        טעינה מחדש
      </button>
      {stack ? (
        <details className="mt-2 max-w-lg text-start">
          <summary className="cursor-pointer text-sm text-zinc-500">פרטים</summary>
          <pre className="mt-2 max-h-48 overflow-auto text-xs break-words whitespace-pre-wrap text-zinc-500">{stack}</pre>
        </details>
      ) : null}
    </main>
  );
}
