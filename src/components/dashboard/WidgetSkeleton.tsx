export function WidgetSkeleton() {
  return (
    <div className="rounded-lg border border-white/8 bg-card p-5 animate-pulse">
      <div className="flex items-center justify-between mb-5">
        <div className="h-3 w-24 bg-white/8 rounded" />
        <div className="h-3 w-3 bg-white/8 rounded" />
      </div>
      <div className="h-9 w-16 bg-white/8 rounded mb-4" />
      <div className="space-y-2">
        <div className="h-3 bg-white/5 rounded" />
        <div className="h-3 bg-white/5 rounded w-4/5" />
        <div className="h-3 bg-white/5 rounded w-3/5" />
      </div>
    </div>
  );
}
