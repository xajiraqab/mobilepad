import { Events } from "@wailsio/runtime";
import { ServerService } from "../bindings/mobilepad/server";

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const startBtn = document.getElementById("startBtn");
const startBtnText = document.getElementById("startBtnText");
const startSpinner = document.getElementById("startSpinner");
const stopBtn = document.getElementById("stopBtn");
const startArea = document.getElementById("startArea");
const runningArea = document.getElementById("runningArea");
const clientCount = document.getElementById("clientCount");
const clientsList = document.getElementById("clientsList");
const emptyState = document.getElementById("emptyState");
const errorBox = document.getElementById("errorBox");
const themeBtn = document.getElementById("themeBtn");
const trayBtn = document.getElementById("trayBtn");
const iconSun = document.getElementById("iconSun");
const iconMoon = document.getElementById("iconMoon");
const brandIcon = document.getElementById("brandIcon");

let currentStatus = null;
let busy = false;

function setError(message) {
  if (!message) {
    errorBox.textContent = "";
    errorBox.classList.add("hidden");
    return;
  }
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function setStarting(loading) {
  startBtn.disabled = loading;
  startBtn.classList.toggle("is-loading", loading);
  startSpinner.classList.toggle("hidden", !loading);
  startBtnText.textContent = loading ? "Starting..." : "Start Server";
}

function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("mobilepad-theme", t); } catch {}
  if (iconSun) iconSun.classList.toggle("hidden", t !== "dark");
  if (iconMoon) iconMoon.classList.toggle("hidden", t !== "light");
  if (brandIcon) brandIcon.src = t === "dark" ? "/icon.png" : "/icon-light.png";
}

applyTheme((() => { try { return localStorage.getItem("mobilepad-theme"); } catch { return "dark"; } })() || "dark");
themeBtn?.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

trayBtn?.addEventListener("click", async () => {
  try { await ServerService.HideToTray(); } catch (err) { console.error(err); }
});

function deviceIconSrc(platform, osName) {
  const p = (platform || osName || "").toLowerCase();
  if (p.includes("android")) return "/android.svg";
  if (p.includes("ios") || p.includes("iphone") || p.includes("ipad") || p.includes("apple")) return "/apple.svg";
  return "/phone.svg";
}

function clientIp(addr) {
  if (!addr) return "";
  const m = addr.match(/^(.*):(\d+)$/);
  if (m && m[1].includes(".")) return m[1];
  return addr;
}

function renderClients(list) {
  clientsList.innerHTML = "";
  const items = Array.isArray(list) ? list : [];
  clientCount.textContent = `${items.length} ${items.length === 1 ? "client" : "clients"}`;
  emptyState.classList.toggle("hidden", items.length > 0);
  for (const c of items) {
    const row = document.createElement("div");
    row.className = "client-row";

    const icon = document.createElement("div");
    icon.className = "client-icon";
    const img = document.createElement("img");
    img.src = deviceIconSrc(c.platform, c.osName);
    img.alt = c.platform || "device";
    img.className = "client-icon-img";
    icon.appendChild(img);

    const info = document.createElement("div");
    info.className = "client-info";
    const name = document.createElement("div");
    name.className = "client-name";
    name.textContent = c.model || c.name || "Unknown device";
    const meta = document.createElement("div");
    meta.className = "client-meta";
    meta.textContent = clientIp(c.addr);
    info.appendChild(name);
    info.appendChild(meta);

    const btn = document.createElement("button");
    btn.className = "btn btn-ghost btn-small";
    btn.textContent = "Disconnect";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const status = await ServerService.DisconnectClient(c.id);
        renderStatus(status);
      } catch (err) {
        setError(String(err?.message || err));
      } finally {
        btn.disabled = false;
      }
    });

    row.appendChild(icon);
    row.appendChild(info);
    row.appendChild(btn);
    clientsList.appendChild(row);
  }
}

function renderStatus(status) {
  currentStatus = status;
  const running = !!status?.running;
  statusDot.className = `dot ${running ? "dot-on" : "dot-off"}`;
  statusText.textContent = running ? "Running" : "Stopped";

  startArea.classList.toggle("hidden", running);
  runningArea.classList.toggle("hidden", !running);
  stopBtn.disabled = busy;

  if (!busy) setStarting(false);

  renderClients(status?.clientList || []);
  setError(status?.lastError || "");
}

async function refreshStatus() {
  try {
    const status = await ServerService.GetStatus();
    renderStatus(status);
  } catch (err) {
    setError(String(err?.message || err));
  }
}

async function startServer() {
  if (busy) return;
  busy = true;
  setError("");
  setStarting(true);
  try {
    const status = await ServerService.StartServer();
    renderStatus(status);
  } catch (err) {
    setError(String(err?.message || err));
  } finally {
    busy = false;
    setStarting(false);
    await refreshStatus();
  }
}

async function stopServer() {
  if (busy) return;
  busy = true;
  stopBtn.disabled = true;
  setError("");
  try {
    const status = await ServerService.StopServer();
    renderStatus(status);
  } catch (err) {
    setError(String(err?.message || err));
  } finally {
    busy = false;
    await refreshStatus();
  }
}

startBtn.addEventListener("click", startServer);
stopBtn.addEventListener("click", stopServer);

Events.On("server:status", (ev) => {
  if (ev?.data) renderStatus(ev.data);
});

await refreshStatus();
setInterval(refreshStatus, 2000);
