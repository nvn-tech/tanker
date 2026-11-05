// WebSocket connection to the multiplayer server.

// Where the multiplayer server lives. Leave empty to use the same host that
// serves the page (the Node server serves the game too). If you host the page
// somewhere static (e.g. GitHub Pages), put your server address here, like
// 'wss://tanker-server.example.com/ws'. Players can also override it in the menu.
TK.DEFAULT_SERVER = '';

TK.serverUrl = () => {
  try {
    const saved = localStorage.getItem('tanker.server');
    if (saved) return saved;
  } catch (e) { /* storage blocked */ }
  if (TK.DEFAULT_SERVER) return TK.DEFAULT_SERVER;
  if (location.protocol === 'file:' || !location.host) return 'ws://localhost:8080/ws';
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
};

TK.Net = class Net {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.handlers = {};
    this.open = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      let settled = false;
      let ws;
      try { ws = new WebSocket(this.url); } catch (e) { reject(e); return; }
      this.ws = ws;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; try { ws.close(); } catch (e) { /* ignore */ } reject(new Error('timeout')); }
      }, 8000);
      ws.onopen = () => {
        this.open = true;
        if (!settled) { settled = true; clearTimeout(timer); resolve(); }
      };
      ws.onerror = () => {
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error('connect failed')); }
      };
      ws.onclose = () => {
        const was = this.open;
        this.open = false;
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error('closed')); }
        if (was) this.emit('close', {});
      };
      ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch (err) { return; }
        if (m && typeof m.t === 'string') this.emit(m.t, m);
      };
    });
  }

  on(type, fn) { this.handlers[type] = fn; }

  emit(type, msg) {
    const fn = this.handlers[type];
    if (fn) fn(msg);
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  close() {
    this.open = false;
    if (this.ws) { this.ws.onclose = null; try { this.ws.close(); } catch (e) { /* ignore */ } }
    this.ws = null;
  }
};
