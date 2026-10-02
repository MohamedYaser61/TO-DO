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
const taskCreatedAt = (task, index, total, baseTime = Date.now()) => {
  const timestamp =
    typeof task.createdAt === "number"
      ? task.createdAt
      : Date.parse(task.createdAt);
  return Number.isFinite(timestamp)
    ? timestamp
    : baseTime - (total - index) * 1000;
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
  deferredInstall,
  lastCompletedId = null,
  activeDragTask = null;
data.tasks = data.tasks || [];
data.lists = data.lists?.length ? data.lists : defaults.lists;
data.manualOrder = data.manualOrder === true;
let migratedTaskTimestamps = false;
data.tasks = data.tasks.map((task, index, tasks) => {
  const createdAt = taskCreatedAt(task, index, tasks.length);
  if (task.createdAt !== createdAt) migratedTaskTimestamps = true;
  return { ...task, createdAt };
});
const $ = (s) => document.querySelector(s),
  ui = {
    sideNav: $("#side-nav"),
    priorities: $("#priorities"),
    pageTitle: $("#page-title"),
    dateLabel: $("#date-label"),
    summary: $("#summary"),
    filters: $("#filters"),
    progressBlock: $("#progress-block"),
    progressLabel: $("#progress-label"),
    progressValue: $("#progress-value"),
    progressBar: $("#progress-bar"),
    progressFill: $("#progress"),
    tasks: $("#tasks"),
    indicator: $("#task-drop-indicator"),
    quickText: $("#quick-text"),
    modalBackdrop: $("#modal-backdrop"),
    taskModal: $("#task-modal"),
    taskText: $("#task-text"),
    taskDue: $("#task-due"),
    taskPriority: $("#task-priority"),
    taskRepeat: $("#task-repeat"),
    themeIcon: $("#theme-icon"),
    statusAnnouncer: $("#status-announcer"),
  },
  save = () => localStorage.setItem(KEY, JSON.stringify(data)),
  remaining = () => data.tasks.filter((t) => !t.done).length;
if (migratedTaskTimestamps) save();
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
  const el = ui.statusAnnouncer;
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

function navButtonHtml(v, counts) {
  const active = view === v[0] && activePriority === "all";
  const count = counts[v[0]];
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
  ui.sideNav.innerHTML = views.map((v) => navButtonHtml(v, counts)).join("");
  const priorities = [
    ["high", "مهمة", "!"],
    ["medium", "متوسطة", "▲"],
    ["normal", "عادية", "○"],
    ["all", "كل الأولويات", "◆"],
  ];
  ui.priorities.innerHTML = priorities
    .map((p) => {
      const active = activePriority === p[0];
      const count = data.tasks.filter(
        (t) => !t.done && (p[0] === "all" || t.priority === p[0]),
      ).length;
      return `<button type="button" class="list-button ${active ? "active" : ""}" data-priority="${p[0]}" aria-pressed="${active}"><span class="nav-label"><span class="nav-icon" aria-hidden="true">${p[2]}</span><span>${p[1]}</span></span><b class="count">${count}</b></button>`;
    })
    .join("");
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

function visibleTasks() {
  const now = today(),
    list = data.tasks.filter((t) => {
      if (activePriority !== "all" && t.priority !== activePriority)
        return false;
      if (view === "today")
        return !t.done ? t.due <= now : t.due === now;
      if (view === "upcoming") return !t.done && t.due > now;
      if (view === "done") return t.done;
      return !t.done;
    });
  if (!data.manualOrder) {
    list.sort((a, b) => a.createdAt - b.createdAt);
  }
  return list;
}

function updateHeader(list) {
  const now = today();
  const names = {
    today: "اليوم",
    upcoming: "القادمة",
    all: "كل المهام",
    done: "المنجزة",
  };
  ui.pageTitle.textContent =
    activePriority === "all"
      ? names[view]
      : priorityNames[activePriority] || "مهامي";
  ui.dateLabel.textContent = new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const daily = data.tasks.filter((t) => t.due === now),
    dailyDone = daily.filter((t) => t.done).length,
    dailyOpen = daily.length - dailyDone;
  const showProgress =
    daily.length && view === "today" && activePriority === "all";
  ui.summary.textContent = showProgress
    ? dailyOpen > 0
      ? `${dailyOpen} ${dailyOpen === 1 ? "مهمة متبقية" : "مهام متبقية"} لليوم`
      : "أنجزت كل مهام اليوم — أحسنت"
    : dailyOpen > 0
      ? `${dailyOpen} ${dailyOpen === 1 ? "مهمة لليوم" : "مهام لليوم"} · ${remaining()} نشطة`
      : daily.length
        ? "أنجزت كل مهام اليوم"
        : `${remaining()} ${remaining() === 1 ? "مهمة نشطة" : "مهام نشطة"}`;
  return { daily, dailyDone, showProgress };
}

function updateFilters() {
  if (!ui.filters.children.length) {
    ui.filters.innerHTML = views
      .map(
        (v) =>
          `<button type="button" role="tab" aria-selected="false" data-view="${v[0]}">${v[1]}</button>`,
      )
      .join("");
  }
  ui.filters.querySelectorAll("[data-view]").forEach((button) => {
    const active = view === button.dataset.view && activePriority === "all";
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function updateProgress({ daily, dailyDone, showProgress }) {
  const progressBlock = ui.progressBlock,
    pct = daily.length ? Math.round((dailyDone / daily.length) * 100) : 0;
  if (showProgress) {
    progressBlock.hidden = false;
    ui.progressLabel.textContent = "تقدم اليوم";

    // — Count tick animation —
    const valEl = ui.progressValue;
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

    ui.progressBar.setAttribute("aria-valuenow", String(pct));
    ui.progressBar.setAttribute(
      "aria-valuetext",
      `${dailyDone} من ${daily.length} مكتملة`,
    );

    // — Fill classes: has-progress / complete / just-advanced —
    const fillEl = ui.progressFill;
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
}

function updateTaskElement(card, task) {
  const due = dueMeta(task);
  card.className = `task priority-${task.priority || "normal"} ${task.done ? "done" : ""}`;
  const check = card.querySelector(".check");
  check.className = `check ${task.done ? "done" : ""}`;
  check.textContent = task.done ? "✓" : "";
  check.setAttribute(
    "aria-label",
    task.done ? "إلغاء الإنجاز" : "تعليم كمنجزة",
  );
  const text = card.querySelector(".task-text");
  text.textContent = task.text;
  text.dataset.editId = task.id;
  const priorityName = priorityNames[task.priority] || "عادية";
  const repeatLabel =
    task.repeat === "daily"
      ? "يومي"
      : task.repeat === "weekly"
        ? "أسبوعي"
        : task.repeat === "monthly"
          ? "شهري"
          : "";
  card.querySelector(".task-meta").innerHTML = `
    <span class="meta-chip ${due.chipClass}">${due.label}</span>
    <span class="meta-chip priority-${task.priority || "normal"}">${priorityName}</span>
    ${repeatLabel ? `<span class="meta-chip">↻ ${repeatLabel}</span>` : ""}`;
  card.querySelector(".task-delete").dataset.id = task.id;
}

function createTaskElement(task) {
  const template = document.createElement("template");
  template.innerHTML = taskHtml(task).trim();
  return template.content.firstElementChild;
}

function reconcileTaskList(list) {
  if (activeDragTask) return;
  const container = ui.tasks;
  const existing = new Map(
    [...container.querySelectorAll(".task")].map((card) => [
      card.dataset.id,
      card,
    ]),
  );
  if (!list.length) {
    if (!container.querySelector(".empty")) container.innerHTML = emptyStateHtml();
    return;
  }
  container.querySelector(".empty")?.remove();
  const visibleIds = new Set(list.map((task) => task.id));
  existing.forEach((card, taskId) => {
    if (!visibleIds.has(taskId)) card.remove();
  });
  let previous = null;
  list.forEach((task) => {
    let card = existing.get(task.id);
    if (!card) {
      card = createTaskElement(task);
      updateTaskElement(card, task);
    } else {
      updateTaskElement(card, task);
    }
    if (card !== previous?.nextElementSibling) {
      container.insertBefore(card, previous ? previous.nextElementSibling : container.firstElementChild);
    }
    previous = card;
  });
}

function render() {
  nav();
  const list = visibleTasks();
  const progressState = updateHeader(list);
  updateFilters();
  updateProgress(progressState);
  reconcileTaskList(list);
  if (lastCompletedId) {
    const card = ui.tasks.querySelector(`.task[data-id="${lastCompletedId}"]`);
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
  if (activeDragTask) return;
  activeDragTask = task;
  const handle = event.target.closest(".drag-handle") || event.currentTarget,
    container = $("#tasks"),
    indicator = $("#task-drop-indicator"),
    allCards = [...container.querySelectorAll(".task")],
    rect = task.getBoundingClientRect(),
    pointerId = event.pointerId,
    initialX = event.clientX,
    initialY = event.clientY,
    initialScrollY = window.scrollY,
    cards = [...container.querySelectorAll(".task")].filter((card) => card !== task),
    cache = cards.map((card) => {
      const box = card.getBoundingClientRect();
      return {
        card,
        top: box.top + window.scrollY,
        bottom: box.bottom + window.scrollY,
        height: box.height,
      };
    }),
    gap = parseFloat(getComputedStyle(container).rowGap) || 0,
    slots = [
      cache.length ? cache[0].top : rect.top + window.scrollY,
      ...cache.slice(0, -1).map((card, index) =>
        (card.bottom + cache[index + 1].top) / 2
      ),
      cache.length
        ? cache[cache.length - 1].bottom + gap / 2
        : rect.bottom + window.scrollY,
    ];

  let rafPending = false;
  let ended = false;
  let currentX = initialX;
  let currentY = initialY;
  let targetSlot = allCards.indexOf(task);

  const setIndicator = () => {
    const slotTop = slots[targetSlot] - window.scrollY;
    indicator.style.transform = `translate3d(0, ${slotTop}px, 0)`;
  };

  const processDragFrame = () => {
    rafPending = false;
    if (ended) return;

    if (currentY < 90) window.scrollBy(0, -10);
    else if (currentY > window.innerHeight - 90) window.scrollBy(0, 10);

    const dx = currentX - initialX;
    const dy = currentY - initialY + window.scrollY - initialScrollY;
    task.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;

    const absoluteY = currentY + window.scrollY;
    targetSlot = slots.findIndex((slot) => absoluteY < slot);
    if (targetSlot < 0) targetSlot = slots.length - 1;
    setIndicator();
  };

  const move = (e) => {
    currentX = e.clientX;
    currentY = e.clientY;
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(processDragFrame);
    }
  };

  const end = (cancelled) => {
    if (ended) return;
    ended = true;
    activeDragTask = null;
    rafPending = false;

    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", finish);
    handle.removeEventListener("pointercancel", cancel);
    handle.removeEventListener("lostpointercapture", cancel);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("blur", cancel);
    document.removeEventListener("visibilitychange", cancel);

    task.style.transform = "";
    task.style.transition = "";
    task.classList.remove("dragging");
    handle.setAttribute("aria-pressed", "false");
    indicator.hidden = true;
    indicator.style.transform = "";

    if (cancelled === true) return;

    const visibleIds = [...container.querySelectorAll(".task")].map(
      (card) => card.dataset.id,
    );
    const reorderedVisible = visibleIds.filter((id) => id !== task.dataset.id);
    const insertionIndex = Math.min(targetSlot, reorderedVisible.length);
    reorderedVisible.splice(insertionIndex, 0, task.dataset.id);
    const visibleSet = new Set(visibleIds);
    const currentTasks = data.tasks;
    const tasksById = new Map(currentTasks.map((item) => [item.id, item]));
    const reorderedVisibleTasks = reorderedVisible.map((id) =>
      tasksById.get(id),
    );
    let next = 0;
    data.tasks = currentTasks.map((item) =>
      visibleSet.has(item.id)
        ? reorderedVisibleTasks[next++]
        : item,
    );
    data.manualOrder = true;
    save();
    render();
  };

  const finish = () => end(false);
  const cancel = () => end(true);

  task.classList.add("dragging");
  task.style.transition = "none";
  indicator.hidden = false;
  indicator.style.width = `${rect.width}px`;
  indicator.style.left = `${rect.left}px`;
  indicator.style.transform = `translate3d(0, ${slots[0] - window.scrollY}px, 0)`;
  handle.setAttribute("aria-pressed", "true");

  try {
    handle.setPointerCapture(pointerId);
  } catch {}

  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", cancel);
  handle.addEventListener("lostpointercapture", cancel);
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("blur", cancel);
  document.addEventListener("visibilitychange", cancel);
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
      createdAt: Date.now(),
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
  data.tasks.push({
    id: id(),
    text,
    done: false,
    list: "inbox",
    due: today(),
    priority: "normal",
    repeat: "",
    createdAt: Date.now(),
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
    data.tasks.push({
      id: id(),
      done: false,
      list: "inbox",
      ...values,
      createdAt: Date.now(),
    });
    announce(`أُضيفت مهمة: ${text}`);
  }
  save();
  closeModal();
  render();
};

$("#tasks").addEventListener("click", (e) => {
  const viewButton = e.target.closest("[data-view]");
  if (viewButton && viewButton.closest("#tasks")) {
    view = viewButton.dataset.view;
    activePriority = "all";
    render();
    return;
  }
  if (e.target.closest("#empty-focus-add")) {
    ui.quickText.focus();
    return;
  }
  if (e.target.closest("#empty-advanced")) {
    openModal();
    return;
  }
  const check = e.target.closest(".check");
  if (check) {
    toggle(check.dataset.id);
    return;
  }
  const del = e.target.closest(".task-delete");
  if (del) {
    e.stopPropagation();
    remove(del.dataset.id);
    return;
  }
  const edit = e.target.closest("[data-edit-id]");
  if (edit) {
    openModal(data.tasks.find((t) => t.id === edit.dataset.editId));
  }
});

ui.tasks.addEventListener("pointerdown", (e) => {
  const handle = e.target.closest(".drag-handle");
  if (handle) {
    startDrag(e, handle.closest(".task"));
  }
});

ui.sideNav.addEventListener("click", (e) => {
  const button = e.target.closest("[data-view]");
  if (!button) return;
  view = button.dataset.view;
  activePriority = "all";
  setDrawer(false);
  render();
});

ui.priorities.addEventListener("click", (e) => {
  const button = e.target.closest("[data-priority]");
  if (!button) return;
  activePriority = button.dataset.priority;
  view = "all";
  setDrawer(false);
  render();
});

ui.filters.addEventListener("click", (e) => {
  const button = e.target.closest("[data-view]");
  if (!button) return;
  view = button.dataset.view;
  activePriority = "all";
  render();
});

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
  if (e.key === "Escape" && document.body.classList.contains("drawer-open")) {
    e.preventDefault();
    setDrawer(false);
    return;
  }
  if (e.key === "Escape" && !$("#modal-backdrop").hidden) {
    e.preventDefault();
    closeModal();
  }
});

const drawer = {
  trigger: $("#drawer-trigger"),
  close: $("#drawer-close"),
  backdrop: $("#drawer-backdrop"),
};

function setDrawer(open) {
  document.body.classList.toggle("drawer-open", open);
  drawer.backdrop.hidden = !open;
  drawer.trigger.setAttribute("aria-expanded", String(open));
  if (open) drawer.close.focus();
  else drawer.trigger.focus();
}

drawer.trigger.onclick = () => setDrawer(true);
drawer.close.onclick = () => setDrawer(false);
drawer.backdrop.onclick = () => setDrawer(false);

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
      data.manualOrder = data.manualOrder === true;
      const importedBaseTime = Date.now();
      data.tasks = data.tasks.map((task, index, tasks) => ({
        ...task,
        createdAt: taskCreatedAt(task, index, tasks.length, importedBaseTime),
      }));
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
