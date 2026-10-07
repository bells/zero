(() => {
  const session = Object.freeze(__ZERO_SESSION_BINDING__);
  const invoke = window.__TAURI_INTERNALS__.invoke;
  Object.defineProperty(window, '__ZERO_PLUGIN_TRANSPORT__', {
    value: Object.freeze({
      session,
      ready: () => invoke('plugin_session_ready', {input: {sessionId: session.sessionId, generation: session.generation}}),
      request: request => invoke('plugin_invoke', {input: {request}}),
      cancel: request => invoke('plugin_cancel', {input: {request}}),
    }), writable: false, configurable: false,
  });
})();
