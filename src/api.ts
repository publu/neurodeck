const AUTH_BASE = 'https://notes.highscore.page';
const BRAINMASTER_BASE = 'https://tiktok.highscore.page';

export type AuthStatus = 'pending' | 'confirmed' | 'expired';

export interface LoginRequest {
  ok: boolean;
  request_id: string;
  expires_in: number;
}

export interface LoginStatus {
  status: AuthStatus;
  email?: string;
  expires_at?: string;
}

export interface SessionUser {
  email: string;
}

export interface BrainProject {
  project_id: string;
  name: string;
  created_at: string;
  jobs: Array<{
    job_id: string;
    filename: string;
    role: 'reference' | 'submission';
    n_segments: number;
    created_at: string;
  }>;
}

export interface BrainJob {
  job_id: string;
  filename: string;
  n_segments: number;
  duration_seconds?: number;
  n_vertices?: number;
  created_at: string;
}

async function readError(response: Response): Promise<string> {
  const data = await response.json().catch(() => null);
  return data?.error || data?.detail || `${response.status} ${response.statusText}`;
}

export async function requestLogin(email: string): Promise<LoginRequest> {
  const response = await fetch(`${AUTH_BASE}/api/auth/request`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function pollLoginStatus(requestId: string): Promise<LoginStatus> {
  const response = await fetch(
    `${AUTH_BASE}/api/auth/status?request_id=${encodeURIComponent(requestId)}`,
    { credentials: 'include' },
  );
  if (response.status === 404) throw new Error('Login request was not found.');
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function getSession(): Promise<SessionUser | null> {
  const response = await fetch(`${AUTH_BASE}/api/auth/me`, { credentials: 'include' });
  if (response.status === 401) return null;
  if (!response.ok) return null;
  return response.json();
}

export async function logout(): Promise<void> {
  await fetch(`${AUTH_BASE}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

export async function getProjects(): Promise<BrainProject[]> {
  const response = await fetch(`${BRAINMASTER_BASE}/api/tribe/projects`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function getJobs(): Promise<BrainJob[]> {
  const response = await fetch(`${BRAINMASTER_BASE}/api/tribe/jobs`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function createProject(name: string): Promise<BrainProject> {
  const response = await fetch(`${BRAINMASTER_BASE}/api/tribe/projects`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}
