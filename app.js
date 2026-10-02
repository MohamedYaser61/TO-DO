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
  lastCompletedId = null;
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
  $("#side-nav").innerHTML = views.map((v) => navButtonHtml(v, counts)).join("");
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
        if (b.closest(".side")) setDrawer(false);
        render();
      }),
  );
  document.querySelectorAll("[data-priority]").forEach(
    (b) =>
      (b.onclick = () => {
        activePriority = b.dataset.priority;
        view = "all";
        setDrawer(false);
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
      if (view === "today")
        return !t.done ? t.due <= now : t.due === now;
      if (view === "upcoming") return !t.done && t.due > now;
      if (view === "done") return t.done;
      return !t.done;
    });
  if (!data.manualOrder) {
    list.sort((a, b) => a.createdAt - b.createdAt);
  }
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
    daily.length && view === "today" && activePriority === "all";
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
  const handle = event.target.closest(".drag-handle") || event.currentTarget,
    container = $("#tasks"),
    rect = task.getBoundingClientRect(),
    placeholder = document.createElement("div"),
    floating = task.cloneNode(true),
    pointerId = event.pointerId,
    initialX = event.clientX,
    initialY = event.clientY,
    initialScrollY = window.scrollY;

  placeholder.className = "task-placeholder";
  placeholder.style.height = rect.height + "px";

  floating.className = task.className + " drag-floating";
  floating.style.width = rect.width + "px";
  floating.style.left = rect.left + "px";
  floating.style.top = rect.top + "px";
  floating.style.margin = "0";

  document.body.appendChild(floating);
  container.insertBefore(placeholder, task);
  task.classList.add("drag-source");
  handle.setAttribute("aria-pressed", "true");

  try {
    handle.setPointerCapture(pointerId);
  } catch {}

  const allCards = [...container.querySelectorAll(".task")];
  const gapIndex = allCards.indexOf(task);
  const cards = allCards.filter((c) => c !== task);

  const cache = cards.map((c, index) => {
    const box = c.getBoundingClientRect();
    return {
      card: c,
      midY: box.top + window.scrollY + box.height / 2,
      height: box.height,
      index: index,
    };
  });

  const dragHeight = rect.height + 8; // var(--space-2) gap

  cards.forEach((c) => {
    c.style.transition = "transform .22s cubic-bezier(.22,.61,.36,1)";
  });
  placeholder.style.transition = "transform .22s cubic-bezier(.22,.61,.36,1)";

  let rafPending = false;
  let ended = false;
  let currentX = initialX;
  let currentY = initialY;
  let lastTargetIndex = gapIndex;

  const processDragFrame = () => {
    rafPending = false;
    if (ended) return;

    if (currentY < 90) window.scrollBy(0, -10);
    else if (currentY > window.innerHeight - 90) window.scrollBy(0, 10);

    const scrollDelta = window.scrollY - initialScrollY;
    const dx = currentX - initialX;
    const dy = currentY - initialY + scrollDelta;

    floating.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.015) rotate(0.5deg)`;

    const absoluteY = currentY + window.scrollY;
    let targetIndex = cache.length;
    for (let i = 0; i < cache.length; i++) {
      if (absoluteY < cache[i].midY) {
        targetIndex = i;
        break;
      }
    }

    if (targetIndex !== lastTargetIndex) {
      lastTargetIndex = targetIndex;
      let placeholderShift = 0;

      cache.forEach((item) => {
        const i = item.index;
        let shift = 0;

        if (i < gapIndex && i >= targetIndex) {
          shift = dragHeight;
          placeholderShift -= item.height + 8;
        } else if (i >= gapIndex && i < targetIndex) {
          shift = -dragHeight;
          placeholderShift += item.height + 8;
        }

        item.card.style.transform = shift ? `translate3d(0, ${shift}px, 0)` : "";
      });

      placeholder.style.transform = placeholderShift
        ? `translate3d(0, ${placeholderShift}px, 0)`
        : "";
    }
  };

  const move = (e) => {
    currentX = e.clientX;
    currentY = e.clientY;
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(processDragFrame);
    }
  };

  const end = () => {
    if (ended) return;
    ended = true;
    rafPending = false;

    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", end);
    handle.removeEventListener("pointercancel", end);
    handle.removeEventListener("lostpointercapture", end);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    window.removeEventListener("blur", end);

    cards.forEach((c) => {
      c.style.transition = "";
      c.style.transform = "";
    });
    placeholder.style.transition = "";
    placeholder.style.transform = "";

    if (lastTargetIndex < cache.length) {
      container.insertBefore(task, cache[lastTargetIndex].card);
    } else {
      container.appendChild(task);
    }

    placeholder.remove();
    floating.remove();
    task.classList.remove("drag-source");
    handle.setAttribute("aria-pressed", "false");

    const visibleIds = [...container.querySelectorAll(".task")].map((x) => x.dataset.id);
    const visibleSet = new Set(visibleIds);
    const reorderedVisible = visibleIds.map((taskId) =>
      data.tasks.find((t) => t.id === taskId)
    );

    let next = 0;
    data.tasks = data.tasks.map((t) =>
      visibleSet.has(t.id) ? reorderedVisible[next++] : t
    );

    data.manualOrder = true;
    save();
    render();
  };

  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
  handle.addEventListener("lostpointercapture", end);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  window.addEventListener("blur", end);
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

$("#tasks").addEventListener("pointerdown", (e) => {
  const handle = e.target.closest(".drag-handle");
  if (handle) {
    startDrag(e, handle.closest(".task"));
  }
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
