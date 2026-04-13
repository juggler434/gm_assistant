// SPDX-License-Identifier: AGPL-3.0-or-later

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AuthResponse, AuthUser, RegisterResponse } from "@/types";

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isEmailVerified: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Refresh user data from the server (e.g. after email verification). */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const data = await api.get<AuthResponse>("/api/auth/me");
        if (!cancelled) setUser(data.user);
      } catch {
        // Not authenticated
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    checkAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    const data = await api.post<AuthResponse>("/api/auth/login", {
      email,
      password,
    });
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (name: string, email: string, password: string): Promise<void> => {
    await api.post<RegisterResponse>("/api/auth/register", {
      name,
      email,
      password,
    });
    // If registration created a new account, a session cookie was set.
    // Check /me to pick up the session (if any). For duplicate emails
    // the server returns the same 201 but sets no session.
    try {
      const data = await api.get<AuthResponse>("/api/auth/me");
      setUser(data.user);
    } catch {
      // No session — duplicate email or other edge case. That's expected.
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } catch (e) {
      // Ignore errors on logout — even if the server call fails,
      // we still want to clear local state
      if (e instanceof ApiError && e.statusCode === 401) {
        // Already logged out, that's fine
      }
    }
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.get<AuthResponse>("/api/auth/me");
      setUser(data.user);
    } catch {
      // If refresh fails, leave current state
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isEmailVerified: !!user?.emailVerified,
        isLoading,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
