// 测试日当场草稿跨标签同步：归档清盘广播；写入时提示其它标签。不做 OT。

import {
  ownerToken,
  sessionDraftLiveKey,
  type DraftScope,
} from "@/lib/scopedStorage";

const SESSION_DRAFT_CHANNEL = "softball_session_draft";

export type SessionDraftSyncMessage =
  | { type: "cleared"; owner: string }
  | { type: "writing"; owner: string; tabId: string };

function openChannel(): BroadcastChannel | null {
  try {
    return new BroadcastChannel(SESSION_DRAFT_CHANNEL);
  } catch {
    return null;
  }
}

export function createSessionDraftTabId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tab-${Date.now()}`;
}

export function notifySessionDraftCleared(scope: DraftScope): void {
  const channel = openChannel();
  if (!channel) return;
  const message: SessionDraftSyncMessage = {
    type: "cleared",
    owner: ownerToken(scope),
  };
  channel.postMessage(message);
  channel.close();
}

export function notifySessionDraftWriting(
  scope: DraftScope,
  tabId: string
): void {
  const channel = openChannel();
  if (!channel) return;
  const message: SessionDraftSyncMessage = {
    type: "writing",
    owner: ownerToken(scope),
    tabId,
  };
  channel.postMessage(message);
  channel.close();
}

function isSyncMessage(value: unknown): value is SessionDraftSyncMessage {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (row.type === "cleared") {
    return typeof row.owner === "string";
  }
  if (row.type === "writing") {
    return typeof row.owner === "string" && typeof row.tabId === "string";
  }
  return false;
}

export function subscribeSessionDraftSync(
  scope: DraftScope | null,
  tabId: string,
  handlers: {
    onCleared: () => void;
    onPeerWriting?: () => void;
  }
): () => void {
  if (!scope) return () => {};
  const owner = ownerToken(scope);
  const liveKey = sessionDraftLiveKey(scope);

  const handleMessage = (message: SessionDraftSyncMessage) => {
    if (message.owner !== owner) return;
    if (message.type === "cleared") {
      handlers.onCleared();
      return;
    }
    if (message.tabId !== tabId) {
      handlers.onPeerWriting?.();
    }
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key === liveKey && event.newValue === null) {
      handlers.onCleared();
    }
  };
  window.addEventListener("storage", onStorage);

  let channel: BroadcastChannel | null = openChannel();
  if (channel) {
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (isSyncMessage(event.data)) handleMessage(event.data);
    };
  }

  return () => {
    window.removeEventListener("storage", onStorage);
    channel?.close();
    channel = null;
  };
}
