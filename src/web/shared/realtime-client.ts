export function connectRealtime(): WebSocket {
  return new WebSocket(`ws:///ws`);
}
