import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brain, CheckCircle2, ExternalLink, FolderPlus, Loader2, LogOut, Mail, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import {
  BrainJob,
  BrainProject,
  createProject,
  getJobInputUrl,
  getJobMeta,
  getJobRoi,
  getJobs,
  getProjects,
  getRecords,
  getSession,
  JobMeta,
  JobRecords,
  JobRoi,
  logout,
  pollLoginStatus,
  requestLogin,
  SessionUser,
} from './api';

type LoginStep = 'idle' | 'sending' | 'waiting' | 'confirmed';

interface OwnedJob {
  job_id: string;
  filename: string;
  n_segments?: number;
  created_at?: string;
  source: string;
}

interface RoiSummary {
  parcels: number;
  top: Array<{ name: string; mean: number }>;
}

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

function summarizeRoi(roi: JobRoi): RoiSummary {
  const rows = Object.entries(roi)
    .map(([name, series]) => {
      const values = series.filter((value) => Number.isFinite(value));
      const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      return { name, mean };
    })
    .sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean));
  return { parcels: rows.length, top: rows.slice(0, 8) };
}

export function App() {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<LoginStep>('idle');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [projects, setProjects] = useState<BrainProject[]>([]);
  const [jobs, setJobs] = useState<BrainJob[]>([]);
  const [records, setRecords] = useState<JobRecords>({});
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [jobQuery, setJobQuery] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [jobMeta, setJobMeta] = useState<JobMeta | null>(null);
  const [jobRoi, setJobRoi] = useState<JobRoi | null>(null);
  const [loadingJob, setLoadingJob] = useState(false);
  const pollTimer = useRef<number | null>(null);

  const clearPoll = useCallback(() => {
    if (pollTimer.current) window.clearInterval(pollTimer.current);
    pollTimer.current = null;
  }, []);

  const refreshWorkspace = useCallback(async () => {
    setLoadingWorkspace(true);
    setError('');
    try {
      const [nextProjects, nextJobs, nextRecords] = await Promise.all([getProjects(), getJobs(), getRecords()]);
      setProjects(nextProjects);
      setJobs(nextJobs);
      setRecords(nextRecords);
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
    return { projects: projects.length, projectJobs };
  }, [projects]);

  const ownedJobs = useMemo(() => {
    const indexed = new Map(jobs.map((job) => [job.job_id, job]));
    const byId = new Map<string, OwnedJob>();

    for (const project of projects) {
      for (const job of project.jobs) {
        byId.set(job.job_id, {
          job_id: job.job_id,
          filename: job.filename,
          n_segments: job.n_segments,
          created_at: job.created_at,
          source: project.name,
        });
      }
    }

    for (const record of Object.values(records)) {
      const indexedJob = indexed.get(record.job_id);
      const existing = byId.get(record.job_id);
      byId.set(record.job_id, {
        job_id: record.job_id,
        filename: existing?.filename || indexedJob?.filename || record.job_id,
        n_segments: existing?.n_segments || indexedJob?.n_segments,
        created_at: existing?.created_at || indexedJob?.created_at || record.updated_at,
        source: existing?.source || record.category || 'Saved record',
      });
    }

    return [...byId.values()].sort(
      (a, b) => (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0),
    );
  }, [jobs, projects, records]);

  const filteredOwnedJobs = useMemo(() => {
    const query = jobQuery.trim().toLowerCase();
    if (!query) return ownedJobs;
    return ownedJobs.filter((job) =>
      [job.job_id, job.filename, job.source].some((value) => value.toLowerCase().includes(query)),
    );
  }, [jobQuery, ownedJobs]);

  const selectedJob = useMemo(
    () => ownedJobs.find((job) => job.job_id === selectedJobId) || null,
    [ownedJobs, selectedJobId],
  );

  const roiSummary = useMemo(() => (jobRoi ? summarizeRoi(jobRoi) : null), [jobRoi]);

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
    setRecords({});
    setJobQuery('');
    setSelectedJobId('');
    setJobMeta(null);
    setJobRoi(null);
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

  async function handleSelectJob(jobId: string) {
    if (!ownedJobs.some((job) => job.job_id === jobId)) {
      setError('That job is not in this signed-in workspace.');
      return;
    }
    setSelectedJobId(jobId);
    setJobMeta(null);
    setJobRoi(null);
    setLoadingJob(true);
    setError('');
    try {
      const [nextMeta, nextRoi] = await Promise.all([getJobMeta(jobId), getJobRoi(jobId)]);
      setJobMeta(nextMeta);
      setJobRoi(nextRoi);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load job details.');
    } finally {
      setLoadingJob(false);
    }
  }

  function handleQueryJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = jobQuery.trim().toLowerCase();
    if (!query) return;
    const exact = ownedJobs.find((job) => job.job_id.toLowerCase() === query);
    const partial = filteredOwnedJobs[0];
    const match = exact || partial;
    if (!match) {
      setError('No matching job in this signed-in workspace.');
      return;
    }
    void handleSelectJob(match.job_id);
  }

  return (
    <main className="shell">
      <section className="panel intro">
        <div className="brand">
          <div className="brand-mark">
            <Brain size={26} aria-hidden="true" />
          </div>
          <div>
            <h1>Neurodeck</h1>
            <p>Private command deck for TRIBE v2 workspace access.</p>
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
              <span>{ownedJobs.length}</span>
              My jobs
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
              <h2>My Job Query</h2>
            </div>

            <form onSubmit={handleQueryJob} className="query-form">
              <input
                value={jobQuery}
                onChange={(event) => setJobQuery(event.target.value)}
                placeholder="Search by filename, project, or job id"
              />
              <button type="submit" disabled={!jobQuery.trim() || loadingJob}>
                {loadingJob ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
                Query
              </button>
            </form>

            <div className="table">
              <div className="table-head owned-job-grid">
                <span>File</span>
                <span>Source</span>
                <span>Segments</span>
                <span>Created</span>
              </div>
              {filteredOwnedJobs.slice(0, 20).map((job) => (
                <div
                  className={`table-row owned-job-grid clickable ${selectedJobId === job.job_id ? 'selected' : ''}`}
                  key={job.job_id}
                  onClick={() => void handleSelectJob(job.job_id)}
                >
                  <strong title={job.job_id}>{job.filename}</strong>
                  <span>{job.source}</span>
                  <span>{job.n_segments ?? '-'}</span>
                  <span>{job.created_at ? formatDate(job.created_at) : '-'}</span>
                </div>
              ))}
              {!filteredOwnedJobs.length && <div className="empty">No matching jobs in this workspace.</div>}
            </div>

            {selectedJob && (
              <div className="job-detail">
                <div className="job-detail-header">
                  <div>
                    <h3>{selectedJob.filename}</h3>
                    <code>{selectedJob.job_id}</code>
                  </div>
                  <a href={getJobInputUrl(selectedJob.job_id)} target="_blank" rel="noreferrer">
                    <ExternalLink size={16} />
                    Input
                  </a>
                </div>

                {loadingJob && (
                  <div className="detail-loading">
                    <Loader2 className="spin" size={18} />
                    Loading job data
                  </div>
                )}

                {!loadingJob && roiSummary && (
                  <div className="roi-grid">
                    <div className="roi-stat">
                      <span>{roiSummary.parcels}</span>
                      ROI parcels
                    </div>
                    <div className="roi-list">
                      {roiSummary.top.map((roi) => (
                        <div key={roi.name}>
                          <strong>{roi.name}</strong>
                          <span>{roi.mean.toFixed(4)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!loadingJob && jobMeta && (
                  <details>
                    <summary>Raw metadata</summary>
                    <pre>{JSON.stringify(jobMeta, null, 2)}</pre>
                  </details>
                )}
              </div>
            )}
          </section>
        </section>
      )}
    </main>
  );
}
