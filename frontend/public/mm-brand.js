(function () {
  document.title = "Movement Mail";

  const EXPAND_KEY = "mailflow_expanded_accounts";
  // v2: only the first account is expanded by default (was: all open).
  const DECIDED_KEY = "mm_expand_decided_v2";
  let expandPass = 0;
  let expandTimer = null;

  function paintWordmark(el) {
    if (!el || el.dataset.mmBranded === "1") return;
    el.dataset.mmBranded = "1";
    el.innerHTML =
      '<span style="font-family:var(--font-sans),system-ui,sans-serif;font-size:16px;font-weight:800;color:#0b1f3a;letter-spacing:-0.01em;white-space:nowrap">movement</span>' +
      '<span style="font-family:var(--font-sans),system-ui,sans-serif;font-size:16px;font-weight:800;color:#0b4ea2;letter-spacing:-0.01em;white-space:nowrap">mail</span>';
  }

  function isLoginPage() {
    const password = document.querySelector('input[type="password"]');
    if (!password) return false;
    // App chrome (inbox) has a 56px header bar; login does not.
    if (document.querySelector('[style*="min-height: 56px"]')) return false;
    const text = (document.body.innerText || "").toLowerCase();
    return text.includes("sign in") || text.includes("username") || text.includes("email");
  }

  function relabelUsername() {
    for (const label of document.querySelectorAll("label")) {
      const t = (label.textContent || "").trim();
      if (t === "Username" || t.startsWith("Username")) {
        label.textContent = "Email";
      }
    }
  }

  function ensureLoginChrome() {
    if (!isLoginPage()) {
      document.body.classList.remove("mm-login");
      document.querySelectorAll(".mm-login-header, .mm-login-intro, .mm-login-foot").forEach((el) => el.remove());
      return;
    }

    document.body.classList.add("mm-login");
    relabelUsername();

    const shell = document.querySelector("#root > div");
    if (!shell) return;

    if (!document.querySelector(".mm-login-header")) {
      const header = document.createElement("header");
      header.className = "mm-login-header";
      header.innerHTML =
        '<a class="mm-login-wordmark" href="https://admin.movementmail.org/">movement<span>mail</span></a>' +
        '<nav class="mm-login-nav">' +
        '<a href="https://admin.movementmail.org/help">Help &amp; FAQ</a>' +
        '<a class="mm-login-cta" href="https://admin.movementmail.org/signup">Sign up free</a>' +
        "</nav>";
      shell.insertBefore(header, shell.firstChild);
    }

    const col = shell.querySelector('div[style*="max-width"]');
    if (!col) return;

    const brand = col.querySelector(":scope > div:first-child");
    if (brand && !brand.classList.contains("mm-login-intro")) {
      brand.classList.add("mm-login-brand");
    }

    if (!col.querySelector(".mm-login-intro")) {
      const intro = document.createElement("div");
      intro.className = "mm-login-intro";
      intro.innerHTML = '<h1 class="mm-login-title">Sign in</h1>';
      const card = col.querySelector(":scope > div:last-of-type");
      if (card) col.insertBefore(intro, card);
      else col.appendChild(intro);
    }

    if (!col.querySelector(".mm-login-foot")) {
      const foot = document.createElement("p");
      foot.className = "mm-login-foot";
      foot.innerHTML =
        'Looking for the admin portal? <a href="https://admin.movementmail.org/login">Open admin</a>';
      col.appendChild(foot);
    }
  }

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  }

  function accountChevronRows() {
    const rows = [];
    document.querySelectorAll("button").forEach((btn) => {
      const style = btn.getAttribute("style") || "";
      if (!style.includes("transform") || !style.includes("transition")) return;
      const row = btn.parentElement;
      if (!row) return;
      const text = row.textContent || "";
      if (!text.includes("@")) return;
      rows.push({
        btn,
        open: style.includes("rotate(90deg)"),
      });
    });
    return rows;
  }

  /** Open only the first account folder group; collapse the rest. */
  function applyDefaultAccountExpand() {
    const rows = accountChevronRows();
    rows.forEach((r, i) => {
      const shouldOpen = i === 0;
      if (shouldOpen && !r.open) r.btn.click();
      if (!shouldOpen && r.open) r.btn.click();
    });
  }

  function accountIdsFromPayload(data) {
    if (!data) return [];
    const list = Array.isArray(data)
      ? data
      : data.accounts || data.data || data.emailAccounts || [];
    if (!Array.isArray(list)) return [];
    return list.map((a) => a && a.id).filter(Boolean);
  }

  function seedExpandedAccounts(ids) {
    if (!ids.length) return;
    const expanded = readJson(EXPAND_KEY, {});
    const decided = readJson(DECIDED_KEY, {});
    let changed = false;

    ids.forEach((id, i) => {
      if (decided[id]) return;
      // Only the first account is open by default.
      expanded[id] = i === 0;
      decided[id] = true;
      changed = true;
    });

    localStorage.setItem(DECIDED_KEY, JSON.stringify(decided));
    if (!changed) return;

    localStorage.setItem(EXPAND_KEY, JSON.stringify(expanded));
    // React already booted from the old map — sync the chevrons.
    applyDefaultAccountExpand();
    window.setTimeout(applyDefaultAccountExpand, 400);
  }

  function ensureAccountsExpanded() {
    if (isLoginPage()) return;
    if (expandPass > 12) return;
    expandPass += 1;

    fetch("/api/accounts", {
      credentials: "include",
      headers: { "X-Requested-With": "MailFlow" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const ids = accountIdsFromPayload(data);
        if (!ids.length) return;
        seedExpandedAccounts(ids);
      })
      .catch(() => {});
  }

  function scheduleExpand() {
    if (expandTimer) window.clearTimeout(expandTimer);
    expandTimer = window.setTimeout(() => {
      ensureLoginChrome();
      ensureAccountsExpanded();
      ensurePasswordChangeGate();
      rebrandText();
      ensureAboutLinks();
      ensureAccountDragDrop();
    }, 250);
  }

  function accountHeaderRows() {
    return accountChevronRows()
      .map((r) => r.btn.parentElement)
      .filter(Boolean);
  }

  function emailFromText(text) {
    const m = String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return m ? m[0].toLowerCase() : "";
  }

  function accountEmail(account) {
    return String(account.email_address || account.email || account.address || "")
      .trim()
      .toLowerCase();
  }

  let accountDragBound = false;
  let accountDragBusy = false;

  function bindAccountDragOnce() {
    if (accountDragBound) return;
    accountDragBound = true;

    document.addEventListener("dragstart", (e) => {
      const row = e.target && e.target.closest && e.target.closest("[data-mm-account-row]");
      if (!row) return;
      if (e.target.closest("button, a, input")) {
        e.preventDefault();
        return;
      }
      const id = row.dataset.mmAccountId;
      if (!id) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData("application/x-mm-account", id);
      e.dataTransfer.effectAllowed = "move";
      row.classList.add("mm-account-dragging");
    });

    document.addEventListener("dragend", () => {
      document.querySelectorAll(".mm-account-dragging, .mm-account-drop").forEach((el) => {
        el.classList.remove("mm-account-dragging", "mm-account-drop");
      });
    });

    document.addEventListener("dragover", (e) => {
      const row = e.target && e.target.closest && e.target.closest("[data-mm-account-row]");
      if (!row) return;
      if (![...e.dataTransfer.types].includes("application/x-mm-account")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      document.querySelectorAll(".mm-account-drop").forEach((el) => {
        if (el !== row) el.classList.remove("mm-account-drop");
      });
      row.classList.add("mm-account-drop");
    });

    document.addEventListener("dragleave", (e) => {
      const row = e.target && e.target.closest && e.target.closest("[data-mm-account-row]");
      if (!row) return;
      if (row.contains(e.relatedTarget)) return;
      row.classList.remove("mm-account-drop");
    });

    document.addEventListener("drop", async (e) => {
      const row = e.target && e.target.closest && e.target.closest("[data-mm-account-row]");
      if (!row) return;
      const fromId = e.dataTransfer.getData("application/x-mm-account");
      if (!fromId) return;
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove("mm-account-drop");
      const toId = row.dataset.mmAccountId;
      if (!toId || toId === fromId || accountDragBusy) return;
      await reorderAccountsById(fromId, toId);
    });
  }

  async function reorderAccountsById(fromId, toId) {
    const store = window.__mmStore;
    if (!store || !store.getState) return;
    const state = store.getState();
    const accounts = Array.isArray(state.accounts) ? state.accounts.slice() : [];
    if (accounts.length < 2) return;
    const from = accounts.findIndex((a) => a && a.id === fromId);
    const to = accounts.findIndex((a) => a && a.id === toId);
    if (from < 0 || to < 0 || from === to) return;

    const next = accounts.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    const ordered = next.map((a, i) => ({ ...a, sort_order: i }));

    accountDragBusy = true;
    if (typeof state.setAccounts === "function") state.setAccounts(ordered);

    try {
      await Promise.all(
        ordered.map((a) =>
          fetch(`/api/accounts/${a.id}`, {
            method: "PUT",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              "X-Requested-With": "MailFlow",
            },
            body: JSON.stringify({ sort_order: a.sort_order }),
          }).then((r) => {
            if (!r.ok) throw new Error("Failed to reorder accounts");
          }),
        ),
      );
    } catch (err) {
      if (typeof state.setAccounts === "function") state.setAccounts(accounts);
      console.warn("[mm] account reorder failed", err);
    } finally {
      accountDragBusy = false;
    }
  }

  /** Drag-and-drop reorder for mailbox accounts in the left sidebar. */
  function ensureAccountDragDrop() {
    if (isLoginPage()) return;
    bindAccountDragOnce();

    const store = window.__mmStore;
    const accounts =
      store && store.getState && Array.isArray(store.getState().accounts)
        ? store.getState().accounts
        : [];
    if (accounts.length < 2) return;

    const byEmail = new Map();
    accounts.forEach((a) => {
      const email = accountEmail(a);
      if (email && a.id) byEmail.set(email, a.id);
    });

    accountHeaderRows().forEach((row) => {
      const email = emailFromText(row.textContent || "");
      const id = byEmail.get(email);
      if (!id) return;
      row.dataset.mmAccountRow = "1";
      row.dataset.mmAccountId = id;
      row.setAttribute("draggable", "true");
      row.title = row.title || "Drag to reorder";
    });
  }

  let passwordGateChecked = false;
  let passwordGateOpen = false;

  function ensurePasswordChangeGate() {
    if (isLoginPage()) {
      passwordGateChecked = false;
      const existing = document.getElementById("mm-pw-gate");
      if (existing) existing.remove();
      passwordGateOpen = false;
      return;
    }
    if (passwordGateOpen) return;
    if (passwordGateChecked) return;
    passwordGateChecked = true;

    fetch("/api/auth/preferences", {
      credentials: "include",
      headers: { "X-Requested-With": "MailFlow" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((prefs) => {
        if (!prefs || prefs.mustChangePassword !== true) return;
        showPasswordChangeGate();
      })
      .catch(() => {
        passwordGateChecked = false;
      });
  }

  function showPasswordChangeGate() {
    if (document.getElementById("mm-pw-gate")) return;
    passwordGateOpen = true;

    const overlay = document.createElement("div");
    overlay.id = "mm-pw-gate";
    overlay.className = "mm-pw-gate";
    overlay.innerHTML =
      '<div class="mm-pw-card" role="dialog" aria-modal="true" aria-labelledby="mm-pw-title">' +
      '<div class="mm-pw-brand">movement<span>mail</span></div>' +
      '<h1 id="mm-pw-title">Choose a new password</h1>' +
      "<p>Your account was set up with a temporary password. Pick one only you know — it updates webmail and IMAP/SMTP together.</p>" +
      '<label class="mm-pw-label">Temporary password<input type="password" id="mm-pw-current" autocomplete="current-password" required></label>' +
      '<label class="mm-pw-label">New password<input type="password" id="mm-pw-new" autocomplete="new-password" minlength="8" required></label>' +
      '<label class="mm-pw-label">Confirm new password<input type="password" id="mm-pw-confirm" autocomplete="new-password" minlength="8" required></label>' +
      '<p class="mm-pw-error" id="mm-pw-error" hidden></p>' +
      '<button type="button" class="mm-pw-submit" id="mm-pw-submit">Save and continue</button>' +
      "</div>";
    document.body.appendChild(overlay);

    const errEl = overlay.querySelector("#mm-pw-error");
    const submit = overlay.querySelector("#mm-pw-submit");

    async function resolveEmail() {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
          headers: { "X-Requested-With": "MailFlow" },
        });
        if (!res.ok) return "";
        const data = await res.json();
        return (data && data.user && data.user.username) || "";
      } catch {
        return "";
      }
    }

    submit.addEventListener("click", async () => {
      errEl.hidden = true;
      errEl.textContent = "";
      const currentPassword = overlay.querySelector("#mm-pw-current").value;
      const newPassword = overlay.querySelector("#mm-pw-new").value;
      const confirm = overlay.querySelector("#mm-pw-confirm").value;
      if (newPassword.length < 8) {
        errEl.textContent = "New password must be at least 8 characters.";
        errEl.hidden = false;
        return;
      }
      if (newPassword !== confirm) {
        errEl.textContent = "New passwords don’t match.";
        errEl.hidden = false;
        return;
      }
      if (newPassword === currentPassword) {
        errEl.textContent = "Choose a different password than the temporary one.";
        errEl.hidden = false;
        return;
      }

      submit.disabled = true;
      submit.textContent = "Saving…";
      const email = await resolveEmail();
      if (!email) {
        submit.disabled = false;
        submit.textContent = "Save and continue";
        errEl.textContent = "Session expired — refresh and sign in again.";
        errEl.hidden = false;
        return;
      }

      try {
        const res = await fetch("/api/mm/change-required-password", {
          method: "POST",
          credentials: "omit",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, currentPassword, newPassword }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Could not update password",
          );
        }
        // Re-login so Mailflow session + IMAP secret match the new password.
        const login = await fetch("/api/auth/login", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "MailFlow",
          },
          body: JSON.stringify({ username: email, password: newPassword }),
        });
        if (!login.ok) {
          window.location.href = "/";
          return;
        }
        overlay.remove();
        passwordGateOpen = false;
        passwordGateChecked = true;
        window.location.reload();
      } catch (err) {
        submit.disabled = false;
        submit.textContent = "Save and continue";
        errEl.textContent = err && err.message ? err.message : "Could not update password";
        errEl.hidden = false;
      }
    });
  }

  function isBrandName(text) {
    const t = (text || "").trim();
    return t === "MailFlow" || t === "Mailflow" || t === "Movement Mail";
  }

  const ABOUT_OLD = "Open-source, self-hosted email client";
  const ABOUT_NEW = "Movementmail web client is a fork of Mailflow.";
  const ABOUT_MARK = "\0MM_ABOUT\0";

  // About panel links — fork + upstream (AGPL source offer).
  const ABOUT_WEBSITE = "https://movementmail.org";
  const ABOUT_FORK = "https://github.com/xd-arsenic/movementmail-client";
  const ABOUT_UPSTREAM = "https://github.com/maathimself/mailflow";

  function displayUrl(href) {
    return String(href || "").replace(/^https:\/\//, "");
  }

  /** Rewrite About website/source links and add an Upstream row. */
  function ensureAboutLinks() {
    document.querySelectorAll('a[href="https://mailflow.sh"]').forEach((a) => {
      a.href = ABOUT_WEBSITE;
      a.textContent = displayUrl(ABOUT_WEBSITE);
    });

    // Source build already has fork + upstream rows — leave them alone.
    if (document.querySelector(`a[href="${ABOUT_FORK}"]`)) {
      document.querySelectorAll(`a[href="${ABOUT_UPSTREAM}"]`).forEach((a) => {
        a.dataset.mmAbout = "upstream";
      });
      return;
    }

    document.querySelectorAll(`a[href="${ABOUT_UPSTREAM}"]`).forEach((a) => {
      if (a.dataset.mmAbout === "upstream") return;
      if (a.dataset.mmAbout === "fork") return;

      const row = a.parentElement;
      const group = row && row.parentElement;
      if (!row || !group) return;

      a.dataset.mmAbout = "fork";
      a.href = ABOUT_FORK;
      a.textContent = displayUrl(ABOUT_FORK);

      if (group.querySelector("[data-mm-about-upstream-row]")) return;

      const upRow = row.cloneNode(true);
      upRow.dataset.mmAboutUpstreamRow = "1";
      const label = upRow.querySelector("span");
      const link = upRow.querySelector("a");
      if (label) label.textContent = "Upstream";
      if (link) {
        link.dataset.mmAbout = "upstream";
        link.href = ABOUT_UPSTREAM;
        link.textContent = displayUrl(ABOUT_UPSTREAM);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      // Match Mailflow row borders: previous row gets a divider; last does not.
      row.style.borderBottom = "1px solid var(--border-subtle)";
      upRow.style.borderBottom = "none";
      group.appendChild(upRow);
    });
  }

  /** Replace leftover MailFlow / About copy anywhere in the DOM. */
  function rebrandText(root) {
    const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
    const hits = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const val = node.nodeValue || "";
      if (!/MailFlow|Mailflow|Open-source, self-hosted email client/i.test(val)) continue;
      hits.push(node);
    }
    for (const node of hits) {
      const parent = node.parentElement;
      if (!parent || parent.closest("script, style, noscript")) continue;
      let next = node.nodeValue || "";
      next = next.split(ABOUT_NEW).join(ABOUT_MARK).split(ABOUT_OLD).join(ABOUT_MARK);
      const trimmedBefore = next.trim();
      if (trimmedBefore === "MailFlow" || trimmedBefore === "Mailflow" || trimmedBefore === "Movement Mail") {
        const inHeader =
          parent.closest("[style*='min-height: 56px']") ||
          parent.closest("h1") ||
          parent.childNodes.length === 1;
        if (inHeader) {
          paintWordmark(parent);
          continue;
        }
      }
      next = next
        .replace(/MailFlow/g, "Movement Mail")
        .replace(/Mailflow/g, "Movement Mail")
        .split(ABOUT_MARK)
        .join(ABOUT_NEW);
      node.nodeValue = next;
    }

    // Header may already say Movement Mail from the patched store — paint wordmark.
    const walker2 = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
    while (walker2.nextNode()) {
      const node = walker2.currentNode;
      if ((node.nodeValue || "").trim() !== "Movement Mail") continue;
      const parent = node.parentElement;
      if (!parent || parent.dataset.mmBranded === "1") continue;
      const inHeader =
        parent.closest("[style*='min-height: 56px']") ||
        parent.closest("h1") ||
        (parent.childNodes.length === 1 && parent.textContent.trim() === "Movement Mail");
      if (inHeader) paintWordmark(parent);
    }
  }

  const start = () => {
    rebrandText(document.body);
    ensureAboutLinks();
    ensureLoginChrome();
    ensureAccountsExpanded();
    ensurePasswordChangeGate();
    ensureAccountDragDrop();
    const obs = new MutationObserver(() => {
      scheduleExpand();
    });
    obs.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
