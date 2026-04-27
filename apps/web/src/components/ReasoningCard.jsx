import { useEffect, useState } from "preact/hooks";

export default function ReasoningCard({ reasoning, onRefresh, canRefresh, isRefreshing }) {
  const summary =
    reasoning ||
    "Compute a route and select disruptions to generate a scenario-aware operational summary.";
  const isLongSummary = summary.length > 140;
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setIsExpanded(false);
  }, [summary]);

  return (
    <section className="reasoning-card" data-testid="reasoning-card">
      {visible ? (
        <div
          ref={panelRef}
          className={`floating-flash ${closing ? 'closing' : ''}`}
          role="dialog"
          aria-live="polite"
          style={pos.left != null && pos.top != null ? { left: pos.left + 'px', top: pos.top + 'px', transform: 'none', width: size.width ? size.width + 'px' : undefined, height: size.height ? size.height + 'px' : undefined } : undefined}
        >
          <div className="floating-flash-header" onPointerDown={onHeaderPointerDown}>
            <div className="floating-flash-title">AI Summary</div>
            <button aria-label="Close summary" className="floating-flash-close" onClick={closeWindow}>×</button>
          </div>
          <div className="floating-flash-body">{msg}</div>
        </div>
      ) : null}

      <div className="section-header">
        <div className="section-icon amber">
          <span className="lucide" data-lucide="lightbulb" style={{ width: 16, height: 16 }} />
        </div>
        <span className="section-title">AI Summary</span>
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
      <p className={`reasoning-copy ${isExpanded ? "expanded" : "collapsed"}`}>
        {summary}
      </p>
      {isLongSummary ? (
        <button
          type="button"
          className="reasoning-expand-button"
          onClick={() => setIsExpanded((current) => !current)}
          data-testid="reasoning-expand-button"
        >
          {isExpanded ? "Show less" : "...click to view more"}
        </button>
      ) : null}
    </section>
  );
}
