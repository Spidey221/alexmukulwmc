export default function Toast({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white shadow-lg">
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="text-slate-400 hover:text-white" aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
