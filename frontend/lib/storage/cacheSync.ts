"use client";

type CacheSyncMessage = 
  | { type: "cache-updated"; key: string; timestamp: number }
  | { type: "cache-removed"; key: string }
  | { type: "cache-restored"; key: string; timestamp: number };

type CacheSyncHandler = (message: CacheSyncMessage) => void;

class CacheSyncManager {
  private channel: BroadcastChannel | null = null;
  private handlers: Set<CacheSyncHandler> = new Set();
  private isSupported: boolean;

  constructor() {
    this.isSupported = typeof window !== "undefined" && "BroadcastChannel" in window;
    if (this.isSupported) {
      try {
        this.channel = new BroadcastChannel("roundtable-cache-sync");
        this.channel.addEventListener("message", this.handleMessage);
        this.channel.addEventListener("messageerror", (event) => {
          console.warn("[cacheSync] Message error:", event);
        });
      } catch (error) {
        console.warn("[cacheSync] Failed to create BroadcastChannel:", error);
        this.isSupported = false;
      }
    }
  }

  private handleMessage = (event: MessageEvent<CacheSyncMessage>) => {
    // Ignore messages from the same tab (they're already handled locally)
    // We can't easily detect same-tab, but we can check if the message is recent
    // and assume it's from another tab if it's not from our own recent actions
    
    for (const handler of this.handlers) {
      try {
        handler(event.data);
      } catch (error) {
        console.error("[cacheSync] Error in handler:", error);
      }
    }
  };

  /**
   * Broadcast that a cache entry was updated
   */
  broadcastUpdate(key: string, timestamp: number): void {
    if (!this.isSupported || !this.channel) {
      return;
    }

    try {
      this.channel.postMessage({
        type: "cache-updated",
        key,
        timestamp,
      } as CacheSyncMessage);
    } catch (error) {
      console.warn("[cacheSync] Failed to broadcast update:", error);
    }
  }

  /**
   * Broadcast that a cache entry was removed
   */
  broadcastRemove(key: string): void {
    if (!this.isSupported || !this.channel) {
      return;
    }

    try {
      this.channel.postMessage({
        type: "cache-removed",
        key,
      } as CacheSyncMessage);
    } catch (error) {
      console.warn("[cacheSync] Failed to broadcast remove:", error);
    }
  }

  /**
   * Broadcast that a cache entry was restored
   */
  broadcastRestore(key: string, timestamp: number): void {
    if (!this.isSupported || !this.channel) {
      return;
    }

    try {
      this.channel.postMessage({
        type: "cache-restored",
        key,
        timestamp,
      } as CacheSyncMessage);
    } catch (error) {
      console.warn("[cacheSync] Failed to broadcast restore:", error);
    }
  }

  /**
   * Subscribe to cache sync events
   */
  subscribe(handler: CacheSyncHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.channel) {
      this.channel.removeEventListener("message", this.handleMessage);
      this.channel.close();
      this.channel = null;
    }
    this.handlers.clear();
  }
}

// Singleton instance
let syncManager: CacheSyncManager | null = null;

export function getCacheSyncManager(): CacheSyncManager {
  if (!syncManager) {
    syncManager = new CacheSyncManager();
  }
  return syncManager;
}

/**
 * Hook to use cache sync in React components
 * Note: This is a utility function, not a React hook.
 * Components should use getCacheSyncManager().subscribe() directly in useEffect.
 */
export function useCacheSync(handler: CacheSyncHandler): (() => void) | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const manager = getCacheSyncManager();
  const unsubscribe = manager.subscribe(handler);
  
  return unsubscribe;
}

