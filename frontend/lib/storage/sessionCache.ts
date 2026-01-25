/**
 * Options for session cache operations.
 * 
 * @property version - Optional version number for cache invalidation
 * @property ttlMs - Optional time-to-live in milliseconds
 * @property encrypt - If true, encrypt data before storing (default: false)
 *                    When enabled, data is encrypted using AES-GCM before storage.
 *                    This makes data unreadable in DevTools, though encrypted text is still visible.
 */
type CacheOptions = {
  version?: number;
  ttlMs?: number;
  encrypt?: boolean;
};

/**
 * Cache entry structure stored in sessionStorage.
 * 
 * When encryption is enabled, the `data` field contains encrypted data (base64 string)
 * instead of the actual data object.
 */
type CacheEntry<T> = {
  data: T | string; // T when unencrypted, string (base64) when encrypted
  version: number;
  timestamp: number;
  ttlMs?: number;
  encrypted?: boolean; // Flag to indicate if data is encrypted
};

export type CacheReadResult<T> = 
  | { success: true; data: T; timestamp: number }
  | { success: false; reason: "not_found" | "version_mismatch" | "expired" | "parse_error" | "decryption_error" | "storage_unavailable"; cachedVersion?: number; expectedVersion?: number; error?: Error };

export type CacheWriteResult = 
  | { success: true }
  | { success: false; reason: "quota_exceeded" | "storage_unavailable" | "serialization_error" | "encryption_error"; error?: Error };

function getCacheKey(key: string): string {
  return `rt:cache:${key}`;
}

/**
 * Lazy import encryption utilities to avoid loading if not needed.
 */
async function getEncryptionUtils() {
  return await import("./encryption");
}

/**
 * Reads data from session cache (synchronous version for backward compatibility).
 * 
 * **Security Note:** By default, data is stored unencrypted and is visible in browser DevTools.
 * This sync version does NOT support encryption. For encryption, use readSessionCacheAsync.
 * 
 * @param key - Cache key
 * @param options - Cache options (encryption not supported in sync version)
 * @returns Cached data or null if not found/invalid
 */
export function readSessionCache<T>(key: string, options: Omit<CacheOptions, "encrypt"> = {}): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.sessionStorage.getItem(getCacheKey(key));
    if (!stored) {
      return null;
    }

    const entry = JSON.parse(stored) as CacheEntry<T>;

    // Check version
    if (options.version !== undefined && entry.version !== options.version) {
      window.sessionStorage.removeItem(getCacheKey(key));
      return null;
    }

    // Check TTL
    if (entry.ttlMs !== undefined) {
      const age = Date.now() - entry.timestamp;
      if (age > entry.ttlMs) {
        window.sessionStorage.removeItem(getCacheKey(key));
        return null;
      }
    }

    // If encrypted, return null (can't decrypt synchronously)
    if (entry.encrypted) {
      console.warn(`[sessionCache] Encrypted data found for key "${key}" but sync readSessionCache cannot decrypt. Use readSessionCacheAsync instead.`);
      return null;
    }

    return entry.data as T;
  } catch (error) {
    console.error(`[sessionCache] Failed to read cache for key "${key}":`, error);
    return null;
  }
}

/**
 * Reads data from session cache (async version with encryption support).
 * 
 * **Security Note:** By default, data is stored unencrypted and is visible in browser DevTools.
 * To encrypt sensitive data, set `options.encrypt = true`.
 * 
 * @param key - Cache key
 * @param options - Cache options including optional encryption
 * @returns Cached data or null if not found/invalid
 */
export async function readSessionCacheAsync<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
  const result = await readSessionCacheWithDetails<T>(key, options);
  return result.success ? result.data : null;
}

/**
 * Reads data from session cache with detailed result information.
 * 
 * Supports both encrypted and unencrypted data. If data was stored encrypted,
 * it will be automatically decrypted. Handles backward compatibility with
 * unencrypted data.
 * 
 * @param key - Cache key
 * @param options - Cache options including optional encryption flag
 * @returns Detailed result with success status and data or error information
 */
export async function readSessionCacheWithDetails<T>(key: string, options: CacheOptions = {}): Promise<CacheReadResult<T>> {
  if (typeof window === "undefined") {
    return { success: false, reason: "storage_unavailable" as const };
  }

  try {
    const stored = window.sessionStorage.getItem(getCacheKey(key));
    if (!stored) {
      return { success: false, reason: "not_found" };
    }

    const entry = JSON.parse(stored) as CacheEntry<T>;

    // Check version
    if (options.version !== undefined && entry.version !== options.version) {
      window.sessionStorage.removeItem(getCacheKey(key));
      return {
        success: false,
        reason: "version_mismatch",
        cachedVersion: entry.version,
        expectedVersion: options.version,
      };
    }

    // Check TTL
    if (entry.ttlMs !== undefined) {
      const age = Date.now() - entry.timestamp;
      if (age > entry.ttlMs) {
        window.sessionStorage.removeItem(getCacheKey(key));
        return { success: false, reason: "expired" };
      }
    }

    // Handle decryption if data is encrypted
    let data: T;
    if (entry.encrypted) {
      try {
        const { decryptData } = await getEncryptionUtils();
        data = await decryptData<T>(entry.data as string);
      } catch (error) {
        console.error(`[sessionCache] Failed to decrypt cache for key "${key}":`, error);
        return {
          success: false,
          reason: "decryption_error",
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    } else {
      // Unencrypted data (backward compatibility)
      data = entry.data as T;
    }

    return { success: true, data, timestamp: entry.timestamp };
  } catch (error) {
    console.error(`[sessionCache] Failed to read cache for key "${key}":`, error);
    return { 
      success: false, 
      reason: "parse_error",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Writes data to session cache (synchronous version for backward compatibility).
 * 
 * **Security Note:** By default, data is stored unencrypted and visible in browser DevTools.
 * This sync version does NOT support encryption. For encryption, use writeSessionCacheAsync.
 * 
 * @param key - Cache key
 * @param data - Data to cache
 * @param options - Cache options (encryption not supported in sync version)
 * @returns Write result with success status or error information
 */
export function writeSessionCache<T>(
  key: string,
  data: T,
  options: Omit<CacheOptions, "encrypt"> = {}
): CacheWriteResult {
  if (typeof window === "undefined") {
    return { success: false, reason: "storage_unavailable" };
  }

  const entry: CacheEntry<T> = {
    data,
    version: options.version ?? 1,
    timestamp: Date.now(),
    ttlMs: options.ttlMs,
    encrypted: false,
  };

  try {
    window.sessionStorage.setItem(getCacheKey(key), JSON.stringify(entry));
    return { success: true };
  } catch (error) {
    console.error(`[sessionCache] Failed to write cache for key "${key}":`, error);
    
    // Handle quota exceeded errors (same as async version)
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      console.warn("[sessionCache] Storage quota exceeded, clearing old entries");
      const keys = Object.keys(window.sessionStorage);
      const cacheKeys = keys.filter((k) => k.startsWith("rt:cache:"));
      
      if (cacheKeys.length > 0) {
        let oldestKey: string | null = null;
        let oldestTimestamp = Infinity;
        
        for (const cacheKey of cacheKeys) {
          try {
            const stored = window.sessionStorage.getItem(cacheKey);
            if (stored) {
              const cachedEntry = JSON.parse(stored) as CacheEntry<unknown>;
              if (cachedEntry.timestamp < oldestTimestamp) {
                oldestTimestamp = cachedEntry.timestamp;
                oldestKey = cacheKey;
              }
            }
          } catch {
            oldestKey = cacheKey;
            break;
          }
        }
        
        if (oldestKey) {
          window.sessionStorage.removeItem(oldestKey);
          try {
            window.sessionStorage.setItem(getCacheKey(key), JSON.stringify(entry));
            return { success: true };
          } catch {
            return {
              success: false,
              reason: "quota_exceeded",
              error: error instanceof Error ? error : new Error(String(error)),
            };
          }
        }
      }
      
      return {
        success: false,
        reason: "quota_exceeded",
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
    
    if (error instanceof Error && error.message.includes("JSON")) {
      return {
        success: false,
        reason: "serialization_error",
        error,
      };
    }
    
    return {
      success: false,
      reason: "storage_unavailable",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Writes data to session cache (async version with encryption support).
 * 
 * **Security Note:** By default, data is stored unencrypted and visible in browser DevTools.
 * Set `options.encrypt = true` to encrypt sensitive data before storage.
 * 
 * When encryption is enabled:
 * - Data is encrypted using AES-GCM before storage
 * - Encrypted data is still visible in DevTools but unreadable
 * - Encryption key is session-based and stored in memory only
 * - Data encrypted in one session cannot be decrypted in another session
 * 
 * @param key - Cache key
 * @param data - Data to cache
 * @param options - Cache options including optional encryption
 * @returns Write result with success status or error information
 */
export async function writeSessionCacheAsync<T>(
  key: string,
  data: T,
  options: CacheOptions = {}
): Promise<CacheWriteResult> {
  if (typeof window === "undefined") {
    return { success: false, reason: "storage_unavailable" };
  }

  try {
    let dataToStore: T | string = data;
    let encrypted = false;

    // Encrypt data if requested
    if (options.encrypt) {
      try {
        const { encryptData } = await getEncryptionUtils();
        dataToStore = await encryptData(data);
        encrypted = true;
      } catch (error) {
        console.error(`[sessionCache] Failed to encrypt cache for key "${key}":`, error);
        return {
          success: false,
          reason: "encryption_error",
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    }

    const entry: CacheEntry<T> = {
      data: dataToStore,
      version: options.version ?? 1,
      timestamp: Date.now(),
      ttlMs: options.ttlMs,
      encrypted,
    };

    window.sessionStorage.setItem(getCacheKey(key), JSON.stringify(entry));
    return { success: true };
  } catch (error) {
    console.error(`[sessionCache] Failed to write cache for key "${key}":`, error);
    
    // Handle quota exceeded errors
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      console.warn("[sessionCache] Storage quota exceeded, clearing old entries");
      // Clear oldest entries (simple implementation - find oldest by timestamp)
      const keys = Object.keys(window.sessionStorage);
      const cacheKeys = keys.filter((k) => k.startsWith("rt:cache:"));
      
      if (cacheKeys.length > 0) {
        // Find oldest entry by reading timestamps
        let oldestKey: string | null = null;
        let oldestTimestamp = Infinity;
        
        for (const cacheKey of cacheKeys) {
          try {
            const stored = window.sessionStorage.getItem(cacheKey);
            if (stored) {
              const entry = JSON.parse(stored) as CacheEntry<unknown>;
              if (entry.timestamp < oldestTimestamp) {
                oldestTimestamp = entry.timestamp;
                oldestKey = cacheKey;
              }
            }
          } catch {
            // If we can't parse, just use this key
            oldestKey = cacheKey;
            break;
          }
        }
        
        if (oldestKey) {
          window.sessionStorage.removeItem(oldestKey);
          // Retry once - need to re-encrypt if needed
          try {
            let dataToStore: T | string = data;
            let encrypted = false;

            if (options.encrypt) {
              try {
                const { encryptData } = await getEncryptionUtils();
                dataToStore = await encryptData(data);
                encrypted = true;
              } catch (encryptError) {
                return {
                  success: false,
                  reason: "encryption_error",
                  error: encryptError instanceof Error ? encryptError : new Error(String(encryptError)),
                };
              }
            }

            const retryEntry: CacheEntry<T> = {
              data: dataToStore,
              version: options.version ?? 1,
              timestamp: Date.now(),
              ttlMs: options.ttlMs,
              encrypted,
            };
            window.sessionStorage.setItem(getCacheKey(key), JSON.stringify(retryEntry));
            return { success: true };
          } catch (retryError) {
            return {
              success: false,
              reason: "quota_exceeded",
              error: retryError instanceof Error ? retryError : new Error(String(retryError)),
            };
          }
        }
      }
      
      return {
        success: false,
        reason: "quota_exceeded",
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
    
    // Handle other errors
    if (error instanceof Error && error.message.includes("JSON")) {
      return {
        success: false,
        reason: "serialization_error",
        error,
      };
    }
    
    return {
      success: false,
      reason: "storage_unavailable",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

export function removeSessionCache(key: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(getCacheKey(key));
  } catch (error) {
    console.error(`[sessionCache] Failed to remove cache for key "${key}":`, error);
  }
}

export function clearAllSessionCache(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const keys = Object.keys(window.sessionStorage);
    const cacheKeys = keys.filter((k) => k.startsWith("rt:cache:"));
    cacheKeys.forEach((key) => window.sessionStorage.removeItem(key));
  } catch (error) {
    console.error("[sessionCache] Failed to clear all cache:", error);
  }
}
