import { api, setSession, clearSession, getToken } from "./api.js";
const authView = document.querySelector("#auth-view");
const appView = document.querySelector("#app-view");
const authForm = document.querySelector("#auth-form");
const authError = document.querySelector("#auth-error");
const authSubmit = document.querySelector("#auth-submit");
const listEl = document.querySelector("#list");
const form = document.querySelector("#poll-form");
const formError = document.querySelector("#form-error");
let mode = "login";
const showError = (el, message) => { el.hidden = !message; el.textContent = message || ""; };

function setMode(next) {
  mode = next;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  authSubmit.textContent = mode === "login" ? "Entrar" : "Crear cuenta";
}
async function refresh() {
  const data = await api("/api/polls");
  listEl.innerHTML = "";
  if (!data.polls.length) {
    const empty = document.createElement("li");
    empty.textContent = "No hay encuestas.";
    listEl.append(empty);
    return;
  }
  data.polls.forEach((poll) => {
    const total = poll.options.reduce((sum, option) => sum + option.votes, 0);
    const li = document.createElement("li");
    li.className = "poll";
    const title = document.createElement("strong");
    title.textContent = poll.question;
    li.append(title);
    poll.options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `option-btn${poll.mine === option.index ? " mine" : ""}`;
      button.textContent = `${option.label} \u00b7 ${option.votes}`;
      button.addEventListener("click", async () => {
        try { await api(`/api/polls/${poll.id}/vote`, { method: "POST", body: JSON.stringify({ option: option.index }) }); await refresh(); }
        catch (err) { showError(formError, err.message); }
      });
      const bar = document.createElement("div");
      bar.className = "bar";
      const fill = document.createElement("span");
      fill.style.width = `${total ? Math.round((option.votes / total) * 100) : 0}%`;
      bar.append(fill);
      li.append(button, bar);
    });
    if (poll.mineOwn) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "ghost";
      del.textContent = "Borrar";
      del.addEventListener("click", async () => { await api(`/api/polls/${poll.id}`, { method: "DELETE" }); await refresh(); });
      li.append(del);
    }
    listEl.append(li);
  });
}
async function boot() {
  if (!getToken()) return;
  try {
    const { user } = await api("/api/auth/me");
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    document.querySelector("#user-name").textContent = user.username;
    await refresh();
  } catch { clearSession(); }
}
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(authError, "");
  const fd = new FormData(authForm);
  try {
    const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", { method: "POST", body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }) });
    setSession(data.token);
    authForm.reset();
    await boot();
  } catch (err) { showError(authError, err.message); }
});
document.querySelector("#logout").addEventListener("click", () => { clearSession(); appView.classList.add("hidden"); authView.classList.remove("hidden"); });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(formError, "");
  const options = [...document.querySelectorAll(".option")].map((input) => input.value.trim()).filter(Boolean);
  try {
    await api("/api/polls", { method: "POST", body: JSON.stringify({ question: document.querySelector("#question").value.trim(), options }) });
    form.reset();
    await refresh();
  } catch (err) { showError(formError, err.message); }
});
boot();
