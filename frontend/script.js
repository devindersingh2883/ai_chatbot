/* ================= Config ================= */
// Agar page FastAPI se khula hai (http://127.0.0.1:8000) to same server use hota hai.
// Agar index.html seedha file:// se khola, ya Colab tunnel use karna ho to "Backend URL" button se set karo.
const STORAGE_KEY = "ai-chatbot-chats-v2";
const URL_KEY = "ai-chatbot-backend-url";
const THEME_KEY = "ai-chatbot-theme";

function getApiBase() {
  const saved = localStorage.getItem(URL_KEY);
  if (saved) return saved.replace(/\/+$/, "");
  return location.protocol === "file:" ? "http://127.0.0.1:8000" : "";
}

const $ = id => document.getElementById(id);
const els = {
  sidebar: $("sidebar"), backdrop: $("backdrop"), chatList: $("chatList"), chatTitle: $("chatTitle"),
  messages: $("messages"), input: $("input"), sendBtn: $("sendBtn"), stopBtn: $("stopBtn"),
  newChatBtn: $("newChatBtn"), clearBtn: $("clearBtn"), menuBtn: $("menuBtn"),
  searchInput: $("searchInput"), themeBtn: $("themeBtn"), settingsBtn: $("settingsBtn"),
  exportBtn: $("exportBtn"), status: $("status"), statusText: $("statusText"), toast: $("toast"),
};

let chats = loadChats();
let currentId = null;
let busy = false;
let controller = null;
let filter = "";

/* ================= Storage ================= */
function loadChats() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } }
function saveChats() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(chats)); } catch {} }
function getCurrent() { return chats.find(c => c.id === currentId); }

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  setTimeout(() => els.toast.classList.remove("show"), 1600);
}

/* ================= Markdown-lite (safe) ================= */
function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function renderMarkdown(text) {
  return text.split(/```/).map((part, i) => {
    if (i % 2 === 1) {
      let lang = "", code = part;
      const nl = part.indexOf("\n");
      if (nl >= 0 && /^[\w+#-]*$/.test(part.slice(0, nl).trim())) {
        lang = part.slice(0, nl).trim();
        code = part.slice(nl + 1);
      }
      return `<div class="code"><div class="code-head"><span>${esc(lang || "code")}</span>` +
             `<button class="copy-code">Copy</button></div><pre><code>${esc(code.replace(/\n$/, ""))}</code></pre></div>`;
    }
    return esc(part)
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  }).join("");
}

/* ================= Chat management ================= */
function newChat() {
  const empty = chats.find(c => c.messages.length === 0);
  if (empty) { currentId = empty.id; }
  else {
    const chat = { id: String(Date.now()), title: "New chat", messages: [] };
    chats.unshift(chat);
    currentId = chat.id;
    saveChats();
  }
  render();
  els.input.focus();
}

function deleteChat(id) {
  if (busy) return;
  chats = chats.filter(c => c.id !== id);
  if (currentId === id) currentId = chats[0] ? chats[0].id : null;
  saveChats();
  if (!currentId) newChat(); else render();
}

/* ================= Rendering ================= */
function render() { renderSidebar(); renderMessages(); }

function renderSidebar() {
  els.chatList.innerHTML = "";
  const list = chats.filter(c => c.title.toLowerCase().includes(filter));
  if (list.length === 0) {
    const d = document.createElement("div");
    d.className = "empty-list";
    d.textContent = "No chats found";
    els.chatList.appendChild(d);
  }
  list.forEach(chat => {
    const li = document.createElement("li");
    if (chat.id === currentId) li.classList.add("active");
    const span = document.createElement("span");
    span.textContent = chat.title;
    span.title = chat.title;
    const del = document.createElement("button");
    del.textContent = "×";
    del.title = "Delete chat";
    del.onclick = e => { e.stopPropagation(); deleteChat(chat.id); };
    li.append(span, del);
    li.onclick = () => { if (busy) return; currentId = chat.id; closeSidebar(); render(); };
    els.chatList.appendChild(li);
  });
  const cur = getCurrent();
  els.chatTitle.textContent = cur ? cur.title : "New chat";
}

const SUGGESTIONS = [
  "Explain what an API is in simple words",
  "Write a Python function to reverse a string",
  "Give me 5 business name ideas",
  "Draft a polite SMS for a payment reminder",
];

function renderMessages() {
  els.messages.innerHTML = "";
  const chat = getCurrent();
  if (!chat || chat.messages.length === 0) {
    const w = document.createElement("div");
    w.className = "welcome";
    w.innerHTML = "<h2>How can I help you today?</h2><p>Type a message below or try one of these.</p>";
    const chips = document.createElement("div");
    chips.className = "chips";
    SUGGESTIONS.forEach(s => {
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = s;
      b.onclick = () => sendMessage(s);
      chips.appendChild(b);
    });
    w.appendChild(chips);
    els.messages.appendChild(w);
    return;
  }
  chat.messages.forEach((m, i) => addRow(m, i === chat.messages.length - 1));
  scrollToBottom();
}

function addRow(msg, isLast) {
  const row = document.createElement("div");
  row.className = "row " + (msg.role === "user" ? "user" : "ai");
  const bubble = document.createElement("div");
  bubble.className = "bubble" + (msg.error ? " error" : "");
  if (msg.role === "user" || msg.error) bubble.textContent = msg.content;
  else bubble.innerHTML = renderMarkdown(msg.content);
  row.appendChild(bubble);

  if (msg.role === "assistant" && !busy) {
    const actions = document.createElement("div");
    actions.className = "actions";
    const copy = document.createElement("button");
    copy.textContent = "Copy";
    copy.onclick = () => navigator.clipboard.writeText(msg.content).then(() => toast("Copied"));
    actions.appendChild(copy);
    if (isLast) {
      const regen = document.createElement("button");
      regen.textContent = "Regenerate";
      regen.onclick = regenerate;
      actions.appendChild(regen);
    }
    row.appendChild(actions);
  }
  els.messages.appendChild(row);
  return bubble;
}

function scrollToBottom() { els.messages.scrollTop = els.messages.scrollHeight; }

function setBusy(state) {
  busy = state;
  els.sendBtn.classList.toggle("hidden", state);
  els.stopBtn.classList.toggle("hidden", !state);
}

/* ================= Sending / streaming ================= */
async function sendMessage(textArg) {
  const text = (typeof textArg === "string" ? textArg : els.input.value).trim();
  if (!text || busy) return;
  if (!getCurrent()) newChat();
  const chat = getCurrent();

  chat.messages.push({ role: "user", content: text });
  if (chat.title === "New chat") chat.title = text.slice(0, 30);
  els.input.value = "";
  els.input.style.height = "auto";
  await generate(chat);
}

async function regenerate() {
  const chat = getCurrent();
  if (!chat || busy) return;
  while (chat.messages.length && chat.messages[chat.messages.length - 1].role === "assistant") chat.messages.pop();
  if (chat.messages.length === 0) return;
  await generate(chat);
}

// Last message = user ka sawal. Uska jawab stream karta hai.
async function generate(chat) {
  const userMsg = chat.messages[chat.messages.length - 1];
  const history = chat.messages.slice(0, -1)
    .filter(m => !m.error && m.content)
    .slice(-10)
    .map(m => ({ role: m.role, content: m.content }));

  const aiMsg = { role: "assistant", content: "" };
  setBusy(true);
  renderSidebar();

  els.messages.innerHTML = "";
  chat.messages.forEach(m => addRow(m, false));
  const row = document.createElement("div");
  row.className = "row ai";
  const bubble = document.createElement("div");
  bubble.className = "bubble typing";
  bubble.textContent = "Thinking...";
  row.appendChild(bubble);
  els.messages.appendChild(row);
  scrollToBottom();

  controller = new AbortController();
  try {
    const res = await fetch(getApiBase() + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "1" },
      body: JSON.stringify({ message: userMsg.content, history }),
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = res.statusText;
      try { const d = await res.json(); detail = typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail); } catch {}
      throw new Error(detail || ("HTTP " + res.status));
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      aiMsg.content += decoder.decode(value, { stream: true });
      bubble.classList.remove("typing");
      bubble.innerHTML = renderMarkdown(aiMsg.content);
      scrollToBottom();
    }
    aiMsg.content += decoder.decode();
    if (!aiMsg.content.trim()) aiMsg.content = "(No response received.)";
    chat.messages.push(aiMsg);
  } catch (err) {
    if (err.name === "AbortError") {
      if (aiMsg.content.trim()) chat.messages.push(aiMsg);   // jitna aaya utna rakho
      toast("Stopped");
    } else {
      chat.messages.push({
        role: "assistant", error: true,
        content: "Response nahi mila: " + err.message + "\n(Backend chal raha hai? URL: " + (getApiBase() || location.origin) + ")",
      });
    }
  } finally {
    controller = null;
    saveChats();
    setBusy(false);
    render();
    els.input.focus();
  }
}

/* ================= Backend status ================= */
async function checkStatus() {
  els.status.className = "status";
  els.statusText.textContent = "checking";
  try {
    const res = await fetch(getApiBase() + "/api/health", { headers: { "ngrok-skip-browser-warning": "1" } });
    const d = await res.json();
    els.status.className = "status ok";
    els.statusText.textContent = d.provider + " mode";
  } catch {
    els.status.className = "status bad";
    els.statusText.textContent = "offline";
  }
}

/* ================= Theme / settings / export ================= */
function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); localStorage.setItem(THEME_KEY, t); }
els.themeBtn.onclick = () => applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");

els.settingsBtn.onclick = () => {
  const cur = localStorage.getItem(URL_KEY) || "";
  const v = prompt("Backend URL (khaali chhodo = same server / http://127.0.0.1:8000).\nColab ke liye ngrok URL daalo:", cur);
  if (v === null) return;
  if (v.trim()) localStorage.setItem(URL_KEY, v.trim()); else localStorage.removeItem(URL_KEY);
  checkStatus();
};

els.exportBtn.onclick = () => {
  const chat = getCurrent();
  if (!chat || chat.messages.length === 0) return toast("Nothing to export");
  const txt = chat.messages.map(m => (m.role === "user" ? "You: " : "AI: ") + m.content).join("\n\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain" }));
  a.download = (chat.title || "chat").replace(/[^\w-]+/g, "_") + ".txt";
  a.click();
  URL.revokeObjectURL(a.href);
};

/* ================= Events ================= */
els.sendBtn.onclick = () => sendMessage();
els.stopBtn.onclick = () => { if (controller) controller.abort(); };
els.input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendMessage(); }
});
els.input.addEventListener("input", () => {
  els.input.style.height = "auto";
  els.input.style.height = Math.min(els.input.scrollHeight, 160) + "px";
});
els.newChatBtn.onclick = () => { if (!busy) { newChat(); closeSidebar(); } };
els.clearBtn.onclick = () => {
  const chat = getCurrent();
  if (!chat || busy) return;
  chat.messages = []; chat.title = "New chat";
  saveChats(); render();
};
els.searchInput.oninput = e => { filter = e.target.value.trim().toLowerCase(); renderSidebar(); };
function closeSidebar() { els.sidebar.classList.remove("open"); els.backdrop.classList.remove("show"); }
els.menuBtn.onclick = () => { els.sidebar.classList.toggle("open"); els.backdrop.classList.toggle("show"); };
els.backdrop.onclick = closeSidebar;

// Code block "Copy" buttons (event delegation)
els.messages.addEventListener("click", e => {
  const btn = e.target.closest(".copy-code");
  if (!btn) return;
  const code = btn.closest(".code").querySelector("code").textContent;
  navigator.clipboard.writeText(code).then(() => { btn.textContent = "Copied"; setTimeout(() => btn.textContent = "Copy", 1200); });
});

/* ================= Start ================= */
applyTheme(localStorage.getItem(THEME_KEY) || "light");
if (chats.length === 0) newChat(); else { currentId = chats[0].id; render(); }
checkStatus();
