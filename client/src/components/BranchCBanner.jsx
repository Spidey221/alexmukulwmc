export default function BranchCBanner({ result }) {
  if (!result || !result.all_infeasible) return null;

  const lines = result.explanation.split('\n');
  const headline = lines.find((l) => l.startsWith('⚠')) ?? '⚠ All three options miss the deadline.';

  return (
    <div className="rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
      {headline}
    </div>
  );
}
