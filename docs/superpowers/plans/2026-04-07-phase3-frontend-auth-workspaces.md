# Phase 3 — Frontend Auth + Workspace UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add login, workspace selection, and workspace-scoped navigation to the Next.js frontend.

**Architecture:** useAuth hook with localStorage JWT, AuthGuard wrapper, workspace-aware Sidebar with switcher, workspace-scoped audit form. All API calls go through fetchWithAuth.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS (Command dark theme)

**Spec:** `docs/superpowers/specs/2026-04-06-workspace-auth-design.md` (section 6)

**Depends on:** Phase 2 (all backend API routes operational)

**Design System:** Command dark theme — glassmorphism, #080808 bg, accent cyan #00e5ff, Manrope font, ultra-thin weights. See DESIGN.md.

---

### Task 1: Update types.ts + api.ts for auth + workspaces

**Files:**
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Add types to types.ts**

Append to `frontend/lib/types.ts`:

```typescript
/* ---- Auth & Workspace types ------------------------------------- */

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  logo_path: string | null;
  config_json: string;
  onboarding_done: boolean;
  created_by: string;
  created_at: string;
  member_role?: string;
  member_count?: number;
  audit_count?: number;
}

export interface WorkspaceMember {
  user_id: string;
  email: string;
  name: string;
  role: string;
  joined_at: string;
}

export interface WorkspaceDetail extends Workspace {
  members: WorkspaceMember[];
}

export interface Whitelist {
  id: string;
  workspace_id: string;
  name: string;
  domains: string[];
  domains_json?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ActivityEntry {
  id: string;
  workspace_id: string;
  user_id: string;
  user_name: string;
  user_email?: string;
  action: string;
  detail_json: string | null;
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  user: User;
}

export interface MeResponse {
  user: User;
  workspaces: Workspace[];
}
```

- [ ] **Step 2: Rewrite api.ts with auth support**

Read the current `frontend/lib/api.ts`, then rewrite it. The key changes:
- Add `getToken()` / `setToken()` / `clearToken()` helpers using localStorage
- Add `fetchWithAuth(url, options)` that adds the Bearer token header
- Add `login(email, password)`, `getMe()`, `logout()`
- Add workspace API functions: `getWorkspaces()`, `createWorkspace(name)`, `getWorkspace(id)`, `deleteWorkspace(id)`
- Add whitelist functions: `getWhitelists(wsId)`, `createWhitelist(wsId, name, domains)`
- Add activity: `getActivity(wsId, limit?, since?)`
- Keep existing audit functions but make them use `fetchWithAuth`
- Add workspace_id query param to `getAudits(workspaceId?)`

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/types.ts frontend/lib/api.ts && git commit -m "feat: add auth + workspace types and API functions"
```

---

### Task 2: Create useAuth hook + AuthGuard

**Files:**
- Create: `frontend/hooks/useAuth.ts`
- Create: `frontend/components/auth/AuthGuard.tsx`
- Create: `frontend/components/auth/AuthContext.tsx`

- [ ] **Step 1: Create AuthContext**

```typescript
// frontend/components/auth/AuthContext.tsx
'use client';

import { createContext, useContext } from 'react';
import type { User, Workspace } from '@/lib/types';

interface AuthContextType {
  user: User | null;
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setCurrentWorkspace: (ws: Workspace) => void;
  refreshWorkspaces: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 2: Create AuthGuard (provider + guard)**

```typescript
// frontend/components/auth/AuthGuard.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AuthContext } from './AuthContext';
import { login as apiLogin, getMe, getToken, setToken, clearToken, getWorkspaces as fetchWorkspaces } from '@/lib/api';
import type { User, Workspace } from '@/lib/types';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshWorkspaces = useCallback(async () => {
    try {
      const data = await fetchWorkspaces();
      setWorkspaces(data);
    } catch { /* ignore */ }
  }, []);

  // Check auth on mount
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      if (pathname !== '/login') router.push('/login');
      return;
    }
    getMe()
      .then((data) => {
        setUser(data.user);
        setWorkspaces(data.workspaces);
        if (data.workspaces.length > 0 && !currentWorkspace) {
          setCurrentWorkspace(data.workspaces[0]);
        }
      })
      .catch(() => {
        clearToken();
        if (pathname !== '/login') router.push('/login');
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    setToken(data.access_token);
    setUser(data.user);
    const me = await getMe();
    setWorkspaces(me.workspaces);
    if (me.workspaces.length > 0) {
      setCurrentWorkspace(me.workspaces[0]);
    }
    router.push('/workspaces');
  };

  const logout = () => {
    clearToken();
    setUser(null);
    setWorkspaces([]);
    setCurrentWorkspace(null);
    router.push('/login');
  };

  // Redirect unauthenticated users (except on /login)
  useEffect(() => {
    if (!loading && !user && pathname !== '/login') {
      router.push('/login');
    }
  }, [loading, user, pathname]);

  return (
    <AuthContext.Provider value={{ user, workspaces, currentWorkspace, loading, login, logout, setCurrentWorkspace, refreshWorkspaces }}>
      {children}
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/hooks/useAuth.ts frontend/components/auth/ && git commit -m "feat: add useAuth hook + AuthProvider + AuthContext"
```

---

### Task 3: Create login page

**Files:**
- Create: `frontend/app/login/page.tsx`

- [ ] **Step 1: Write login page**

Glass card centered on dark background. Email + password inputs. Gradient fluid button. Error message inline. No registration. Command dark theme styling.

The login page should NOT use the Sidebar layout — it's a standalone page. We'll need to handle this in the layout.

- [ ] **Step 2: Update layout.tsx to conditionally show Sidebar**

Modify `frontend/app/layout.tsx` — the Sidebar should NOT render on `/login`. Use a client component wrapper or conditional rendering.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/login/ frontend/app/layout.tsx && git commit -m "feat: add login page with glass card design"
```

---

### Task 4: Create workspace list page

**Files:**
- Create: `frontend/app/workspaces/page.tsx`

- [ ] **Step 1: Write workspace list page**

Shows all workspaces the user belongs to as glass cards. Each card shows: name, member count, audit count, user's role badge, last audit date. "Nouveau workspace" button. Clicking a card navigates to `/workspaces/[id]`.

- [ ] **Step 2: Commit**

```bash
git add frontend/app/workspaces/ && git commit -m "feat: add workspace list page"
```

---

### Task 5: Rewrite Sidebar with workspace switcher

**Files:**
- Modify: `frontend/components/layout/Sidebar.tsx`

- [ ] **Step 1: Rewrite Sidebar**

The sidebar needs:
- WorkspaceSwitcher dropdown at top (shows current workspace name, dropdown to switch)
- Navigation items scoped to current workspace: Dashboard, Nouvel Audit, Whitelists, Activite, Parametres
- Links use `/workspaces/[currentWorkspaceId]/...` paths
- User info at bottom (email, logout button)
- Role "client" users: no workspace switcher, locked to their workspace
- Activity badge (count of unseen activity)

Uses `useAuth()` to get currentWorkspace, workspaces, user, logout.

- [ ] **Step 2: Commit**

```bash
git add frontend/components/layout/Sidebar.tsx && git commit -m "feat: rewrite sidebar with workspace switcher + scoped navigation"
```

---

### Task 6: Create workspace dashboard page

**Files:**
- Create: `frontend/app/workspaces/[id]/page.tsx`
- Create: `frontend/app/workspaces/[id]/layout.tsx`

- [ ] **Step 1: Write workspace dashboard**

Shows:
- Workspace name as header
- KPI row: total audits, avg score, sites morts, taux MFA (from latest audit)
- Last 5 audits as a mini table with status + date + Re-run button
- Whitelists preview (count + names)
- Recent activity (5 entries)

- [ ] **Step 2: Write layout that sets current workspace**

The layout for `/workspaces/[id]/*` should set the current workspace in auth context when the user navigates there.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/workspaces/\[id\]/ && git commit -m "feat: add workspace dashboard page"
```

---

### Task 7: Adapt audit form to workspace scope

**Files:**
- Modify or create: `frontend/app/workspaces/[id]/audit/new/page.tsx`

- [ ] **Step 1: Write workspace-scoped audit form**

Copy the logic from the current `app/page.tsx` audit form but:
- Pre-fill config from workspace config_json (modules, thresholds)
- Add whitelist selector dropdown (fetch from `/api/workspaces/:id/whitelists`)
- Pass workspace_id to the audit SSE stream
- Client label defaults to workspace name
- After audit completes, redirect to `/workspaces/[id]/audit/[auditId]`

- [ ] **Step 2: Commit**

```bash
git add frontend/app/workspaces/\[id\]/audit/ && git commit -m "feat: add workspace-scoped audit form with whitelist selector"
```

---

### Task 8: Update root page to redirect

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Replace root page with redirect**

The root `/` page should now redirect:
- If authenticated with workspaces → redirect to first workspace dashboard
- If authenticated without workspaces → redirect to `/workspaces` (create one)
- If not authenticated → redirect to `/login`

- [ ] **Step 2: Commit**

```bash
git add frontend/app/page.tsx && git commit -m "feat: root page redirects to workspace or login"
```

---

### Summary

After Phase 3:
- Login page with glass card design
- Auth context with JWT token management
- Workspace list with create button
- Workspace-scoped Sidebar with switcher
- Workspace dashboard with KPIs + audit list + activity
- Audit form with whitelist selector + workspace config pre-fill
- Root redirect logic

All styled in the Command dark theme.
