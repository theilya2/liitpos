const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"] as const;

export function Numpad({ onKey, fill = false }: { onKey: (key: string) => void; fill?: boolean }) {
  return (
    <div className={fill ? "numpad numpad-fill" : "numpad"} dir="ltr">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onKey(key === "⌫" ? "back" : key)}
          className="numpad-key bg-paper text-ink ring-1 ring-line transition-transform duration-150 active:scale-95"
        >
          {key}
        </button>
      ))}
    </div>
  );
}
