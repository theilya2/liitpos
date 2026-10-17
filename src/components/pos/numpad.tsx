const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"] as const;

export function Numpad({ onKey, fill = false }: { onKey: (key: string) => void; fill?: boolean }) {
  return (
    <div className={fill ? "grid h-full min-h-0 grid-cols-3 grid-rows-4 gap-2" : "grid grid-cols-3 gap-2"} dir="ltr">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onKey(key === "⌫" ? "back" : key)}
          className={`${fill ? "h-full min-h-12 text-base" : "h-12 text-lg"} rounded-xl bg-paper font-semibold text-ink ring-1 ring-line transition-transform duration-150 active:scale-95`}
        >
          {key}
        </button>
      ))}
    </div>
  );
}
