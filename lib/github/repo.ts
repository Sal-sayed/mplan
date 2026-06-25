// GitHub REST v3 calls used by the GTM-snippet injection flow. Raw fetch (no SDK,
// matching lib/gemini.ts / gtm-config.ts), authenticated with a per-user token from
// token-store. Read repo + create a branch + commit to THAT branch + open a PR.
//
// Deliberately NO force-push, NO merge, NO admin, NO write to the default branch —
// the only mutations are: create a NEW ref, PUT a file ON that new ref, open a PR.

const API_BASE = 'https://api.github.com';

interface GhResponse<T> {
  status: number;
  json: T;
}

async function ghFetch<T = unknown>(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<GhResponse<T>> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'sirah-measurement-agent',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, json };
}

function errMessage(status: number, json: unknown, fallback: string): string {
  const msg = (json as { message?: string })?.message;
  if (status === 401) return 'GitHub authorization expired or invalid — reconnect GitHub.';
  if (status === 403) return 'GitHub denied the request (permission or rate limit).';
  if (status === 404) return 'Repository or path not found, or the token lacks access to it.';
  return `${fallback} (${status})${msg ? `: ${msg}` : ''}`;
}

export interface RepoSummary {
  fullName: string; // "owner/repo"
  owner: string;
  name: string;
  private: boolean;
  defaultBranch: string;
}

// The authenticated user's GitHub login (for status display + storage).
export async function getAuthenticatedLogin(token: string): Promise<string> {
  const { status, json } = await ghFetch<{ login?: string }>(token, '/user');
  if (status !== 200 || !json.login) throw new Error(errMessage(status, json, 'Could not read GitHub account'));
  return json.login;
}

// The repos the token can see (slice-1 one-repo picker). Most-recently-updated first.
export async function listRepos(token: string): Promise<RepoSummary[]> {
  const { status, json } = await ghFetch<Array<Record<string, unknown>>>(
    token,
    '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator'
  );
  if (status !== 200 || !Array.isArray(json)) throw new Error(errMessage(status, json, 'Could not list repositories'));
  return json.map((r) => ({
    fullName: String(r.full_name),
    owner: String((r.owner as { login?: string })?.login ?? ''),
    name: String(r.name),
    private: Boolean(r.private),
    defaultBranch: String(r.default_branch ?? 'main'),
  }));
}

export interface DefaultBranch {
  branch: string;
  sha: string; // head commit SHA of the default branch
}

export async function getDefaultBranch(token: string, owner: string, repo: string): Promise<DefaultBranch> {
  const repoRes = await ghFetch<{ default_branch?: string }>(token, `/repos/${owner}/${repo}`);
  if (repoRes.status !== 200 || !repoRes.json.default_branch) {
    throw new Error(errMessage(repoRes.status, repoRes.json, 'Could not read repository'));
  }
  const branch = repoRes.json.default_branch;
  const refRes = await ghFetch<{ object?: { sha?: string } }>(
    token,
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`
  );
  if (refRes.status !== 200 || !refRes.json.object?.sha) {
    throw new Error(errMessage(refRes.status, refRes.json, 'Could not read the default branch ref'));
  }
  return { branch, sha: refRes.json.object.sha };
}

export interface RepoFile {
  path: string;
  content: string; // decoded UTF-8
  sha: string; // blob SHA (needed to update the file)
}

// A single file's decoded contents, or null if it doesn't exist (404). Other
// errors throw.
export async function getFileContents(
  token: string,
  owner: string,
  repo: string,
  filePath: string,
  ref?: string
): Promise<RepoFile | null> {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const { status, json } = await ghFetch<{ content?: string; encoding?: string; sha?: string; type?: string }>(
    token,
    `/repos/${owner}/${repo}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}${q}`
  );
  if (status === 404) return null;
  if (status !== 200 || json.type !== 'file' || typeof json.content !== 'string' || !json.sha) {
    throw new Error(errMessage(status, json, `Could not read ${filePath}`));
  }
  const content = Buffer.from(json.content, (json.encoding as BufferEncoding) || 'base64').toString('utf8');
  return { path: filePath, content, sha: json.sha };
}

export interface RepoTreeEntry {
  path: string;
  type: 'blob' | 'tree'; // blob = file, tree = directory
}

// READ-ONLY: the repo's full file tree at a ref (default-branch head SHA), via the
// Git Trees API (recursive). Used to SUGGEST where a dataLayer push should go — it
// never writes. Large repos may be `truncated` by GitHub; we just suggest from what
// we got (best-effort), never fabricating paths.
export async function listTree(token: string, owner: string, repo: string, ref: string): Promise<RepoTreeEntry[]> {
  const { status, json } = await ghFetch<{ tree?: Array<{ path?: string; type?: string }> }>(
    token,
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`
  );
  if (status !== 200 || !Array.isArray(json.tree)) {
    throw new Error(errMessage(status, json, 'Could not read repository tree'));
  }
  return json.tree
    .filter((e): e is { path: string; type: 'blob' | 'tree' } => Boolean(e.path) && (e.type === 'blob' || e.type === 'tree'))
    .map((e) => ({ path: String(e.path), type: e.type }));
}

// Create a NEW branch ref pointing at fromSha. Never updates an existing ref.
export async function createBranch(
  token: string,
  owner: string,
  repo: string,
  newBranch: string,
  fromSha: string
): Promise<void> {
  const { status, json } = await ghFetch(token, `/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    body: { ref: `refs/heads/${newBranch}`, sha: fromSha },
  });
  if (status !== 201) throw new Error(errMessage(status, json, 'Could not create branch'));
}

// Create or update a file ON A SPECIFIC (non-default) branch. `branch` is required
// so a commit can NEVER land on the default branch through this function. Pass the
// existing blob `sha` when updating a file (omit for a new file).
export async function commitFile(
  token: string,
  owner: string,
  repo: string,
  args: { branch: string; path: string; content: string; message: string; sha?: string }
): Promise<void> {
  if (!args.branch) throw new Error('commitFile requires an explicit (non-default) branch');
  const { status, json } = await ghFetch(
    token,
    `/repos/${owner}/${repo}/contents/${args.path.split('/').map(encodeURIComponent).join('/')}`,
    {
      method: 'PUT',
      body: {
        message: args.message,
        content: Buffer.from(args.content, 'utf8').toString('base64'),
        branch: args.branch,
        ...(args.sha ? { sha: args.sha } : {}),
      },
    }
  );
  if (status !== 200 && status !== 201) throw new Error(errMessage(status, json, 'Could not commit file'));
}

export interface PullRequest {
  url: string; // html_url
  number: number;
}

export async function openPullRequest(
  token: string,
  owner: string,
  repo: string,
  args: { base: string; head: string; title: string; body: string }
): Promise<PullRequest> {
  const { status, json } = await ghFetch<{ html_url?: string; number?: number }>(
    token,
    `/repos/${owner}/${repo}/pulls`,
    { method: 'POST', body: { base: args.base, head: args.head, title: args.title, body: args.body } }
  );
  if (status !== 201 || !json.html_url || typeof json.number !== 'number') {
    throw new Error(errMessage(status, json, 'Could not open pull request'));
  }
  return { url: json.html_url, number: json.number };
}
