const KEY = "personal-todos-v3",
  THEME = "todo-theme-v2",
  ymd = (d) => {
    const m = d.getMonth() + 1,
      day = d.getDate();
    return `${d.getFullYear()}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  },
  today = () => ymd(new Date()),
  id = () =>
    crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  fmt = (d) =>
    new Date(d + "T00:00:00").toLocaleDateString("ar-EG", {
      day: "numeric",
      month: "long",
    }),
  addDate = (date, repeat) => {
    const d = new Date(date + "T00:00:00");
    if (repeat === "daily") d.setDate(d.getDate() + 1);
    if (repeat === "weekly") d.setDate(d.getDate() + 7);
    if (repeat === "monthly") d.setMonth(d.getMonth() + 1);
    return ymd(d);
  },
  addDays = (dateStr, days) => {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + days);
    return ymd(d);
  };
const defaults = {
  tasks: [],
  lists: [
    { id: "inbox", name: "الوارد", icon: "✦" },
    { id: "personal", name: "شخصي", icon: "○" },
  ],
  theme: "",
};
let stored = JSON.parse(localStorage.getItem(KEY) || "null"),
  data = Array.isArray(stored)
    ? {
        ...defaults,
        tasks: stored.map((t) => ({
          ...t,
          list: "inbox",
          priority: t.high ? "high" : "normal",
          repeat: "",
        })),
      }
    : stored || defaults,
  view = "today",
  activePriority = "all",
  search = "",
  deferredInstall,
  lastCompletedId = null;
data.tasks = data.tasks || [];
data.lists = data.lists?.length ? data.lists : defaults.lists;
const $ = (s) => document.querySelector(s),
  save = () => localStorage.setItem(KEY, JSON.stringify(data)),
  remaining = () => data.tasks.filter((t) => !t.done).length;
async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return;
  try {
    if (!(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch (error) {
    console.warn("تعذر تفعيل التخزين الدائم", error);
  }
}
const views = [
  ["today", "اليوم", "☀"],
  ["upcoming", "القادمة", "→"],
  ["done", "المنجزة", "✓"],
  ["all", "كل المهام", "□"],
];
const priorityNames = {
  high: "مهمة",
  medium: "متوسطة",
  normal: "عادية",
};
const DELETE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14M10 11v6M14 11v6"/></svg>`;

function announce(message) {
  const el = $("#status-announcer");
  if (!el) return;
  el.textContent = "";
  requestAnimationFrame(() => {
    el.textContent = message;
  });
}

function showToast(message, actionLabel, onAction) {
  const stack = $("#toast-stack");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  const text = document.createElement("span");
  text.textContent = message;
  toast.appendChild(text);
  let timeoutId;
  const dismiss = () => {
    clearTimeout(timeoutId);
    toast.remove();
  };
  if (actionLabel && onAction) {
    const action = document.createElement("button");
    action.type = "button";
    action.className = "toast-action";
    action.textContent = actionLabel;
    action.onclick = () => {
      onAction();
      dismiss();
    };
    toast.appendChild(action);
    timeoutId = setTimeout(dismiss, 8000);
  } else {
    timeoutId = setTimeout(dismiss, 3500);
  }
  stack.appendChild(toast);
}

function navButtonHtml(v, counts, { mobile = false } = {}) {
  const active = view === v[0] && activePriority === "all";
  const count = counts[v[0]];
  if (mobile) {
    const iconDir = v[0] === "upcoming" ? " nav-icon--dir" : "";
    return `<button type="button" class="${active ? "active" : ""}" data-view="${v[0]}" aria-current="${active ? "page" : "false"}"><span class="nav-icon${iconDir}" aria-hidden="true">${v[2]}</span><span class="nav-text">${v[1]}</span></button>`;
  }
    const iconDir = v[0] === "upcoming" ? " nav-icon--dir" : "";
    return `<button type="button" class="${active ? "active" : ""}" data-view="${v[0]}" aria-current="${active ? "page" : "false"}"><span class="nav-label"><span class="nav-icon${iconDir}" aria-hidden="true">${v[2]}</span><span>${v[1]}</span></span><b class="count">${count}</b></button>`;
}

function nav() {
  const now = today(),
    counts = {
      today: data.tasks.filter((t) => t.due <= now && !t.done).length,
      upcoming: data.tasks.filter((t) => !t.done && t.due > now).length,
      all: remaining(),
      done: data.tasks.filter((t) => t.done).length,
    };
  $("#side-nav").innerHTML = views.map((v) => navButtonHtml(v, counts)).join("");
  $("#mobile-nav").innerHTML = views
    .map((v) => navButtonHtml(v, counts, { mobile: true }))
    .join("");
  const priorities = [
    ["high", "مهمة", "!"],
    ["medium", "متوسطة", "▲"],
    ["normal", "عادية", "○"],
    ["all", "كل الأولويات", "◆"],
  ];
  $("#priorities").innerHTML = priorities
    .map((p) => {
      const active = activePriority === p[0];
      const count = data.tasks.filter(
        (t) => !t.done && (p[0] === "all" || t.priority === p[0]),
      ).length;
      return `<button type="button" class="list-button ${active ? "active" : ""}" data-priority="${p[0]}" aria-pressed="${active}"><span class="nav-label"><span class="nav-icon" aria-hidden="true">${p[2]}</span><span>${p[1]}</span></span><b class="count">${count}</b></button>`;
    })
    .join("");
  document.querySelectorAll("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        view = b.dataset.view;
        activePriority = "all";
        render();
      }),
  );
  document.querySelectorAll("[data-priority]").forEach(
    (b) =>
      (b.onclick = () => {
        activePriority = b.dataset.priority;
        view = "all";
        render();
      }),
  );
}

function dueMeta(t) {
  const now = today(),
    tomorrow = addDays(now, 1);
  if (t.done) {
    return { label: t.due === now ? "اليوم" : fmt(t.due), chipClass: "" };
  }
  if (t.due < now) {
    return { label: `متأخرة · ${fmt(t.due)}`, chipClass: "late" };
  }
  if (t.due === now) {
    return { label: "اليوم", chipClass: "today" };
  }
  if (t.due === tomorrow) {
    return { label: "غداً", chipClass: "soon" };
  }
  if (t.due <= addDays(now, 3)) {
    return { label: `قريباً · ${fmt(t.due)}`, chipClass: "soon" };
  }
  return { label: fmt(t.due), chipClass: "" };
}

function emptyStateHtml() {
  if (search) {
    return `<div class="empty" role="status">
      <span class="empty-icon" aria-hidden="true">⌕</span>
      <strong class="empty-title">لا توجد نتائج</strong>
      <span class="empty-desc">جرّب كلمة مختلفة أو امسح البحث لعرض كل المهام في هذا القسم.</span>
      <div class="empty-actions">
        <button type="button" class="btn-secondary" id="empty-clear-search">مسح البحث</button>
      </div>
    </div>`;
  }
  const hints = {
    today: "المهام المستحقة اليوم أو قبل ذلك تظهر هنا. أضف مهمة وحدّد موعداً إن لزم.",
    upcoming: "المهام ذات موعد لاحق تظهر هنا — خطّط قبل الموعد.",
    all: "كل المهام النشطة في مكان واحد. استخدم الأولوية من الشريط الجانبي للتركيز.",
    done: "عند إنجاز مهمة تنتقل إلى هنا. يمكنك إلغاء الإنجاز من دائرة الاختيار.",
  };
  return `<div class="empty" role="status">
    <span class="empty-icon" aria-hidden="true">✓</span>
    <strong class="empty-title">لا توجد مهام هنا</strong>
    <span class="empty-desc">${hints[view] || hints.all}</span>
    <div class="empty-actions">
      <button type="button" class="btn-primary" id="empty-focus-add">إضافة مهمة</button>
      <button type="button" class="btn-secondary" id="empty-advanced">تفاصيل أكثر</button>
    </div>
  </div>`;
}

function bindEmptyActions() {
  $("#empty-clear-search")?.addEventListener("click", () => {
    $("#search").value = "";
    search = "";
    render();
    $("#search").focus();
  });
  $("#empty-focus-add")?.addEventListener("click", () => {
    $("#quick-text").focus();
  });
  $("#empty-advanced")?.addEventListener("click", () => openModal());
}

function render() {
  nav();
  const now = today(),
    list = data.tasks.filter((t) => {
      if (activePriority !== "all" && t.priority !== activePriority)
        return false;
      if (search && !t.text.toLowerCase().includes(search.toLowerCase()))
        return false;
      if (view === "today")
        return !t.done ? t.due <= now : t.due === now;
      if (view === "upcoming") return !t.done && t.due > now;
      if (view === "done") return t.done;
      return !t.done;
    });
  const names = {
    today: "اليوم",
    upcoming: "القادمة",
    all: "كل المهام",
    done: "المنجزة",
  };
  $("#page-title").textContent =
    activePriority === "all"
      ? names[view]
      : priorityNames[activePriority] || "مهامي";
  $("#date-label").textContent = new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const daily = data.tasks.filter((t) => t.due === now),
    dailyDone = daily.filter((t) => t.done).length,
    dailyOpen = daily.length - dailyDone;
  const showProgress =
    daily.length && view === "today" && activePriority === "all" && !search;
  $("#summary").textContent = showProgress
    ? dailyOpen > 0
      ? `${dailyOpen} ${dailyOpen === 1 ? "مهمة متبقية" : "مهام متبقية"} لليوم`
      : "أنجزت كل مهام اليوم — أحسنت"
    : dailyOpen > 0
      ? `${dailyOpen} ${dailyOpen === 1 ? "مهمة لليوم" : "مهام لليوم"} · ${remaining()} نشطة`
      : daily.length
        ? "أنجزت كل مهام اليوم"
        : `${remaining()} ${remaining() === 1 ? "مهمة نشطة" : "مهام نشطة"}`;
  $("#filters").innerHTML = views
    .map((v) => {
      const active = view === v[0] && activePriority === "all";
      return `<button type="button" role="tab" aria-selected="${active}" class="${active ? "active" : ""}" data-view="${v[0]}">${v[1]}</button>`;
    })
    .join("");
  $("#filters")
    .querySelectorAll("[data-view]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          view = b.dataset.view;
          activePriority = "all";
          render();
        }),
    );
  const progressBlock = $("#progress-block"),
    pct = daily.length ? Math.round((dailyDone / daily.length) * 100) : 0;
  if (showProgress) {
    progressBlock.hidden = false;
    $("#progress-label").textContent = "تقدم اليوم";

    // — Count tick animation —
    const valEl = $("#progress-value");
    const newText = `${dailyDone} من ${daily.length}`;
    if (valEl.textContent !== newText) {
      valEl.classList.add("ticking");
      setTimeout(() => {
        valEl.textContent = newText;
        valEl.classList.remove("ticking");
      }, 150);
    } else {
      valEl.textContent = newText;
    }

    $("#progress-bar").setAttribute("aria-valuenow", String(pct));
    $("#progress-bar").setAttribute(
      "aria-valuetext",
      `${dailyDone} من ${daily.length} مكتملة`,
    );

    // — Fill classes: has-progress / complete / just-advanced —
    const fillEl = $("#progress");
    const prevPct = parseFloat(fillEl.style.width) || 0;
    const advancing = pct > prevPct;

    fillEl.style.width = pct + "%";

    // has-progress: show endpoint dot when there's something to show
    fillEl.classList.toggle("has-progress", pct > 0 && pct < 100);

    // complete: 100% glow state
    fillEl.classList.toggle("complete", pct === 100);

    // progress-level: drives idle animation intensity via CSS custom props
    // low (<33%) — breathing slightly more present
    // mid (33–66%) — balanced default
    // high (67–99%) — calmer, focused
    const level = pct >= 67 ? "high" : pct >= 33 ? "mid" : "low";
    progressBlock.dataset.progressLevel = pct === 100 ? "" : level;

    // just-advanced: brief endpoint pop on increase
    if (advancing && pct < 100) {
      fillEl.classList.remove("just-advanced");
      // Force reflow so the animation restarts cleanly
      void fillEl.offsetWidth;
      fillEl.classList.add("just-advanced");
      fillEl.addEventListener("animationend", () => {
        fillEl.classList.remove("just-advanced");
      }, { once: true });
    }
  } else {
    progressBlock.hidden = true;
  }
  $("#tasks").innerHTML = list.length
    ? list.map(taskHtml).join("")
    : emptyStateHtml();
  bindEmptyActions();
  document.querySelectorAll(".check").forEach((b) => {
    b.onclick = () => toggle(b.dataset.id);
  });
  document.querySelectorAll(".task-delete").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      remove(b.dataset.id);
    };
  });
  document.querySelectorAll(".drag-handle").forEach((b) => {
    b.onpointerdown = (e) => startDrag(e, b.closest(".task"));
  });
  if (lastCompletedId) {
    const card = document.querySelector(`.task[data-id="${lastCompletedId}"]`);
    if (card) card.classList.add("just-completed");
    lastCompletedId = null;
  }
}

function taskHtml(t) {
  const due = dueMeta(t),
    priorityName = priorityNames[t.priority] || "عادية",
    repeatLabel =
      t.repeat === "daily"
        ? "يومي"
        : t.repeat === "weekly"
          ? "أسبوعي"
          : t.repeat === "monthly"
            ? "شهري"
            : "";
  return `<article class="task priority-${t.priority || "normal"} ${t.done ? "done" : ""}" data-id="${t.id}">
    <button class="drag-handle" type="button" aria-label="اسحب لترتيب المهمة">⠿</button>
    <button class="check ${t.done ? "done" : ""}" type="button" data-id="${t.id}" aria-label="${t.done ? "إلغاء الإنجاز" : "تعليم كمنجزة"}">${t.done ? "✓" : ""}</button>
    <div class="task-body">
      <button class="task-text" type="button" data-edit-id="${t.id}" dir="rtl">${escape(t.text)}</button>
      <div class="task-meta">
        <span class="meta-chip ${due.chipClass}">${due.label}</span>
        <span class="meta-chip priority-${t.priority || "normal"}">${priorityName}</span>
        ${repeatLabel ? `<span class="meta-chip">↻ ${repeatLabel}</span>` : ""}
      </div>
    </div>
    <button class="task-delete" type="button" data-id="${t.id}" aria-label="حذف المهمة">${DELETE_ICON}</button>
  </article>`;
}

function escape(s) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[c],
  );
}

function startDrag(event, task) {
  event.preventDefault();
  const handle = event.currentTarget,
    container = $("#tasks"),
    rect = task.getBoundingClientRect(),
    placeholder = document.createElement("div"),
    floating = task.cloneNode(true),
    pointerId = event.pointerId,
    offsetX = event.clientX - rect.left,
    offsetY = event.clientY - rect.top;
  placeholder.className = "task-placeholder";
  placeholder.style.height = rect.height + "px";
  floating.className = task.className + " drag-floating";
  floating.style.width = rect.width + "px";
  floating.style.left = rect.left + "px";
  floating.style.top = rect.top + "px";
  document.body.appendChild(floating);
  container.insertBefore(placeholder, task);
  task.classList.add("drag-source");
  handle.setAttribute("aria-pressed", "true");
  try {
    handle.setPointerCapture(pointerId);
  } catch {}
  const animateMove = (action) => {
    const before = new Map(
      [...container.querySelectorAll(".task")].map((card) => [
        card,
        card.getBoundingClientRect(),
      ]),
    );
    action();
    [...container.querySelectorAll(".task")].forEach((card) => {
      const old = before.get(card);
      if (!old) return;
      const next = card.getBoundingClientRect(),
        dx = old.left - next.left,
        dy = old.top - next.top;
      if (dx || dy) {
        card.style.transition = "none";
        card.style.transform = `translate(${dx}px,${dy}px)`;
        requestAnimationFrame(() => {
          card.style.transition =
            "transform .22s cubic-bezier(.22,.61,.36,1)";
          card.style.transform = "";
        });
      }
    });
  };
  const move = (e) => {
    floating.style.left = e.clientX - offsetX + "px";
    floating.style.top = e.clientY - offsetY + "px";
    if (e.clientY < 90) window.scrollBy(0, -10);
    else if (e.clientY > window.innerHeight - 90) window.scrollBy(0, 10);
    const cards = [...container.querySelectorAll(".task")].filter(
        (card) => card !== task,
      ),
      last = cards[cards.length - 1];
    if (last && e.clientY > last.getBoundingClientRect().bottom) {
      if (placeholder.nextElementSibling)
        animateMove(() => container.appendChild(placeholder));
      return;
    }
    const before = cards.find((card) => {
      const box = card.getBoundingClientRect();
      return e.clientY < box.top + box.height / 2;
    });
    if (before && placeholder.nextElementSibling !== before)
      animateMove(() => container.insertBefore(placeholder, before));
    else if (!before && placeholder !== container.lastElementChild)
      animateMove(() => container.appendChild(placeholder));
  };
  const end = () => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", end);
    handle.removeEventListener("pointercancel", end);
    container.insertBefore(task, placeholder);
    placeholder.remove();
    floating.remove();
    task.classList.remove("drag-source");
    handle.setAttribute("aria-pressed", "false");
    const visibleIds = [...container.querySelectorAll(".task")].map(
        (x) => x.dataset.id,
      ),
      visibleSet = new Set(visibleIds),
      reorderedVisible = visibleIds.map((taskId) =>
        data.tasks.find((t) => t.id === taskId),
      );
    let next = 0;
    data.tasks = data.tasks.map((t) =>
      visibleSet.has(t.id) ? reorderedVisible[next++] : t,
    );
    save();
    render();
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}

function toggle(taskId) {
  const t = data.tasks.find((x) => x.id === taskId);
  if (!t) return;
  const wasDone = t.done;
  t.done = !t.done;
  if (t.done && t.repeat) {
    data.tasks.push({
      ...t,
      id: id(),
      done: false,
      due: addDate(t.due, t.repeat),
    });
  }
  save();
  if (t.done && !wasDone) {
    lastCompletedId = taskId;
    announce(`تم إنجاز: ${t.text}`);
  } else if (!t.done && wasDone) {
    announce(`أُعيدت المهمة: ${t.text}`);
  }
  render();
}

function remove(taskId) {
  const idx = data.tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return;
  const removed = { ...data.tasks[idx], _index: idx };
  const label = removed.text;
  data.tasks = data.tasks.filter((t) => t.id !== taskId);
  save();
  render();
  announce(`تم حذف: ${label}`);
  showToast("تم حذف المهمة", "تراجع", () => {
    const insertAt = Math.min(removed._index, data.tasks.length);
    const { _index, ...task } = removed;
    data.tasks.splice(insertAt, 0, task);
    save();
    render();
    announce(`تم استرجاع: ${label}`);
  });
}

let editingId = null;

function openModal(task) {
  editingId = task?.id || null;
  $("#task-modal").reset();
  $("#modal-title").textContent = editingId ? "تعديل المهمة" : "مهمة جديدة";
  $("#save-task").textContent = editingId ? "حفظ التعديل" : "حفظ المهمة";
  $("#task-text").value = task?.text || "";
  $("#task-due").value = task?.due || today();
  $("#task-priority").value = task?.priority || "normal";
  $("#task-repeat").value = task?.repeat || "";
  const backdrop = $("#modal-backdrop");
  backdrop.hidden = false;
  backdrop.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  $("#task-text").focus();
}

function closeModal() {
  const backdrop = $("#modal-backdrop");
  backdrop.hidden = true;
  backdrop.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  editingId = null;
}

$("#capture").onsubmit = (e) => {
  e.preventDefault();
  const text = $("#quick-text").value.trim();
  if (!text) {
    $("#quick-text").focus();
    return;
  }
  data.tasks.unshift({
    id: id(),
    text,
    done: false,
    list: "inbox",
    due: today(),
    priority: "normal",
    repeat: "",
  });
  $("#quick-text").value = "";
  save();
  announce(`أُضيفت مهمة: ${text}`);
  render();
  $("#quick-text").focus();
};

$("#advanced-add").onclick = () => openModal();
$("#close-modal").onclick = () => closeModal();
$("#modal-backdrop").onclick = (e) => {
  if (e.target.id === "modal-backdrop") closeModal();
};

$("#task-modal").onsubmit = (e) => {
  e.preventDefault();
  const text = $("#task-text").value.trim();
  if (!text) {
    $("#task-text").focus();
    return;
  }
  const values = {
    text,
    due: $("#task-due").value || today(),
    priority: $("#task-priority").value,
    repeat: $("#task-repeat").value,
  };
  if (editingId) {
    Object.assign(data.tasks.find((t) => t.id === editingId), values);
    announce("تم حفظ التعديل");
  } else {
    data.tasks.unshift({ id: id(), done: false, list: "inbox", ...values });
    announce(`أُضيفت مهمة: ${text}`);
  }
  save();
  closeModal();
  render();
};

$("#tasks").addEventListener("click", (e) => {
  const edit = e.target.closest("[data-edit-id]");
  if (edit)
    openModal(data.tasks.find((t) => t.id === edit.dataset.editId));
});

$("#search").oninput = (e) => {
  search = e.target.value;
  render();
};

function setTheme(next) {
  data.theme = next;
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME, next);
  $("#theme-icon").textContent = next === "dark" ? "☀" : "☾";
}

$("#theme").onclick = () => {
  setTheme(data.theme === "dark" ? "light" : "dark");
};

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#modal-backdrop").hidden) {
    e.preventDefault();
    closeModal();
  }
  const inField =
    e.target.matches("input, textarea, select") ||
    e.target.isContentEditable;
  if (
    e.key === "/" &&
    !inField &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey
  ) {
    e.preventDefault();
    $("#search").focus();
  }
});

$("#export").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(data)], { type: "application/json" }),
  );
  a.download = "مهامي-backup.json";
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("تم تصدير النسخة الاحتياطية");
};

$("#import-button").onclick = () => $("#import-file").click();
$("#import-file").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const imported = JSON.parse(r.result);
      if (!Array.isArray(imported.tasks) || !Array.isArray(imported.lists))
        throw Error();
      data = imported;
      save();
      render();
      showToast("تم استيراد البيانات بنجاح");
    } catch {
      showToast("تعذر قراءة الملف — تأكد أنه نسخة احتياطية صالحة");
    }
  };
  r.readAsText(file);
  e.target.value = "";
};

const savedTheme = localStorage.getItem(THEME);
if (savedTheme) data.theme = savedTheme;
setTheme(data.theme || "");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstall = e;
  $("#install").hidden = false;
});
$("#install").onclick = async () => {
  if (deferredInstall) {
    deferredInstall.prompt();
    deferredInstall = null;
    $("#install").hidden = true;
  }
};

if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("sw.js").catch(() => {});
requestPersistentStorage();
render();
