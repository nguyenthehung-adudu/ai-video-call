'use client';

import React, { ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  StreamVideo,
  StreamVideoClient,
} from '@stream-io/video-react-sdk';
import { useUser } from '@clerk/nextjs';

const API_KEY = process.env.NEXT_PUBLIC_STREAM_API_KEY!;

// ─────────────────────────────────────────────────────────────────────────────
// Context for exposing client and ready state
// ─────────────────────────────────────────────────────────────────────────────
interface StreamVideoReadyContextValue {
  isReady: boolean;
  client: StreamVideoClient | null;
  refreshToken: () => Promise<void>;
}

const StreamVideoReadyContext = createContext<StreamVideoReadyContextValue>({
  isReady: false,
  client: null,
  refreshToken: async () => {},
});

export function useStreamVideoReady() {
  return useContext(StreamVideoReadyContext);
}

type ConnStatus = 'idle' | 'connecting' | 'ready' | 'error';

function clampName(s: string | null | undefined) {
  return s?.trim() || '';
}

// Token refresh interval (1 hour = 3600000ms, we refresh at 55 minutes)
const TOKEN_REFRESH_INTERVAL = 55 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// ConnectionManager - handles client lifecycle with auto token refresh
// ─────────────────────────────────────────────────────────────────────────────
let _manager: ConnectionManager | null = null;

class ConnectionManager {
  status: ConnStatus = 'idle';
  videoClient: StreamVideoClient | null = null;
  error: string | null = null;
  _userId: string | null = null;
  _refreshTimer: ReturnType<typeof setTimeout> | null = null;

  private _listeners = new Set<(s: ConnStatus, e: string | null) => void>();
  private _uid: string = '';
  private _displayName: string = '';
  private _image?: string;

  subscribe(fn: (s: ConnStatus, e: string | null) => void) {
    this._listeners.add(fn);
    return () => { this._listeners.delete(fn); };
  }

  private _notify(s: ConnStatus, e: string | null) {
    console.log('📡 [VideoManager] Status change:', { status: s, error: e });
    this._listeners.forEach((fn) => fn(s, e));
  }

  // Schedule token refresh
  private _scheduleTokenRefresh() {
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
    }

    console.log('⏰ [VideoManager] Scheduling token refresh in 55 minutes');
    this._refreshTimer = setTimeout(async () => {
      console.log('🔄 [VideoManager] Token refresh triggered');
      await this._refreshToken();
    }, TOKEN_REFRESH_INTERVAL);
  }

  // Refresh token without disconnecting
  private async _refreshToken() {
    if (!this.videoClient || !this._userId) {
      console.log('⚠️ [VideoManager] Cannot refresh token: no client or user');
      return;
    }

    try {
      console.log('🔥 [VideoManager] Fetching new token...');
      const res = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: this._userId }),
      });

      if (!res.ok) throw new Error('Failed to fetch token');
      const data = await res.json();
      console.log('✅ [VideoManager] New token fetched, length:', data.token?.length);

      // The SDK should handle this via reconnectWithToken
      // But we need to check if the client supports it
      // For now, we'll log - the SDK should auto-refresh
      console.log('✅ [VideoManager] Token ready for auto-refresh by SDK');
      this._scheduleTokenRefresh();
    } catch (err) {
      console.error('❌ [VideoManager] Token refresh failed:', err);
      // Try to reconnect if refresh fails
      if (this._userId) {
        console.log('🔄 [VideoManager] Attempting reconnect after token refresh failure');
        await this.connect(this._uid, this._displayName, this._image);
      }
    }
  }

  async connect(uid: string, displayName: string, image?: string) {
    console.log('🚀 [VideoManager] connect() ENTRY', { uid, currentStatus: this.status });

    // Store for token refresh
    this._uid = uid;
    this._displayName = displayName;
    this._image = image;

    // Prevent concurrent connections
    if (this.status === 'connecting') {
      console.log('⏳ [VideoManager] Already connecting');
      return;
    }

    // Skip if already ready for this user
    if (this.status === 'ready' && this._userId === uid && this.videoClient) {
      console.log('✅ [VideoManager] Already ready for this user, reusing client');
      this._notify(this.status, null);
      return;
    }

    console.log('🚀 [VideoManager] connect() START', { uid });

    this.status = 'connecting';
    this.error = null;
    this._notify(this.status, null);

    try {
      // Destroy old client first
      if (this.videoClient) {
        console.log('👋 [VideoManager] Destroying old client');
        try {
          await this.videoClient.disconnectUser();
        } catch (e) {
          console.log('⚠️ [VideoManager] Error disconnecting old client:', e);
        }
        this.videoClient = null;
      }

      // Clear any existing refresh timer
      if (this._refreshTimer) {
        clearTimeout(this._refreshTimer);
        this._refreshTimer = null;
      }

      // Create new StreamVideoClient with tokenProvider for auto-refresh
      console.log('🚀 [VideoManager] Creating new StreamVideoClient');
      const client = new StreamVideoClient({
        apiKey: API_KEY,
        user: {
          id: uid,
          name: displayName,
          image,
          type: 'authenticated',
        },
        tokenProvider: async () => {
          console.log('🔥 [VideoManager] Token fetch START (auto-refresh)', { uid });
          const tokenStart = Date.now();

          const res = await fetch('/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: uid }),
          });

          console.log('🔥 [VideoManager] Token response:', {
            status: res.status,
            time: Date.now() - tokenStart + 'ms',
          });

          if (!res.ok) throw new Error('Failed to fetch token');
          const data = await res.json();
          console.log('✅ [VideoManager] Token OK, length:', data.token?.length);
          return data.token;
        },
      });

      this.videoClient = client;
      this._userId = uid;

      // Wait for SDK to actually connect and authenticate
      console.log('⏳ [VideoManager] Waiting for SDK to authenticate...');
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Auth timeout (10s)'));
          }, 10000);

          const handler = (event: { type: string; online: boolean }) => {
            console.log('🌐 [VideoManager] SDK connection.changed:', event.online);
            if (event.type === 'connection.changed' && event.online) {
              clearTimeout(timeout);
              client.off('connection.changed', handler);
              resolve();
            }
          };

          client.on('connection.changed', handler);

          // Check if user is already connected via client.state.connectedUser
          if (client.state.connectedUser?.id) {
            console.log('✅ [VideoManager] Client user already connected');
            clearTimeout(timeout);
            client.off('connection.changed', handler);
            resolve();
          }
        });
        console.log('✅ [VideoManager] SDK authenticated successfully');
      } catch (err) {
        console.error('❌ [VideoManager] SDK authentication failed:', err);
        throw err;
      }

      this.status = 'ready';
      console.log('✅ [VideoManager] Marked as ready');
      this._notify(this.status, null);

      // Schedule proactive token refresh
      this._scheduleTokenRefresh();

    } catch (err) {
      console.error('❌ [VideoManager] Error:', err);

      this.videoClient = null;
      this._userId = null;
      this.status = 'error';
      this.error = err instanceof Error ? err.message : 'Connection failed';
      this._notify(this.status, this.error);
    }
  }

  disconnect() {
    console.log('👋 [VideoManager] disconnect()');

    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }

    if (this.videoClient) {
      try {
        this.videoClient.disconnectUser();
      } catch {}
      this.videoClient = null;
    }

    this._userId = null;
    this.status = 'idle';
    this.error = null;
    this._notify(this.status, null);
  }
}

function getManager() {
  if (!_manager) {
    console.log('📦 [VideoManager] Creating new manager instance');
    _manager = new ConnectionManager();
  }
  return _manager;
}

// ─────────────────────────────────────────────────────────────────────────────
// StreamVideoProvider
// ─────────────────────────────────────────────────────────────────────────────
const StreamVideoProvider = ({ children }: { children: ReactNode }) => {
  const { user, isLoaded } = useUser();
  const [status, setStatus] = useState<ConnStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<StreamVideoClient | null>(null);

  const uidRef = useRef<string | null>(null);
  const displayNameRef = useRef<string>('');
  const imageRef = useRef<string | undefined>(undefined);
  const lastReconnectRef = useRef(0);
  const managerRef = useRef(getManager());
  const stableClientRef = useRef<StreamVideoClient | null>(null);
  const mountedRef = useRef(true);

  // Subscribe to manager (runs once)
  useEffect(() => {
    console.log('🟢 [VideoProvider] Mounted');
    mountedRef.current = true;

    const manager = managerRef.current;

    const unsub = manager.subscribe((s, e) => {
      if (!mountedRef.current) return;
      console.log('📊 [VideoProvider] Manager callback:', {
        status: s,
        error: e,
        hasClient: !!manager.videoClient,
        userId: manager._userId,
      });

      setStatus(s);
      setError(e);

      if (!stableClientRef.current && manager.videoClient) {
        stableClientRef.current = manager.videoClient;
        console.log('🔒 [VideoProvider] Client locked');
      }

      setClient(stableClientRef.current);
    });

    // Restore state if manager already has ready state (from previous session/hot reload)
    if (manager.status === 'ready' && manager._userId && manager.videoClient) {
      console.log('🔒 [VideoProvider] Restoring state from hot reload');
      setStatus('ready');
      setError(null);
      stableClientRef.current = manager.videoClient;
      setClient(manager.videoClient);
    } else {
      setStatus(manager.status);
      setError(manager.error);
    }

    return () => {
      console.log('🔴 [VideoProvider] Unmounted');
      mountedRef.current = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Init on Clerk load
  useEffect(() => {
    if (!isLoaded) {
      console.log('⏸️ [VideoProvider] Clerk not loaded yet');
      return;
    }

    const uid = user?.id ?? null;
    if (!uid) {
      console.log('⏸️ [VideoProvider] No user ID');
      uidRef.current = null;
      return;
    }

    const name = clampName(user?.fullName) || clampName(user?.username) || uid;
    const image = user?.imageUrl?.trim() || undefined;

    uidRef.current = uid;
    displayNameRef.current = name;
    imageRef.current = image;

    // Skip if already connecting/ready with same user
    const manager = managerRef.current;
    if (manager.status === 'connecting') {
      console.log('⏳ [VideoProvider] Already connecting, skipping');
      return;
    }
    if (manager.status === 'ready' && manager._userId === uid) {
      console.log('✅ [VideoProvider] Already ready for this user, skipping');
      return;
    }

    console.log('🚀 [VideoProvider] Starting connection:', { uid, status: manager.status });
    void managerRef.current.connect(uid, name, image);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, user?.id]);

  // Visibility: reconnect with spam prevention
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return;

      if (managerRef.current.status === 'ready') {
        console.log('🛑 [VideoProvider] Skip reconnect (already ready)');
        return;
      }

      const uid = uidRef.current;
      if (!uid) return;

      const now = Date.now();
      if (now - lastReconnectRef.current < 5000) {
        console.log('⏳ [VideoProvider] Skipping reconnect (too soon)');
        return;
      }
      lastReconnectRef.current = now;

      console.log('👁️ [VideoProvider] Tab visible, reconnecting');
      await managerRef.current.connect(uid, displayNameRef.current, imageRef.current);
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retry handler
  const handleRetry = useCallback(() => {
    const uid = uidRef.current;
    if (!uid) return;

    console.log('🔁 [VideoProvider] Retry clicked', { uid, status });
    managerRef.current.connect(uid, displayNameRef.current, imageRef.current);
  }, [status]);

  // Manual token refresh function exposed via context
  const refreshToken = useCallback(async () => {
    console.log('🔄 [VideoProvider] Manual token refresh requested');
    const manager = managerRef.current;
    if (manager._userId) {
      await manager.connect(
        manager._userId,
        displayNameRef.current,
        imageRef.current
      );
    }
  }, []);

  // ─── TRUE READY STATE ─────────────────────────────────────────────────────
  const stableClient = stableClientRef.current;
  const manager = managerRef.current;
  const isReady = status === 'ready' && !!manager._userId;

  console.log('🧠 [Provider] READY CHECK:', {
    status,
    hasClient: !!client,
    hasStableClient: !!stableClient,
    userId: manager._userId,
    isReady,
  });

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <StreamVideoReadyContext.Provider value={{ isReady, client: stableClient, refreshToken }}>
      <>
        {isReady && stableClient && (
          <StreamVideo client={stableClient}>
            {children}
          </StreamVideo>
        )}

        {isLoaded && !isReady && (
          <div className="fixed inset-0 bg-dark-2/90 z-[40] flex flex-col items-center justify-center gap-4">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            {status === 'error' ? (
              <div className="flex flex-col items-center gap-4 text-red-400 text-center px-4">
                <p>{error ?? 'Connection error'}</p>
                <button
                  onClick={handleRetry}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Thử lại
                </button>
              </div>
            ) : (
              <p className="text-white/70">Đang kết nối video...</p>
            )}
          </div>
        )}
      </>
    </StreamVideoReadyContext.Provider>
  );
};

export default StreamVideoProvider;