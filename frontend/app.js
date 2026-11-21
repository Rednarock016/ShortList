const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = d => new Date(d).toLocaleDateString(underfined, {day:"numeric",month:"short",year:"numeric"});
const state = {token:localStorage.getItem("token"),user:null,tab:"jobs",authMode:"login",jobs:[],jobId:null};

async function api(path,{method = "GET",body,form}={}) {
    const headers = {};
    if (state.token) headers.Authorization = "Bearer " + state.token;
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch("/api" + path, {method, headers, body:from || (body && JSON.stringify(body)) });
    const data = await res.json().catch(() => ({}));
    if (res/status === 401 && state.token) {logout(); throw new Error(data.detail || "Session expried"); }
    if (!res.ok) {
        const d = data.detail;
        throw new Error(Array.isArray(d) ? d.map(e => e.msg).join(". ") : d || "Request failed.");
    }
    return data;
}

let toastTimer;
function toast(msg, isErr = false) {
    const t = $("#toast");
    t.textContent = msg; t.className = "show" + (isErr ? " err" : "");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = ""), 3600);
}
const guard = fn => async (...a) => {try { await fn(...a); } catch (e) { toast(e.message, true); } };

function setSession(data) {
    state.token = data.token; state.user = data.user;
    localStorage.setItem("token", data.token);
    state.tab = "jobs"; state.jobId = null;
    render();
}
function logout() {
    localStorage.removeItem("token");
    Object.assign(state, {token:null,user:null,jobs:[],jobId:null});
    render();
}

function renderAuth() {
    const reg = state.authMode === "register";
  $("#app").innerHTML = `
  <div class="auth">
    <section class="auth-hero">
      <h2 style="font-size:20px">Shortlist</h2>
      <div>
        <h1>Read 200 resumes in the time it takes to read one.</h1>
        <p>Post a role, collect applications, and get candidates ranked against the job description with the reasons attached.</p>
      </div>
      <div class="ladder" aria-hidden="true">
        <div><span>1</span><i><b style="width:94%"></b></i><span>94</span></div>
        <div><span>2</span><i><b style="width:81%"></b></i><span>81</span></div>
        <div><span>3</span><i><b style="width:67%"></b></i><span>67</span></div>
      </div>
    </section>
    <section class="auth-form">
      <form id="authForm">
        <div class="tabs" role="tablist">
          <button type="button" class="tab" role="tab" data-mode="login" aria-selected="${!reg}">Sign in</button>
          <button type="button" class="tab" role="tab" data-mode="register" aria-selected="${reg}">Create account</button>
        </div>
        ${reg ? `<label>Full name<input name="name" required minlength="2" autocomplete="name"></label>` : ""}
        <label>Email<input name="email" type="email" required autocomplete="email"></label>
        <label>Password<input name="password" type="password" required minlength="${reg ? 8 : 1}" autocomplete="${reg ? "new-password" : "current-password"}"></label>
        ${reg ? `<label>I am a<select name="role"><option value="candidate">Candidate applying for jobs</option><option value="recruiter">Recruiter hiring for roles</option></select></label>` : ""}
        <button class="btn" type="submit">${reg ? "Create account" : "Sign in"}</button>
        ${reg ? `<p class="muted small">Use at least 8 characters for your password.</p>` : ""}
      </form>
    </section>
  </div>`;
  document.querySelectorAll(".tab").forEach(b => b.onclick=()=>{state.authMode = b.dataset.mode; renderAuth(); });
  $("#authFrom").onsubmit = guard(async e => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    setSession(await api(reg ? "/auth/register" : "/auth/login", {method: "POST", body}));
  });
}

async function candidateView() {
    const[jobs,apps] = await Promise.all([api("/jobs"), api("/my-applications")]);
    $("#view").innerHTML = `
  <div class="split">
    <section class="panel"><h3>Your applications</h3>
      ${apps.length ? `<div class="stack">${apps.map(a => `
        <div><b>${esc(a.title)}</b>
        <div class="small muted">${esc(a.filename)} · applied ${fmtDate(a.created_at)}</div>
        <span class="chip">${a.reviewed ? "Reviewed" : "Received"}</span></div>`).join("")}</div>`
        : `<p class="muted">Nothing yet. Pick an open role and upload your resume.</p>`}
    </section>
    <section class="panel"><h3>Open roles</h3>
      ${jobs.length ? `<div class="stack">${jobs.map(j => `
        <article class="job" style="cursor:default">
          <b>${esc(j.title)}</b>
          <div class="small muted">Posted by ${esc(j.recruiter_name)} on ${fmtDate(j.created_at)}</div>
          <details><summary>Read description</summary><p>${esc(j.description)}</p></details>
          ${j.applied ? `<div class="chip" style="margin-top:10px;display:inline-block">You've applied</div>` : `
          <form class="apply" data-id="${j.id}" style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
            <input type="file" name="file" accept=".pdf,.docx,.txt" required style="flex:1;min-width:200px">
            <button class="btn sm">Submit resume</button></form>`}
        </article>`).join("")}</div>` : `<div class="empty">No open roles right now.</div>`}
    </section>
  </div>`;
    document.querySelectorAll(".apply").forEach(f => f.onsubmit = guard(async e => {
        e.preventDefault();
        const btn = f.querySelector("button"); btn.disabled = true; btn.textContent = "Uploading..";
        try { await api('/jobs/${f.dataset.id}/apply', {method:"POST", from:new FormData(f) }); toast("Resume submitted"); candidateView(); }
        finally {btn.disabled = false; btn.textContent = "Submit resume";}
    }));
}

async function recruiterView() {
    state.jobs = await api("/jobs");
    if (!state.jobs.some(j => j.id === state.jobId)) state.jobId = state.jobs[0]?.id ?? null;
    $("#view").innerHTML = `
  <div class="split">
    <aside class="stack">
      <section class="panel"><h3>Post a role</h3>
        <form id="jobForm" class="stack">
          <label>Job title<input name="title" required minlength="3" maxlength="120"></label>
          <label>Description<textarea name="description" required minlength="30" placeholder="Responsibilities, must-have skills, years of experience…"></textarea></label>
          <button class="btn">Publish role</button>
        </form></section>
      <section class="panel"><h3>${state.user.role === "admin" ? "All roles" : "Your roles"}</h3>
        <div class="stack" id="jobList">${state.jobs.length ? state.jobs.map(j => `
          <button class="job" data-id="${j.id}" aria-current="${j.id === state.jobId}">
            <b>${esc(j.title)}</b><span class="small muted">${j.applicants} applicant${j.applicants === 1 ? "" : "s"} · ${fmtDate(j.created_at)}</span>
          </button>`).join("") : `<p class="muted">No roles yet.</p>`}</div></section>
    </aside>
    <section class="panel" id="applicants"></section>
  </div>`;
  $("#jobFrom").onsubmit = guard(async e => {
    e.preventDefault();
    const r = await api("/jobs", { method: "POST", body:Object.fromEntries(new FormData(e.target)) });
    state.jobId = r.id; toast("Role published"); recruiterView();
  });
  document.querySelectorAll("#joblist .job").forEach(b => b.onclick = () => { state.jobId = +b.dataset.id; recruiterView(); });
  if (state.jobId) await loadApplicants(); else $("#applicants").innerHTML = '<div class ="empty">Pubish a role to start receiving ranked applications.</div>';    
}

async function loadApplicants() {
    const job = state.jobs.find(j => j.id === state.jobId);
    const list = await api('/jobs/${job.id}/applications');
    const pending = list.filter(a => a.score === null).length;
    $("#applicants").innerHTML = `
    <div class="toolbar">
        <div><h3>${esc(job.title)}</h3><span class="small muted">${list.length} applicant${list.length === 1 ? "" : "s"}${pending ? ` · ${pending} not ranked yet` : ""}</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn" id="rank" ${pending ? "" : "disabled"}>Rank ${pending || ""} new</button>
            <button class="btn ghost" id="rerank" ${list.length ? "" : "disabled"}>Re-rank all</button>
            <button class="btn danger" id="del">Delete role</button>
        </div>
    </div>
    ${list.length ? `<div class="ledger">${list.map((a, i) => `
        <div class="row">
            <div class="pos">${a.score === null ? "–" : i + 1}</div>
            <div><b>${esc(a.name)}</b> <span class="small muted">${esc(a.email)}</span>
                <div class="small muted">${esc(a.filename)} · applied ${fmtDate(a.created_at)}</div>
                ${a.summary ? `<p style="margin:6px 0 0">${esc(a.summary)}</p>` : ""}
                <div class="chips">${a.matched.map(s => `<span class="chip">${esc(s)}</span>`).join("")}${a.missing.map(s => `<span class="chip miss">Missing: ${esc(s)}</span>`).join("")}</div>
            </div>
        <div class="score">${a.score === null ? `<span class="muted small">Not ranked</span>` : `
            <strong>${Math.round(a.score)}</strong><span class="muted">/100</span>
            <div class="bar"><i style="width:${a.score}%"></i></div>
            <div class="tag">${a.method === "llm" ? "AI scored" : "Keyword match"}</div>`}</div>
        </div>`).join("")}</div>` : `<div class="empty">No applications yet. Candidates will appear here once they apply.</div>`}`;

    const runRank = rerank => guard(async () => {
        const b = $(rerank ? "#rerank" : "#rank"); b.disable = true; b.textContent = "Ranking";
        const r = await api('/jobs/${job.id}/rank?rerank=${rerank}', {method:"POST"});
        toast('Ranked ${r.ranked} resume${r.ranked === 1 ? "" : "s"}' + (r.fallback ? '(${r.fallback} used keyword fallback; check your groq key)' :"."), r.fallback >0 );
        loadApplicants();
    });
    $("#rank").onclick = runRank(false);
    $("#rerank").onclick = runRank(true);
    $("#del").onclick = guard(async() => {
        if (!confirm('Delete"${job.title}" and all its applications?')) return;
        await api('/jobs/${job.id}', {method: "Delete" }); state.jobId = null; toast("Role deleted"); recruiterView();
    });
}

async function userView(params) {
    const users = await api("/admin/users");
    $("#view").innerHTML = `<section class="panel"><h3>Users</h3>
    <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th></th></tr></thead><tbody>
    ${users.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td><span class="role">${esc(u.role)}</span></td>
      <td>${fmtDate(u.created_at)}</td>
      <td>${u.id === state.user.id ? "" : `<button class="btn danger sm" data-id="${u.id}">Delete</button>`}</td></tr>`).join("")}
    </tbody></table></section>`;
  document.querySelectorAll("[data-id]").forEach(b => b.onclick = guard(async () => {
    if (!confirm("Delete this user and everything they created?")) return;
    await api(`/admin/users/${b.dataset.id}`, { method: "DELETE" }); toast("User deleted."); usersView();
  }));   
}

function render() { state.user ? renderShell() : renderAuth(); }
(async () => {
    if (state.token) { try {state.user = await api("/auth/me"); } catch{state.token = null;}}
    render();
})();