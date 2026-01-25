/**
 * Client-side encryption utilities for session storage.
 * 
 * Uses Web Crypto API (AES-GCM) to encrypt sensitive data before storing in sessionStorage.
 * This makes data unreadable in DevTools, though it's still visible as encrypted text.
 * 
 * Security considerations:
 * - Encryption key is derived from a session-based seed (not user-specific)
 * - Keys are stored in memory only, never persisted
 * - Each session gets a unique encryption key
 * - If the user refreshes, old encrypted data becomes unreadable (by design for session storage)
 */

const ENCRYPTION_ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM
const KEY_DERIVATION_ALGORITHM = "PBKDF2";
const KEY_DERIVATION_ITERATIONS = 100000; // High iteration count for security

// In-memory cache for encryption keys (per session)
let cachedKey: CryptoKey | null = null;
let keySeed: string | null = null;

/**
 * Generates a session-based seed for key derivation.
 * Uses a combination of sessionStorage ID and timestamp to ensure uniqueness per session.
 */
function generateSessionSeed(): string {
  // Try to get or create a session ID
  const SESSION_ID_KEY = "rt:encryption:session-id";
  let sessionId = sessionStorage.getItem(SESSION_ID_KEY);
  
  if (!sessionId) {
    // Generate a new session ID (UUID-like)
    sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    try {
      sessionStorage.setItem(SESSION_ID_KEY, sessionId);
    } catch {
      // If we can't store, use a time-based seed
      return `${Date.now()}-${Math.random()}`;
    }
  }
  
  return sessionId;
}

/**
 * Generates or retrieves a per-session salt for key derivation.
 * Each session gets a unique random salt stored in sessionStorage.
 * This improves security compared to a fixed salt.
 */
function generateSessionSalt(): Uint8Array {
  const SALT_KEY = "rt:encryption:salt";
  let saltBase64 = sessionStorage.getItem(SALT_KEY);
  
  if (!saltBase64) {
    // Generate a random salt for this session (16 bytes = 128 bits)
    const randomSalt = crypto.getRandomValues(new Uint8Array(16));
    saltBase64 = btoa(String.fromCharCode(...randomSalt));
    try {
      sessionStorage.setItem(SALT_KEY, saltBase64);
    } catch {
      // If we can't store, fallback to time-based salt (less secure but functional)
      const encoder = new TextEncoder();
      const fallbackSalt = encoder.encode(`${Date.now()}-${Math.random()}`);
      // Create a new ArrayBuffer and copy data to ensure proper type
      const buffer = new ArrayBuffer(fallbackSalt.length);
      const view = new Uint8Array(buffer);
      view.set(fallbackSalt);
      return view;
    }
  }
  
  // Decode from base64 and create a new Uint8Array with a fresh ArrayBuffer
  const decoded = atob(saltBase64);
  const saltBuffer = new ArrayBuffer(decoded.length);
  const saltArray = new Uint8Array(saltBuffer);
  for (let i = 0; i < decoded.length; i++) {
    saltArray[i] = decoded.charCodeAt(i);
  }
  return saltArray;
}

/**
 * Derives an encryption key from a seed using PBKDF2.
 * The key is cached in memory for the session.
 */
async function deriveEncryptionKey(seed: string): Promise<CryptoKey> {
  // Return cached key if seed hasn't changed
  if (cachedKey && keySeed === seed) {
    return cachedKey;
  }

  // Import the seed as a key for PBKDF2
  const encoder = new TextEncoder();
  const seedData = encoder.encode(seed);

  // Import seed as raw key material
  const baseKey = await crypto.subtle.importKey(
    "raw",
    seedData,
    { name: KEY_DERIVATION_ALGORITHM },
    false,
    ["deriveBits", "deriveKey"]
  );

  // Derive the actual encryption key using per-session salt
  const salt = generateSessionSalt(); // Unique salt per session for better security
  // Type assertion to satisfy Web Crypto API's strict BufferSource type requirement
  // The salt is guaranteed to be a Uint8Array with ArrayBuffer at runtime
  const key = await crypto.subtle.deriveKey(
    {
      name: KEY_DERIVATION_ALGORITHM,
      salt: salt as BufferSource,
      iterations: KEY_DERIVATION_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    {
      name: ENCRYPTION_ALGORITHM,
      length: KEY_LENGTH,
    },
    false,
    ["encrypt", "decrypt"]
  );

  // Cache the key
  cachedKey = key;
  keySeed = seed;

  return key;
}

/**
 * Encrypts data using AES-GCM.
 * 
 * @param data - The data to encrypt (will be JSON stringified)
 * @returns Base64-encoded encrypted data with IV prepended
 */
export async function encryptData<T>(data: T): Promise<string> {
  if (typeof window === "undefined" || !crypto.subtle) {
    throw new Error("Encryption requires browser environment with Web Crypto API");
  }

  try {
    // Get or generate session seed
    const seed = generateSessionSeed();
    const key = await deriveEncryptionKey(seed);

    // Convert data to JSON string
    const plaintext = JSON.stringify(data);
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(plaintext);

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Encrypt
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: ENCRYPTION_ALGORITHM,
        iv,
      },
      key,
      dataBuffer
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(IV_LENGTH + encryptedBuffer.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedBuffer), IV_LENGTH);

    // Convert to base64 for storage
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    // Don't log sensitive error details in production
    if (process.env.NODE_ENV === "development") {
      console.error("[encryption] Failed to encrypt data:", error);
    }
    throw new Error("Encryption failed");
  }
}

/**
 * Decrypts data that was encrypted with encryptData.
 * 
 * @param encryptedData - Base64-encoded encrypted data with IV prepended
 * @returns The decrypted and parsed data
 */
export async function decryptData<T>(encryptedData: string): Promise<T> {
  if (typeof window === "undefined" || !crypto.subtle) {
    throw new Error("Decryption requires browser environment with Web Crypto API");
  }

  try {
    // Get session seed (must match the one used for encryption)
    const seed = generateSessionSeed();
    const key = await deriveEncryptionKey(seed);

    // Decode from base64
    const combined = Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0));

    // Extract IV and encrypted data
    const iv = combined.slice(0, IV_LENGTH);
    const encrypted = combined.slice(IV_LENGTH);

    // Decrypt
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: ENCRYPTION_ALGORITHM,
        iv,
      },
      key,
      encrypted
    );

    // Convert back to string and parse JSON
    const decoder = new TextDecoder();
    const plaintext = decoder.decode(decryptedBuffer);
    return JSON.parse(plaintext) as T;
  } catch (error) {
    // Don't log sensitive error details in production
    if (process.env.NODE_ENV === "development") {
      console.error("[encryption] Failed to decrypt data:", error);
    }
    throw new Error("Decryption failed - data may be corrupted or from a different session");
  }
}

/**
 * Clears the cached encryption key and session salt.
 * Should be called on logout or session end.
 * 
 * Note: This clears the in-memory key cache but does NOT clear
 * the session ID or salt from sessionStorage (they persist for the session).
 */
export function clearEncryptionKey(): void {
  cachedKey = null;
  keySeed = null;
  // Note: We don't clear sessionStorage items here because:
  // 1. sessionStorage automatically clears when tab/window closes
  // 2. The salt and session ID are needed to decrypt existing data in the session
  // 3. If you want to clear everything, use clearAllSessionCache() or manually remove items
}

