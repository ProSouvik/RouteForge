export default function ReasoningCard({ reasoning, onRefresh, canRefresh, isRefreshing }) {
  return (
    <section className="reasoning-card" data-testid="reasoning-card">
      <div className="section-header">
        <div className="section-icon amber">
          <span className="lucide" data-lucide="lightbulb" style={{ width: 16, height: 16 }} />
        </div>
        <span className="section-title breathing-text">AI Reasoning</span>
        <button
          type="button"
          className="btn btn-subtle btn-sm"
          onClick={onRefresh}
          disabled={!canRefresh || isRefreshing}
          data-testid="refresh-reasoning-button"
        >
          {isRefreshing ? "Refreshing..." : "Refresh reasoning"}
        </button>
      </div>
      <p className="reasoning-copy">
        {reasoning || "Compute a route and select live disruptions to see alternate-route reasoning."}
      </p>
    </section>
  );
}
