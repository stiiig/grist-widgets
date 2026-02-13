const CHANNEL_NAME = "grist-widgets-dev";

type Payload =
  | { type: "log"; msg: string; ts: number }
  | { type: "applyUserActions"; actions: any[]; ts: number };

function ts() {
  return Date.now();
}

export function postLog(msg: string) {
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.postMessage({ type: "log", msg, ts: ts() } satisfies Payload);
    ch.close();
  } catch {
    // ignore
  }
}

export function postApplyUserActions(actions: any[]) {
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.postMessage({ type: "applyUserActions", actions, ts: ts() } satisfies Payload);
    ch.close();
  } catch {
    // ignore
  }
}

export function listenDevChannel(onMessage: (p: any) => void): () => void {
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.onmessage = (ev) => onMessage(ev.data);
    return () => ch.close();
  } catch {
    return () => {};
  }
}