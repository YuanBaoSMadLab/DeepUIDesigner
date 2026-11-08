import { state, addShot } from "./state.js";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function markdown(value) {
  let text = escapeHtml(value);
  const blocks = [];
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    blocks.push(`<pre><code>${code.replace(/\n$/, "")}</code></pre>`);
    return `\u0000BLOCK${blocks.length - 1}\u0000`;
  });
  text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|\n)[-*] (.+)/g, "$1• $2");
  const html = text
    .split(/\n{2,}/)
    .map(part => part.trim() ? `<p>${part.replace(/\n/g, "<br>")}</p>` : "")
    .join("");
  return html.replace(/\u0000BLOCK(\d+)\u0000/g, (_, i) => blocks[+i] || "");
}

export function openImage(url) {
  const wrap = document.createElement("div");
  wrap.className = "image-viewer";
  const img = document.createElement("img");
  img.src = url;
  wrap.appendChild(img);
  wrap.addEventListener("click", () => wrap.remove());
  document.body.appendChild(wrap);
}

export class Timeline {
  constructor(root, callbacks = {}) {
    this.root = root;
    this.callbacks = callbacks;
    this.runs = new Map();
    this.current = null;
  }

  hideEmpty() {
    const empty = document.getElementById("emptyState");
    if (empty) empty.hidden = true;
  }

  atBottom() {
    return this.root.scrollHeight - this.root.scrollTop - this.root.clientHeight < 140;
  }

  scroll(force = false) {
    if (force || this.atBottom()) {
      requestAnimationFrame(() => { this.root.scrollTop = this.root.scrollHeight; });
    }
  }

  addUser(text, selectionText) {
    this.hideEmpty();
    const el = document.createElement("div");
    el.className = "user-msg";
    el.textContent = text;
    if (selectionText) {
      const chip = document.createElement("div");
      chip.className = "msg-chip";
      chip.textContent = selectionText;
      el.appendChild(chip);
    }
    this.root.appendChild(el);
    this.scroll(true);
  }

  addSystem(text) {
    this.hideEmpty();
    const el = document.createElement("div");
    el.className = "sys-msg";
    el.textContent = text;
    this.root.appendChild(el);
    this.scroll();
  }

  addError(text) {
    this.hideEmpty();
    const el = document.createElement("div");
    el.className = "error-msg";
    el.textContent = text;
    this.root.appendChild(el);
    this.scroll(true);
  }

  handle(event) {
    if (event.type === "plan") { this.startRun(event); return; }
    const run = this.current;
    if (!run) {
      if (event.type === "error") this.addError(event.content);
      return;
    }
    switch (event.type) {
      case "phase": this.phase(run, event); break;
      case "reasoning": this.reasoning(run, event.content); break;
      case "text": this.text(run, event.content); break;
      case "tool_start": this.toolStart(run, event); break;
      case "tool_result": this.toolResult(run, event); break;
      case "image": this.image(run, event); break;
      case "usage": run.metrics.tokens = event.totalTokens || run.metrics.tokens; break;
      case "error": this.error(run, event.content); break;
      case "done": this.done(run, event); break;
      default: break;
    }
  }

  startRun(event) {
    this.hideEmpty();
    const el = document.createElement("article");
    el.className = "run-card";
    el.innerHTML = `
      <header class="run-head">
        <span class="run-title">Agent 运行</span>
        <span class="run-sub">${escapeHtml(event.runId || "")}</span>
        <span class="run-state running"><span class="dot busy"></span><span class="state-text">启动中</span></span>
      </header>
      <div class="phase-strip"></div>
      <div class="run-body">
        <div class="reasoning" hidden>
          <div class="reasoning-head">
            <span class="live"></span><strong>推理过程</strong><span class="reasoning-note">实时</span>
            <span class="toggle">收起</span>
          </div>
          <div class="reasoning-body"></div>
        </div>
        <div class="tool-area"></div>
        <div class="answer"></div>
        <div class="run-foot" hidden></div>
      </div>`;
    this.root.appendChild(el);

    const strip = el.querySelector(".phase-strip");
    const phases = new Map();
    for (const [index, step] of (event.steps || []).entries()) {
      const pill = document.createElement("span");
      pill.className = "phase-step";
      pill.dataset.id = step.id;
      pill.innerHTML = `<span class="idx">${index + 1}</span><span>${escapeHtml(step.label)}</span>`;
      strip.appendChild(pill);
      phases.set(step.id, pill);
    }

    const run = {
      el,
      runId: event.runId,
      phases,
      toolCards: new Map(),
      reasoningEl: el.querySelector(".reasoning"),
      reasoningBody: el.querySelector(".reasoning-body"),
      answerEl: el.querySelector(".answer"),
      toolArea: el.querySelector(".tool-area"),
      foot: el.querySelector(".run-foot"),
      stateText: el.querySelector(".state-text"),
      stateWrap: el.querySelector(".run-state"),
      answerRaw: "",
      reasoningRaw: "",
      metrics: { tokens: 0 },
      changed: false,
      verified: false,
      failed: false,
      finished: false,
    };

    el.querySelector(".reasoning-head").addEventListener("click", () => {
      run.reasoningEl.classList.toggle("collapsed");
      const t = el.querySelector(".toggle");
      t.textContent = run.reasoningEl.classList.contains("collapsed") ? "展开" : "收起";
    });

    this.current = run;
    this.runs.set(event.runId, run);
    state.lastRun = run;
    this.scroll(true);
  }

  phase(run, event) {
    const pill = run.phases.get(event.id);
    if (pill) {
      pill.classList.remove("active", "done", "error");
      if (event.status === "start") pill.classList.add("active");
      else if (event.status === "done") pill.classList.add("done");
      else if (event.status === "error") pill.classList.add("error");
      if (event.status === "start") {
        run.stateText.textContent = event.detail ? `${event.label} · ${event.detail}` : event.label;
      }
    }
    if (event.status === "error" && !run.finished) {
      run.stateWrap.className = "run-state failed";
    }
    this.scroll();
  }

  reasoning(run, content) {
    if (!content) return;
    run.reasoningEl.hidden = false;
    run.reasoningRaw += content;
    run.reasoningBody.textContent = run.reasoningRaw;
    run.reasoningBody.scrollTop = run.reasoningBody.scrollHeight;
    this.scroll();
  }

  text(run, content) {
    if (!content) return;
    run.answerRaw += content;
    run.answerEl.innerHTML = markdown(run.answerRaw) + '<span class="stream-cursor"></span>';
    this.scroll();
  }

  toolStart(run, event) {
    const card = document.createElement("div");
    card.className = "tool-card";
    const args = event.args && Object.keys(event.args).length
      ? Object.entries(event.args).map(([k, v]) => `${k}=${String(v).slice(0, 80)}`).join(" · ")
      : "";
    card.innerHTML = `
      <div class="tool-head">
        <span class="tool-name">${escapeHtml(event.label || event.name)}</span>
        <span class="tool-code">${escapeHtml(event.name)}</span>
        <span class="tool-status running">运行中</span>
      </div>
      ${args ? `<pre class="tool-out">${escapeHtml(args)}</pre>` : ""}
      <pre class="tool-out result"></pre>`;
    run.toolArea.appendChild(card);
    run.toolCards.set(event.id, card);
    this.scroll();
  }

  toolResult(run, event) {
    let card = run.toolCards.get(event.id);
    if (!card) {
      this.toolStart(run, { id: event.id, name: event.name, label: event.label, args: {} });
      card = run.toolCards.get(event.id);
    }
    if (!card) return;
    const status = card.querySelector(".tool-status");
    status.className = `tool-status ${event.ok ? "ok" : "fail"}`;
    status.textContent = event.ok ? "完成" : "失败";
    const out = card.querySelector(".result");
    out.textContent = event.text || "";
    if (event.image) {
      const img = document.createElement("img");
      img.className = "tool-image";
      img.src = event.image.url;
      img.alt = "界面截图";
      img.addEventListener("click", () => openImage(event.image.url));
      card.appendChild(img);
      addShot(event.image, event.label || "界面截图");
    }
    this.scroll();
  }

  image(run, event) {
    if (!event.image) return;
    addShot(event.image, event.label || "界面截图");
    if (this.callbacks.onShot) this.callbacks.onShot();
  }

  error(run, content) {
    run.failed = true;
    run.stateWrap.className = "run-state failed";
    run.stateText.textContent = "运行失败";
    const el = document.createElement("div");
    el.className = "error-msg";
    el.textContent = content;
    run.toolArea.appendChild(el);
    this.scroll(true);
  }

  done(run, event) {
    run.finished = true;
    run.changed = event.changed;
    run.verified = event.verified;
    run.stateWrap.className = `run-state ${run.failed ? "failed" : "done"}`;
    run.stateText.textContent = run.failed ? "运行失败" : (event.changed ? "修改完成" : "完成");

    const cursor = run.answerEl.querySelector(".stream-cursor");
    if (cursor) cursor.remove();
    const live = run.reasoningEl.querySelector(".live");
    if (live) live.style.display = "none";
    const note = run.reasoningEl.querySelector(".reasoning-note");
    if (note) note.textContent = "已完成";

    for (const pill of run.phases.values()) {
      if (pill.classList.contains("active")) {
        pill.classList.remove("active");
        pill.classList.add("done");
      } else if (!pill.classList.contains("done") && !pill.classList.contains("error")) {
        pill.classList.add("skipped");
      }
    }

    run.foot.hidden = false;
    run.foot.innerHTML = `
      <div class="metrics">
        <span>${(event.timeMs / 1000).toFixed(1)}s</span>
        <span>${event.steps} 步</span>
        <span>${event.tokens ? `${event.tokens} tokens` : ""}</span>
        <span class="badge ${event.changed ? "warn" : ""}">${event.changed ? "文件已修改" : "未修改文件"}</span>
        ${event.changed ? `<span class="badge ${event.verified ? "ok" : "warn"}">${event.verified ? "布局已检查" : "未完成布局检查"}</span>` : ""}
      </div>
      <div class="actions">
        ${event.changed ? '<button class="revert-run">回退本次运行</button>' : ""}
        <button class="open-history">版本历史</button>
      </div>`;

    run.foot.querySelector(".revert-run")?.addEventListener("click", () => {
      if (this.callbacks.onRevertRun) this.callbacks.onRevertRun(event.runId);
    });
    run.foot.querySelector(".open-history")?.addEventListener("click", () => {
      if (this.callbacks.onOpenHistory) this.callbacks.onOpenHistory();
    });

    state.lastRun = { ...event, run };
    if (this.callbacks.onDone) this.callbacks.onDone(event);
    this.scroll(true);
  }

  clear() {
    this.root.innerHTML = "";
    this.runs.clear();
    this.current = null;
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.id = "emptyState";
    empty.innerHTML = `
      <div class="empty-title">OmniDesigner Agent</div>
      <p>打开一个 .ui 文件，在设计器里选中控件，然后描述你想改什么。</p>
      <p class="muted">Agent 会读取界面、检查遮挡、修改文件，并给出可回退的版本。</p>`;
    this.root.appendChild(empty);
  }
}
