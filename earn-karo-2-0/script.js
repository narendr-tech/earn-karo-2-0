"use strict";

/* =========================================
   EARN KARO 2.0
   Frontend connected to Node.js backend
   ========================================= */

const API_BASE = "http://localhost:5000";

const TOKEN_KEY = "earnKaroToken";
const USER_KEY = "earnKaroUser";

let authMode = "login";
let currentUser = null;
let earningApps = [];
let isSubmitting = false;


/* =========================================
   BASIC HELPERS
   ========================================= */

function getElement(id) {
  return document.getElementById(id);
}

function setMessage(id, message, type = "") {
  const element = getElement(id);

  if (!element) return;

  element.textContent = message;
  element.className = "form-message";

  if (type) {
    element.classList.add(type);
  }
}

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

function saveSession(token, user) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);

  currentUser = null;
}

function getUserDisplayName(user) {
  if (!user) return "User";

  return (
    user.name ||
    user.full_name ||
    user.fullName ||
    user.email ||
    "User"
  );
}

function getUserRole(user) {
  return String(user?.role || "user").toLowerCase();
}

function isAdmin() {
  return getUserRole(currentUser) === "admin";
}


/* =========================================
   API REQUEST HELPER
   ========================================= */

async function apiRequest(path, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (
    options.body &&
    !(options.body instanceof FormData)
  ) {
    headers["Content-Type"] = "application/json";
  }

  const token = getToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers
    });
  } catch (error) {
    throw new Error(
      "Backend se connection nahi ho raha. Check karein ki Node.js server localhost:5000 par chal raha hai."
    );
  }

  const text = await response.text();

  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {
        message: text
      };
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
    }

    throw new Error(
      data.message ||
      data.error ||
      `Request failed. HTTP ${response.status}`
    );
  }

  return data;
}


/* =========================================
   AUTH MODE: LOGIN / REGISTER
   ========================================= */

function setAuthMode(mode) {
  authMode = mode === "register" ? "register" : "login";

  const isRegister = authMode === "register";

  const nameInput = getElement("authName");
  const nameLabel = getElement("authNameLabel");

  const title = getElement("authTitle");
  const subtitle = getElement("authSubtitle");
  const submitButton = getElement("authSubmit");
  const passwordInput = getElement("authPassword");

  /*
    IMPORTANT FIX:
    Hidden name input is disabled during login.
    It becomes visible and required during registration.
  */

  if (nameLabel) {
    nameLabel.classList.toggle("hidden", !isRegister);
  }

  if (nameInput) {
    nameInput.disabled = !isRegister;
    nameInput.required = isRegister;

    if (!isRegister) {
      nameInput.value = "";
    }
  }

  if (title) {
    title.textContent = isRegister
      ? "Create your account"
      : "Welcome back";
  }

  if (subtitle) {
    subtitle.textContent = isRegister
      ? "Earn Karo 2.0 par apna naya account banayein."
      : "Apne account me login karein.";
  }

  if (submitButton) {
    submitButton.textContent = isRegister
      ? "Create Account →"
      : "Login to dashboard →";

    submitButton.disabled = false;
  }

  if (passwordInput) {
    passwordInput.autocomplete = isRegister
      ? "new-password"
      : "current-password";

    passwordInput.placeholder = isRegister
      ? "Kam se kam 8 characters"
      : "Apna password enter karein";
  }

  document.querySelectorAll("[data-auth-tab]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.authTab === authMode
    );
  });

  setMessage("authMessage", "");
}


/* =========================================
   REGISTRATION AND LOGIN
   ========================================= */

async function handleAuthSubmit(event) {
  event.preventDefault();

  if (isSubmitting) return;

  const nameInput = getElement("authName");
  const emailInput = getElement("authEmail");
  const passwordInput = getElement("authPassword");
  const submitButton = getElement("authSubmit");

  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  setMessage("authMessage", "");

  if (!email) {
    setMessage("authMessage", "Email enter karein.", "error");
    emailInput.focus();
    return;
  }

  if (!emailInput.checkValidity()) {
    setMessage(
      "authMessage",
      "Sahi email address enter karein.",
      "error"
    );

    emailInput.focus();
    return;
  }

  if (authMode === "register") {
    if (!name) {
      setMessage(
        "authMessage",
        "Registration ke liye apna full name enter karein.",
        "error"
      );

      nameInput.focus();
      return;
    }

    if (password.length < 8) {
      setMessage(
        "authMessage",
        "Password kam se kam 8 characters ka hona chahiye.",
        "error"
      );

      passwordInput.focus();
      return;
    }
  } else {
    if (!password) {
      setMessage(
        "authMessage",
        "Password enter karein.",
        "error"
      );

      passwordInput.focus();
      return;
    }
  }

  isSubmitting = true;

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Please wait...";
  }

  try {
    let result;

    if (authMode === "register") {
      result = await apiRequest("/api/auth/register", {
        method: "POST",

        body: JSON.stringify({
          name,
          email,
          password
        })
      });

      /*
        Registration ke baad backend agar token deta hai,
        to session save karenge.
        Warna login tab par switch karenge.
      */

      const token =
        result.token ||
        result.accessToken ||
        result.access_token;

      const user =
        result.user ||
        result.data?.user;

      if (token && user) {
        saveSession(token, user);
        currentUser = user;

        await showDashboard();

        setMessage(
          "authMessage",
          "Account successfully create ho gaya!",
          "success"
        );

        return;
      }

      setMessage(
        "authMessage",
        result.message ||
        "Account create ho gaya. Ab apne email aur password se login karein.",
        "success"
      );

      passwordInput.value = "";
      setAuthMode("login");

      setMessage(
        "authMessage",
        result.message ||
        "Account create ho gaya. Ab login karein.",
        "success"
      );

    } else {
      result = await apiRequest("/api/auth/login", {
        method: "POST",

        body: JSON.stringify({
          email,
          password
        })
      });

      const token =
        result.token ||
        result.accessToken ||
        result.access_token;

      const user =
        result.user ||
        result.data?.user;

      if (!token) {
        throw new Error(
          "Login response me token nahi mila. Backend ke login response ko check karna hoga."
        );
      }

      if (!user) {
        throw new Error(
          "Login response me user details nahi mili."
        );
      }

      saveSession(token, user);
      currentUser = user;

      passwordInput.value = "";

      await showDashboard();
    }

  } catch (error) {
    console.error("Authentication error:", error);

    setMessage(
      "authMessage",
      error.message || "Kuch galat ho gaya. Dobara try karein.",
      "error"
    );

  } finally {
    isSubmitting = false;

    if (submitButton) {
      submitButton.disabled = false;

      submitButton.textContent =
        authMode === "register"
          ? "Create Account →"
          : "Login to dashboard →";
    }
  }
}


/* =========================================
   SHOW / HIDE LOGIN AND DASHBOARD
   ========================================= */

function showAuthScreen() {
  getElement("authSection").classList.remove("hidden");
  getElement("dashboardSection").classList.add("hidden");

  getElement("headerLogout").classList.add("hidden");
  getElement("headerUser").textContent = "";

  setAuthMode("login");
}

async function showDashboard() {
  if (!currentUser) {
    showAuthScreen();
    return;
  }

  getElement("authSection").classList.add("hidden");
  getElement("dashboardSection").classList.remove("hidden");

  getElement("headerLogout").classList.remove("hidden");

  getElement("headerUser").textContent =
    getUserDisplayName(currentUser);

  getElement("dashboardName").textContent =
    getUserDisplayName(currentUser);

  getElement("dashboardSubtitle").textContent =
    isAdmin()
      ? "Admin dashboard — manage your earning apps."
      : "Aapka personal earning dashboard.";

  getElement("adminNavButton").classList.toggle(
    "hidden",
    !isAdmin()
  );

  if (!isAdmin() && getElement("view-admin")) {
    getElement("view-admin").classList.add("hidden");
  }

  await loadApps();

  showView("overview");
}


/* =========================================
   RESTORE EXISTING SESSION
   ========================================= */

async function restoreSession() {
  const token = getToken();

  if (!token) {
    showAuthScreen();
    return;
  }

  try {
    const result = await apiRequest("/api/auth/me");

    currentUser =
      result.user ||
      result.data?.user ||
      result;

    /*
      Agar /api/auth/me response mein user object
      kisi aur format mein hai to console me inspect kar sakte hain.
    */

    if (!currentUser || !currentUser.email) {
      const storedUser = sessionStorage.getItem(USER_KEY);

      if (storedUser) {
        currentUser = JSON.parse(storedUser);
      }
    }

    if (!currentUser) {
      throw new Error("User session restore nahi ho saka.");
    }

    sessionStorage.setItem(
      USER_KEY,
      JSON.stringify(currentUser)
    );

    await showDashboard();

  } catch (error) {
    console.warn("Session restore:", error.message);

    clearSession();
    showAuthScreen();
  }
}


/* =========================================
   LOAD EARNING APPS FROM BACKEND
   ========================================= */

async function loadApps() {
  const grid = getElement("appsGrid");

  if (grid) {
    grid.innerHTML =
      '<div class="empty-state">Earning apps load ho rahe hain...</div>';
  }

  try {
    const result = await apiRequest("/api/apps");

    /*
      Different common API response formats supported:
      [ ... ]
      { apps: [ ... ] }
      { data: [ ... ] }
      { data: { apps: [ ... ] } }
    */

    if (Array.isArray(result)) {
      earningApps = result;

    } else if (Array.isArray(result.apps)) {
      earningApps = result.apps;

    } else if (Array.isArray(result.data)) {
      earningApps = result.data;

    } else if (Array.isArray(result.data?.apps)) {
      earningApps = result.data.apps;

    } else {
      earningApps = [];
    }

    renderApps();

    getElement("statApps").textContent =
      String(earningApps.length);

    setMessage(
      "appsMessage",
      earningApps.length
        ? `${earningApps.length} app(s) available hain.`
        : "Abhi koi earning app available nahi hai.",
      earningApps.length ? "success" : ""
    );

  } catch (error) {
    console.error("Load apps error:", error);

    earningApps = [];

    if (grid) {
      grid.innerHTML = `
        <div class="empty-state">
          Apps load nahi ho paayi.<br>
          ${escapeHtml(error.message)}
          <br><br>
          <button type="button" class="btn btn-primary" id="retryApps">
            Try again
          </button>
        </div>
      `;

      getElement("retryApps")?.addEventListener(
        "click",
        loadApps
      );
    }

    getElement("statApps").textContent = "0";
  }
}


/* =========================================
   SAFE TEXT HELPERS
   ========================================= */

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[character];
  });
}

function safeUrl(value) {
  try {
    const url = new URL(String(value));

    if (
      url.protocol === "https:" ||
      url.protocol === "http:"
    ) {
      return url.href;
    }

    return "";
  } catch {
    return "";
  }
}


/* =========================================
   RENDER APP CARDS
   ========================================= */

function renderApps() {
  const grid = getElement("appsGrid");

  if (!grid) return;

  const searchValue = (
    getElement("appSearch")?.value || ""
  ).trim().toLowerCase();

  const filteredApps = earningApps.filter(app => {
    const name = String(
      app.name ||
      app.app_name ||
      app.title ||
      ""
    ).toLowerCase();

    const category = String(
      app.category ||
      app.type ||
      ""
    ).toLowerCase();

    const description = String(
      app.description || ""
    ).toLowerCase();

    return (
      name.includes(searchValue) ||
      category.includes(searchValue) ||
      description.includes(searchValue)
    );
  });

  if (!filteredApps.length) {
    grid.innerHTML = `
      <div class="empty-state">
        ${earningApps.length
          ? "Aapki search se koi app nahi mili."
          : "Abhi earning apps add nahi hui hain."}
      </div>
    `;

    return;
  }

  grid.innerHTML = filteredApps.map(app => {
    const name = escapeHtml(
      app.name ||
      app.app_name ||
      app.title ||
      "Unnamed App"
    );

    const category = escapeHtml(
      app.category ||
      app.type ||
      "Earning App"
    );

    const description = escapeHtml(
      app.description ||
      "Is platform ki details abhi available nahi hain."
    );

    const referralUrl = safeUrl(
      app.referral_url ||
      app.referralUrl ||
      app.referral_link ||
      app.url ||
      app.link ||
      ""
    );

    const button = referralUrl
      ? `
        <a
          class="btn btn-primary full"
          href="${escapeHtml(referralUrl)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          Visit App ↗
        </a>
      `
      : `
        <button class="btn full" type="button" disabled>
          Link not available
        </button>
      `;

    return `
      <article class="app-card">
        <span class="app-category">${category}</span>

        <h3>${name}</h3>

        <p>${description}</p>

        ${button}
      </article>
    `;
  }).join("");
}


/* =========================================
   ADD NEW APP - ADMIN ONLY
   ========================================= */

async function handleAddApp(event) {
  event.preventDefault();

  if (!isAdmin()) {
    setMessage(
      "adminMessage",
      "Sirf authorized admin app add kar sakta hai.",
      "error"
    );

    return;
  }

  const name = getElement("newAppName").value.trim();
  const category = getElement("newAppCategory").value.trim();
  const description = getElement("newAppDescription").value.trim();
  const referralUrl = getElement("newAppReferralUrl").value.trim();

  if (!name || !category || !description || !referralUrl) {
    setMessage(
      "adminMessage",
      "Saari fields fill karein.",
      "error"
    );

    return;
  }

  const validatedUrl = safeUrl(referralUrl);

  if (!validatedUrl) {
    setMessage(
      "adminMessage",
      "Valid HTTP ya HTTPS referral URL enter karein.",
      "error"
    );

    return;
  }

  const submitButton = getElement("addAppSubmit");

  submitButton.disabled = true;
  submitButton.textContent = "Adding...";

  setMessage("adminMessage", "");

  try {
    /*
      Backend ke expected field names ke mutabik payload.
      Agar aapke server.js me field names alag hain,
      to server.js ke schema ke hisaab se adjust karna padega.
    */

    const result = await apiRequest("/api/admin/apps", {
      method: "POST",

      body: JSON.stringify({
        name,
        category,
        description,
        referral_url: validatedUrl
      })
    });

    setMessage(
      "adminMessage",
      result.message || "App add karne ki request successful rahi.",
      "success"
    );

    getElement("addAppForm").reset();

    await loadApps();

  } catch (error) {
    console.error("Admin add app error:", error);

    setMessage(
      "adminMessage",
      error.message || "App add nahi ho paayi.",
      "error"
    );

  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Add Earning App";
  }
}


/* =========================================
   NAVIGATION
   ========================================= */

function showView(viewName) {
  const allowedViews = [
    "overview",
    "apps",
    "earnings",
    "admin"
  ];

  if (!allowedViews.includes(viewName)) {
    viewName = "overview";
  }

  if (viewName === "admin" && !isAdmin()) {
    viewName = "overview";
  }

  document.querySelectorAll(".dashboard-view").forEach(section => {
    section.classList.add("hidden");
  });

  const activeView = getElement(`view-${viewName}`);

  if (activeView) {
    activeView.classList.remove("hidden");
  }

  document.querySelectorAll("[data-view]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.view === viewName
    );
  });
}


/* =========================================
   LOGOUT
   ========================================= */

function logout() {
  clearSession();

  getElement("authForm")?.reset();

  getElement("addAppForm")?.reset();

  setMessage("authMessage", "");
  setMessage("adminMessage", "");

  showAuthScreen();
}


/* =========================================
   EVENT LISTENERS
   ========================================= */

function initializeApp() {
  console.log("Earn Karo 2.0 JavaScript initialized.");

  /*
    Login / registration tabs
  */

  document.querySelectorAll("[data-auth-tab]").forEach(button => {
    button.addEventListener("click", () => {
      setAuthMode(button.dataset.authTab);
    });
  });

  /*
    Login / registration form
  */

  getElement("authForm").addEventListener(
    "submit",
    handleAuthSubmit
  );

  /*
    Dashboard navigation
  */

  document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => {
      showView(button.dataset.view);
    });
  });

  /*
    Logout buttons
  */

  getElement("headerLogout").addEventListener(
    "click",
    logout
  );

  getElement("dashboardLogout").addEventListener(
    "click",
    logout
  );

  /*
    App search
  */

  getElement("appSearch").addEventListener(
    "input",
    renderApps
  );

  /*
    Admin app form
  */

  getElement("addAppForm").addEventListener(
    "submit",
    handleAddApp
  );

  /*
    Default state:
    Full Name is disabled and hidden in login mode.
  */

  setAuthMode("login");

  /*
    Restore existing session if available.
  */

  restoreSession();
}


/* =========================================
   START APPLICATION
   ========================================= */

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeApp
  );
} else {
  initializeApp();
}