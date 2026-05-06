import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brain, CheckCircle2, FolderPlus, Loader2, LogOut, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  BrainJob,
  BrainProject,
  createProject,
  getJobs,
  getProjects,
  getSession,
  logout,
  pollLoginStatus,
  requestLogin,
  SessionUser,
} from './api';

type LoginStep = 'idle' | 'sending' | 'waiting' | 'confirmed';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function App() {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<LoginStep>('idle');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [projects, setProjects] = useState<BrainProject[]>([]);
  const [jobs, setJobs] = useState<BrainJob[]>([]);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const pollTimer = useRef<number | null>(null);

  const clearPoll = useCallback(() => {
    if (pollTimer.current) window.clearInterval(pollTimer.current);
    pollTimer.current = null;
  }, []);

  const refreshWorkspace = useCallback(async () => {
    setLoadingWorkspace(true);
    setError('');
    try {
      const [nextProjects, nextJobs] = await Promise.all([getProjects(), getJobs()]);
      setProjects(nextProjects);
      setJobs(nextJobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Brainmaster workspace.');
    } finally {
      setLoadingWorkspace(false);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const nextUser = await getSession();
    setUser(nextUser);
    if (nextUser) await refreshWorkspace();
  }, [refreshWorkspace]);

  useEffect(() => {
    void refreshSession();
    return clearPoll;
  }, [clearPoll, refreshSession]);

  const stats = useMemo(() => {
    const projectJobs = projects.reduce((sum, project) => sum + project.jobs.length, 0);
    return { projects: projects.length, jobs: jobs.length, projectJobs };
  }, [jobs.length, projects]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearPoll();
    setError('');
    setMessage('');
    setStep('sending');

    try {
      const login = await requestLogin(email);
      setStep('waiting');
      setMessage(`Magic link sent. Expires in ${Math.round(login.expires_in / 60)} minutes.`);

      pollTimer.current = window.setInterval(async () => {
        try {
          const status = await pollLoginStatus(login.request_id);
          if (status.status === 'confirmed') {
            clearPoll();
            setStep('confirmed');
            setMessage(`Signed in as ${status.email || email}.`);
            await refreshSession();
          }
          if (status.status === 'expired') {
            clearPoll();
            setStep('idle');
            setError('Magic link expired. Request a new one.');
          }
        } catch (err) {
          clearPoll();
          setStep('idle');
          setError(err instanceof Error ? err.message : 'Login polling failed.');
        }
      }, 2500);
    } catch (err) {
      setStep('idle');
      setError(err instanceof Error ? err.message : 'Could not request login.');
    }
  }

  async function handleLogout() {
    clearPoll();
    await logout();
    setUser(null);
    setProjects([]);
    setJobs([]);
    setMessage('');
    setError('');
    setStep('idle');
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectName.trim()) return;
    setCreatingProject(true);
    setError('');
    try {
      await createProject(projectName.trim());
      setProjectName('');
      await refreshWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create project.');
    } finally {
      setCreatingProject(false);
    }
  }

  return (
    <main className="shell">
      <section className="panel intro">
        <div className="brand">
          <div className="brand-mark">
            <Brain size={26} aria-hidden="true" />
          </div>
          <div>
            <h1>Brainmaster</h1>
            <p>Private login client for TRIBE v2 workspace access.</p>
          </div>
        </div>
        <div className="status-pill">
          <ShieldCheck size={16} aria-hidden="true" />
          {user ? `Signed in: ${user.email}` : 'Magic-link authentication'}
        </div>
      </section>

      {!user ? (
        <section className="panel auth-panel" aria-label="Sign in">
          <div className="section-title">
            <Mail size={20} aria-hidden="true" />
            <h2>Sign in to Brainmaster</h2>
          </div>

          <form onSubmit={handleLogin} className="login-form">
            <label htmlFor="email">Email</label>
            <div className="input-row">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                disabled={step === 'sending' || step === 'waiting'}
                required
              />
              <button type="submit" disabled={step === 'sending' || step === 'waiting'}>
                {step === 'sending' || step === 'waiting' ? <Loader2 className="spin" size={18} /> : <Mail size={18} />}
                {step === 'waiting' ? 'Waiting' : 'Send link'}
              </button>
            </div>
          </form>

          {message && (
            <div className="notice good">
              <CheckCircle2 size={18} aria-hidden="true" />
              {message}
            </div>
          )}
          {error && <div className="notice bad">{error}</div>}
        </section>
      ) : (
        <section className="workspace">
          <div className="toolbar">
            <button type="button" onClick={refreshWorkspace} disabled={loadingWorkspace}>
              <RefreshCw className={loadingWorkspace ? 'spin' : ''} size={18} />
              Refresh
            </button>
            <button type="button" className="secondary" onClick={handleLogout}>
              <LogOut size={18} />
              Log out
            </button>
          </div>

          {error && <div className="notice bad">{error}</div>}

          <div className="metrics">
            <div>
              <span>{stats.projects}</span>
              Projects
            </div>
            <div>
              <span>{stats.jobs}</span>
              Jobs visible
            </div>
            <div>
              <span>{stats.projectJobs}</span>
              Project jobs
            </div>
          </div>

          <section className="panel">
            <div className="section-header">
              <div className="section-title">
                <FolderPlus size={20} aria-hidden="true" />
                <h2>Projects</h2>
              </div>
              <form onSubmit={handleCreateProject} className="project-form">
                <input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="New project name"
                  disabled={creatingProject}
                />
                <button type="submit" disabled={creatingProject || !projectName.trim()}>
                  {creatingProject ? <Loader2 className="spin" size={18} /> : <FolderPlus size={18} />}
                  Create
                </button>
              </form>
            </div>

            <div className="table">
              <div className="table-head project-grid">
                <span>Name</span>
                <span>Jobs</span>
                <span>Created</span>
              </div>
              {projects.map((project) => (
                <div className="table-row project-grid" key={project.project_id}>
                  <strong>{project.name}</strong>
                  <span>{project.jobs.length}</span>
                  <span>{formatDate(project.created_at)}</span>
                </div>
              ))}
              {!projects.length && <div className="empty">No projects yet.</div>}
            </div>
          </section>

          <section className="panel">
            <div className="section-title">
              <Brain size={20} aria-hidden="true" />
              <h2>Recent Jobs</h2>
            </div>
            <div className="table">
              <div className="table-head job-grid">
                <span>File</span>
                <span>Segments</span>
                <span>Created</span>
              </div>
              {jobs.slice(0, 12).map((job) => (
                <div className="table-row job-grid" key={job.job_id}>
                  <strong title={job.job_id}>{job.filename}</strong>
                  <span>{job.n_segments}</span>
                  <span>{formatDate(job.created_at)}</span>
                </div>
              ))}
              {!jobs.length && <div className="empty">No jobs found for this account.</div>}
            </div>
          </section>
        </section>
      )}
    </main>
  );
}
