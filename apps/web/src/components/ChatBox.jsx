import { useState, useRef, useEffect } from "preact/hooks";

export default function ChatBox({ messages, onSend, isLoading, isDisabled }) {
  const [draft, setDraft] = useState("");
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const [isFloating, setIsFloating] = useState(false);
  const [pos, setPos] = useState({ left: null, top: null });
  const [size, setSize] = useState({ width: null, height: null });

  function handleSubmit(event) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isDisabled || isLoading) {
      return;
    }

    onSend(message);
    setDraft("");
  }

  useEffect(() => {
    // auto-expand to floating half-screen when loading/working
    if (isLoading) {
      setIsFloating(true);
    }
  }, [isLoading]);

  useEffect(() => {
    // when floating first becomes true, set default position/size if not set
    if (isFloating && panelRef.current && pos.left == null && pos.top == null) {
      const defaultWidth = Math.min(window.innerWidth * 0.48, 840);
      const defaultHeight = Math.min(window.innerHeight * 0.5, window.innerHeight - 40);
      setSize({ width: defaultWidth, height: defaultHeight });
      setPos({ left: window.innerWidth - defaultWidth - 20, top: window.innerHeight - defaultHeight - 20 });
    }
  }, [isFloating]);

  function handleHeaderClick(event) {
    // toggle floating on header click
    // ignore clicks on the close button
    if (event.target.closest('.chat-close-button')) return;
    setIsFloating(true);
  }

  function handleHeaderPointerDown(e) {
    if (!isFloating) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = panelRef.current.getBoundingClientRect();
    const offsetX = startX - rect.left;
    const offsetY = startY - rect.top;

    function onPointerMove(ev) {
      const nx = ev.clientX - offsetX;
      const ny = ev.clientY - offsetY;
      // clamp to viewport
      const w = panelRef.current.offsetWidth;
      const h = panelRef.current.offsetHeight;
      const clampedX = Math.max(8, Math.min(nx, window.innerWidth - w - 8));
      const clampedY = Math.max(8, Math.min(ny, window.innerHeight - h - 8));
      setPos({ left: clampedX, top: clampedY });
    }

    function onPointerUp() {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    }

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  }

  // sync size after user resizes (read from DOM on pointerup)
  useEffect(() => {
    function onPointerUp() {
      if (!isFloating || !panelRef.current) return;
      const r = panelRef.current.getBoundingClientRect();
      setSize({ width: Math.round(r.width), height: Math.round(r.height) });
    }
    document.addEventListener('pointerup', onPointerUp);
    return () => document.removeEventListener('pointerup', onPointerUp);
  }, [isFloating]);

  return (
    <section
      ref={panelRef}
      className={`chat-box ${isFloating ? 'chat-box-floating' : ''}`}
      data-testid="chat-box"
      style={isFloating && pos.left != null && pos.top != null ? { left: pos.left + 'px', top: pos.top + 'px', width: size.width ? size.width + 'px' : undefined, height: size.height ? size.height + 'px' : undefined } : undefined}
    >
      <div className="section-header" onClick={handleHeaderClick} onPointerDown={handleHeaderPointerDown}>
        <div className="section-icon">
          <span className="lucide" data-lucide="bot" style={{ width: 16, height: 16 }} />
        </div>
        <span className="section-title">Supply Chain AI</span>
        <button
          aria-label="Close floating chat"
          className="chat-close-button"
          onClick={() => setIsFloating(false)}
          title="Restore chat"
        >
          ×
        </button>
      </div>

      <div className="chat-messages" data-testid="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty-inline" data-testid="chat-empty-inline">
            No conversation yet.
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`chat-message ${message.role}`}
              data-testid={`chat-message-${message.role}-${index}`}
            >
              <div className="message-role">
                {message.role === "user" ? "You" : "AI Assistant"}
              </div>
              {message.text}
            </div>
          ))
        )}
        {isLoading && (
          <div className="chat-message assistant" style={{ opacity: 0.7 }}>
            <div className="message-role">AI Assistant</div>
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="spinner" style={{ width: 14, height: 14 }} />
              Thinking...
            </span>
          </div>
        )}
      </div>

      <form className="chat-input-row" onSubmit={handleSubmit}>
        <input
          className="input"
          value={draft}
          onInput={(event) => setDraft(event.currentTarget.value)}
          placeholder={isDisabled ? "Compute a route first..." : "Ask about this scenario..."}
          disabled={isDisabled}
          data-testid="chat-input"
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isDisabled || isLoading || !draft.trim()}
          data-testid="chat-send-button"
        >
          <span className="lucide" data-lucide="send" style={{ width: 16, height: 16 }} />
        </button>
      </form>

      <div className="chat-helper-inline" data-testid="chat-helper-inline">
        Ask Supply Chain AI about delays, risk, or dispatch timing.
      </div>
    </section>
  );
}
