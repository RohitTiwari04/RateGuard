// RateGuard Dashboard Client Logic

document.addEventListener('DOMContentLoaded', () => {
  // --- APPLICATION STATE ---
  const state = {
    token: localStorage.getItem('rg_admin_token') || '',
    user: JSON.parse(localStorage.getItem('rg_admin_user') || 'null'),
    apiKey: localStorage.getItem('rg_test_apikey') || 'rateguard_free_api_key_sample',
    activeTab: 'rules-tab',
    rules: [],
    logs: [],
    resetTimerInterval: null,
    metricsChart: null,
  };

  // --- DOM ELEMENT REFERENCES ---
  const authOverlay = document.getElementById('auth-overlay');
  const appContainer = document.getElementById('app-container');
  const loginForm = document.getElementById('login-form');
  const loginEmail = document.getElementById('login-email');
  const loginPassword = document.getElementById('login-password');
  
  const profileEmail = document.getElementById('profile-email');
  const profileRole = document.getElementById('profile-role');
  const logoutBtn = document.getElementById('logout-btn');
  
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const tabTitle = document.getElementById('tab-title');
  
  const apiKeyBadgeValue = document.getElementById('active-key-value');
  const copyKeyBtn = document.getElementById('copy-key-btn');
  const refreshRulesBtn = document.getElementById('refresh-rules-btn');
  const rulesGrid = document.getElementById('rules-grid');
  
  const openCreateModalBtn = document.getElementById('open-create-modal-btn');
  const closeCreateModalBtn = document.getElementById('close-create-modal-btn');
  const cancelCreateModalBtn = document.getElementById('cancel-create-modal-btn');
  const createModal = document.getElementById('create-modal');
  const createRuleForm = document.getElementById('create-rule-form');
  
  const testerEndpoint = document.getElementById('tester-endpoint');
  const fireRequestBtn = document.getElementById('fire-request-btn');
  const fireBurstBtn = document.getElementById('fire-burst-btn');
  const consoleBody = document.getElementById('console-body');
  const clearConsoleBtn = document.getElementById('clear-console-btn');
  
  const gaugeRemaining = document.getElementById('gauge-remaining');
  const gaugeLimit = document.getElementById('gauge-limit');
  const gaugeRatio = document.getElementById('gauge-ratio');
  const gaugeReset = document.getElementById('gauge-reset');
  const circularProgress = document.getElementById('circular-progress');
  
  const statTotalRequests = document.getElementById('stat-total-requests');
  const statAllowedRequests = document.getElementById('stat-allowed-requests');
  const statBlockedRequests = document.getElementById('stat-blocked-requests');
  const statBlockRate = document.getElementById('stat-block-rate');
  const dbLogsBody = document.getElementById('db-logs-body');
  const clearDbLogsBtn = document.getElementById('clear-db-logs-btn');

  // --- INITIALIZATION ---
  function init() {
    if (state.token) {
      showDashboard();
    } else {
      showLogin();
    }
  }

  // --- VIEW TRANSITIONS ---
  function showLogin() {
    authOverlay.classList.remove('hidden');
    appContainer.classList.add('hidden');
  }

  function showDashboard() {
    authOverlay.classList.add('hidden');
    appContainer.classList.remove('hidden');
    
    // Set Profile UI
    if (state.user) {
      profileEmail.textContent = state.user.email;
      profileRole.textContent = state.user.role;
    }
    
    apiKeyBadgeValue.textContent = truncateString(state.apiKey, 18);
    
    // Fetch Data
    fetchRules();
    fetchLogs();
  }

  // --- TOAST NOTIFICATIONS ---
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '';
    if (type === 'success') {
      icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'error') {
      icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else {
      icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `${icon}<span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // --- LOGIN SUBMIT ---
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = loginEmail.value.trim();
    const password = loginPassword.value;

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const result = await response.json();
      if (result.success) {
        state.token = result.data.token;
        state.user = result.data.user;
        
        localStorage.setItem('rg_admin_token', state.token);
        localStorage.setItem('rg_admin_user', JSON.stringify(state.user));

        showToast('Successfully authenticated!', 'success');
        
        // Auto-generate test key for the user if it is a fresh session
        await generateTestApiKey();
        
        showDashboard();
      } else {
        showToast(result.error?.message || 'Login failed', 'error');
      }
    } catch (err) {
      showToast('Network error during authentication', 'error');
    }
  });

  // --- LOGOUT ---
  logoutBtn.addEventListener('click', () => {
    state.token = '';
    state.user = null;
    localStorage.removeItem('rg_admin_token');
    localStorage.removeItem('rg_admin_user');
    showToast('Signed out successfully.', 'info');
    showLogin();
  });

  // --- GENERATING TEST API KEY ---
  async function generateTestApiKey() {
    try {
      const response = await fetch('/api/v1/auth/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({ label: 'Dashboard Tester Key' })
      });
      const result = await response.json();
      if (result.success) {
        state.apiKey = result.data.apiKey;
        localStorage.setItem('rg_test_apikey', state.apiKey);
      }
    } catch (err) {
      console.error('Failed to generate automatic test API key, falling back to sample key:', err);
    }
  }

  // --- TAB NAVIGATION ---
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      state.activeTab = tabId;
      
      // Update sidebar nav UI
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // Update tab pane visibility
      tabPanes.forEach(pane => pane.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');
      
      // Update top header title
      tabTitle.textContent = item.querySelector('span').textContent;
      
      // Load specific data on tab change
      if (tabId === 'rules-tab') {
        fetchRules();
      } else if (tabId === 'analytics-tab') {
        fetchLogs();
      }
    });
  });

  // --- COPY API KEY ---
  copyKeyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(state.apiKey);
    showToast('API Key copied to clipboard!', 'success');
  });

  // --- SYNC RULE CACHE ---
  refreshRulesBtn.addEventListener('click', async () => {
    await fetchRules();
    showToast('Rule cache successfully synchronized across clusters.', 'success');
  });

  // --- FETCH RULES ---
  async function fetchRules() {
    try {
      const response = await fetch('/api/v1/admin/rules', {
        headers: { 'Authorization': `Bearer ${state.token}` }
      });
      
      if (response.status === 401) {
        showToast('Session expired, please login again.', 'error');
        logoutBtn.click();
        return;
      }

      const result = await response.json();
      if (result.success) {
        state.rules = result.data;
        renderRules();
      }
    } catch (err) {
      showToast('Error loading rules from cluster.', 'error');
    }
  }

  // --- RENDER RULES ---
  function renderRules() {
    if (state.rules.length === 0) {
      rulesGrid.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="9" y1="9" x2="15" y2="15"></line>
            <line x1="15" y1="9" x2="9" y2="15"></line>
          </svg>
          <p>No active rate limiting strategies defined. Deploy one to protect your endpoints!</p>
        </div>`;
      return;
    }

    rulesGrid.innerHTML = state.rules.map(rule => `
      <div class="rule-card" id="rule-card-${rule.id}">
        <div class="rule-card-header">
          <span class="rule-name" title="${rule.name}">${rule.name}</span>
          <span class="algo-badge">${rule.algorithm}</span>
        </div>
        <div class="rule-meta-details">
          <div class="meta-item">
            <span class="meta-label">Limit By</span>
            <span class="meta-value">${rule.limitBy}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Value Match</span>
            <span class="meta-value" title="${rule.value}">${rule.value}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Max Requests</span>
            <span class="meta-value">${rule.limitValue} reqs</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Time Window</span>
            <span class="meta-value">${rule.windowSize}s</span>
          </div>
        </div>
        <div class="rule-card-actions">
          <div class="switch-container">
            <label class="switch">
              <input type="checkbox" class="toggle-rule-state" data-id="${rule.id}" ${rule.active ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
            <span class="switch-label">${rule.active ? 'Active' : 'Disabled'}</span>
          </div>
          <button class="delete-rule-btn" data-id="${rule.id}" title="Delete Strategy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    // Attach Toggle Action
    document.querySelectorAll('.toggle-rule-state').forEach(toggle => {
      toggle.addEventListener('change', async (e) => {
        const id = e.target.getAttribute('data-id');
        try {
          const response = await fetch(`/api/v1/admin/rules/${id}/toggle`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${state.token}` }
          });
          const result = await response.json();
          if (result.success) {
            showToast(`Strategy '${result.data.name}' status updated.`, 'success');
            fetchRules();
          } else {
            showToast(result.error?.message || 'Toggle failed', 'error');
            e.target.checked = !e.target.checked; // Revert switch UI
          }
        } catch (err) {
          showToast('Failed to contact server.', 'error');
          e.target.checked = !e.target.checked;
        }
      });
    });

    // Attach Delete Action
    document.querySelectorAll('.delete-rule-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('Are you sure you want to delete this rate limit strategy rule?')) return;

        try {
          const response = await fetch(`/api/v1/admin/rules/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${state.token}` }
          });
          const result = await response.json();
          if (result.success) {
            showToast('Strategy deleted successfully.', 'success');
            fetchRules();
          } else {
            showToast(result.error?.message || 'Delete failed', 'error');
          }
        } catch (err) {
          showToast('Failed to contact server.', 'error');
        }
      });
    });
  }

  // --- MODAL DIALOG CONTROLS ---
  openCreateModalBtn.addEventListener('click', () => createModal.classList.remove('hidden'));
  closeCreateModalBtn.addEventListener('click', () => createModal.classList.add('hidden'));
  cancelCreateModalBtn.addEventListener('click', () => createModal.classList.add('hidden'));
  
  // Close modal when clicking outside card
  window.addEventListener('click', (e) => {
    if (e.target === createModal) {
      createModal.classList.add('hidden');
    }
  });

  // --- CREATE RULE FORM SUBMIT ---
  createRuleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('rule-name').value.trim();
    const limitBy = document.getElementById('rule-limitBy').value;
    const value = document.getElementById('rule-value').value.trim();
    const algorithm = document.getElementById('rule-algorithm').value;
    const limitValue = parseInt(document.getElementById('rule-limitValue').value);
    const windowSize = parseInt(document.getElementById('rule-windowSize').value);
    
    // Optional fields
    const capVal = document.getElementById('rule-bucketCapacity').value;
    const refVal = document.getElementById('rule-refillRate').value;
    const bucketCapacity = capVal ? parseInt(capVal) : null;
    const refillRate = refVal ? parseFloat(refVal) : null;

    const payload = { name, limitBy, value, algorithm, limitValue, windowSize };
    if (bucketCapacity !== null) payload.bucketCapacity = bucketCapacity;
    if (refillRate !== null) payload.refillRate = refillRate;

    try {
      const response = await fetch('/api/v1/admin/rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (result.success) {
        showToast(`Strategy '${name}' deployed successfully!`, 'success');
        createRuleForm.reset();
        createModal.classList.add('hidden');
        fetchRules();
      } else {
        showToast(result.error?.message || 'Creation failed.', 'error');
      }
    } catch (err) {
      showToast('Network error while deploying rule.', 'error');
    }
  });

  // --- CONSOLE UTILITY LOGGERS ---
  function logToConsole(message, type = 'system') {
    const timestamp = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    line.innerHTML = `<span class="time" style="color:var(--color-text-muted);margin-right:0.5rem;">[${timestamp}]</span><span>${message}</span>`;
    consoleBody.appendChild(line);
    consoleBody.scrollTop = consoleBody.scrollHeight;
  }

  clearConsoleBtn.addEventListener('click', () => {
    consoleBody.innerHTML = '<div class="console-line system">Console cleared.</div>';
  });

  // --- INTERACTIVE SIMULATOR REQUESTS ---
  fireRequestBtn.addEventListener('click', () => executeSimulatedRequest());

  fireBurstBtn.addEventListener('click', () => {
    let count = 0;
    fireRequestBtn.disabled = true;
    fireBurstBtn.disabled = true;
    
    logToConsole('Starting burst sequence (10 requests at 150ms intervals)...', 'system');
    
    const interval = setInterval(async () => {
      count++;
      await executeSimulatedRequest(true);
      if (count >= 10) {
        clearInterval(interval);
        fireRequestBtn.disabled = false;
        fireBurstBtn.disabled = false;
        logToConsole('Burst sequence completed.', 'system');
        
        // Wait 500ms for BullMQ worker to persist logs, then update UI logs
        setTimeout(fetchLogs, 500);
      }
    }, 150);
  });

  async function executeSimulatedRequest(isBurst = false) {
    const path = testerEndpoint.value;
    const method = testerEndpoint.options[testerEndpoint.selectedIndex].getAttribute('data-method');
    const authType = document.querySelector('input[name="auth-type"]:checked').value;

    const headers = {};
    if (authType === 'apikey') {
      headers['x-api-key'] = state.apiKey;
    } else if (authType === 'jwt') {
      headers['Authorization'] = `Bearer ${state.token}`;
    }

    try {
      const response = await fetch(path, { method, headers });
      const status = response.status;
      
      const limitHeader = response.headers.get('X-RateLimit-Limit');
      const remainingHeader = response.headers.get('X-RateLimit-Remaining');
      const resetHeader = response.headers.get('X-RateLimit-Reset');
      const retryAfter = response.headers.get('Retry-After');

      updateGauge(remainingHeader, limitHeader, resetHeader, retryAfter);

      if (status === 200) {
        const body = await response.json();
        logToConsole(`SUCCESS: ${method} ${path} -> Status 200 OK | Reqs Remaining: ${remainingHeader || 'N/A'}/${limitHeader || 'N/A'}`, 'success');
      } else if (status === 429) {
        const body = await response.json();
        const ruleName = body.error?.details?.ruleName || 'Unknown Rule';
        logToConsole(`BLOCKED: ${method} ${path} -> Status 429 Too Many Requests | Violated Strategy: "${ruleName}" | Retry-After: ${retryAfter || 'N/A'}s`, 'error');
      } else {
        const body = await response.json();
        logToConsole(`ERROR: ${method} ${path} -> Status ${status} | Msg: ${body.error?.message || 'Server error'}`, 'error');
      }

      if (!isBurst) {
        // Refresh logs in analytics panel
        setTimeout(fetchLogs, 500);
      }
    } catch (err) {
      logToConsole(`NETWORK FAILURE: Could not connect to API server.`, 'error');
    }
  }

  // --- UPDATE GAUGE UI ---
  function updateGauge(remaining, limit, resetUnix, retryAfter) {
    if (remaining === null || limit === null) {
      gaugeRemaining.textContent = '--';
      gaugeLimit.textContent = '--';
      gaugeRatio.textContent = '--%';
      gaugeReset.textContent = '--';
      circularProgress.style.background = `conic-gradient(var(--color-primary) 0%, rgba(255,255,255,0.05) 0%)`;
      return;
    }

    const rem = parseInt(remaining);
    const lim = parseInt(limit);
    const percent = lim > 0 ? (rem / lim) * 100 : 0;

    gaugeRemaining.textContent = rem;
    gaugeLimit.textContent = lim;
    gaugeRatio.textContent = `${Math.round(percent)}%`;

    // Circular background logic
    let ringColor = 'var(--color-primary)';
    if (percent <= 20) ringColor = 'var(--color-danger)';
    else if (percent <= 50) ringColor = 'var(--color-warning)';
    
    circularProgress.style.background = `conic-gradient(${ringColor} ${percent}%, rgba(255,255,255,0.05) ${percent}%)`;

    // Reset countdown clock timer
    if (state.resetTimerInterval) clearInterval(state.resetTimerInterval);

    if (retryAfter) {
      let secondsLeft = parseInt(retryAfter);
      gaugeReset.textContent = `Blocked! Retry in ${secondsLeft}s`;
      gaugeReset.className = 'glow-red';
      
      state.resetTimerInterval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft <= 0) {
          clearInterval(state.resetTimerInterval);
          gaugeReset.textContent = 'Ready';
          gaugeReset.className = 'glow-green';
        } else {
          gaugeReset.textContent = `Blocked! Retry in ${secondsLeft}s`;
        }
      }, 1000);
    } else if (resetUnix) {
      const resetTimeMs = parseInt(resetUnix) * 1000;
      
      const updateClock = () => {
        const diff = Math.max(0, Math.ceil((resetTimeMs - Date.now()) / 1000));
        if (diff <= 0) {
          clearInterval(state.resetTimerInterval);
          gaugeReset.textContent = 'Reset';
          gaugeReset.className = 'glow-green';
        } else {
          gaugeReset.textContent = `${diff}s to reset`;
          gaugeReset.className = 'glow-green';
        }
      };

      updateClock();
      state.resetTimerInterval = setInterval(updateClock, 1000);
    } else {
      gaugeReset.textContent = 'N/A';
      gaugeReset.className = '';
    }
  }

  // --- FETCH LOGS & STATS ---
  async function fetchLogs() {
    try {
      const response = await fetch('/api/v1/admin/rules/logs/history', {
        headers: { 'Authorization': `Bearer ${state.token}` }
      });
      const result = await response.json();
      if (result.success) {
        state.logs = result.data;
        renderLogsTable();
        calculateStatsAndDrawChart();
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
  }

  // --- RENDER LOGS TABLE ---
  function renderLogsTable() {
    if (state.logs.length === 0) {
      dbLogsBody.innerHTML = `
        <tr>
          <td colspan="5" class="empty-state">No execution logs found. Run some API requests to generate logs!</td>
        </tr>`;
      return;
    }

    dbLogsBody.innerHTML = state.logs.map(log => {
      const date = new Date(log.timestamp).toLocaleTimeString() + ' ' + new Date(log.timestamp).toLocaleDateString();
      const statusPillClass = log.allowed ? 'allowed' : 'blocked';
      const statusText = log.allowed ? 'Allowed' : 'Blocked';
      
      return `
        <tr>
          <td>${date}</td>
          <td><span style="font-family:monospace;color:var(--color-text-secondary);">${log.identifier}</span></td>
          <td>${log.ipAddress}</td>
          <td>${log.endpoint}</td>
          <td><span class="logs-status-pill ${statusPillClass}">${statusText}</span></td>
        </tr>
      `;
    }).join('');
  }

  // --- CLEAR DB LOGS ---
  clearDbLogsBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to purge all rate-limit activity logs from PostgreSQL database?')) return;
    try {
      const response = await fetch('/api/v1/admin/rules/logs/history', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${state.token}` }
      });
      const result = await response.json();
      if (result.success) {
        showToast('Activity logs cleared successfully.', 'success');
        fetchLogs();
      }
    } catch (err) {
      showToast('Failed to clear logs.', 'error');
    }
  });

  // --- CALCULATE STATS & DRAW CHART ---
  function calculateStatsAndDrawChart() {
    const total = state.logs.length;
    const allowed = state.logs.filter(l => l.allowed).length;
    const blocked = state.logs.filter(l => !l.allowed).length;
    const rate = total > 0 ? (blocked / total) * 100 : 0;

    statTotalRequests.textContent = total;
    statAllowedRequests.textContent = allowed;
    statBlockedRequests.textContent = blocked;
    statBlockRate.textContent = `${Math.round(rate)}%`;

    // Draw Chart
    if (state.metricsChart) {
      state.metricsChart.destroy();
    }

    const ctx = document.getElementById('metricsChart').getContext('2d');
    
    // If no logs, draw empty chart
    const dataValues = total > 0 ? [allowed, blocked] : [1, 0];
    const dataLabels = total > 0 ? ['Allowed', 'Blocked'] : ['No Data', ''];
    const bgColors = total > 0 ? ['#10b981', '#f43f5e'] : ['rgba(255,255,255,0.05)', 'transparent'];
    const hoverBgColors = total > 0 ? ['#059669', '#e11d48'] : ['rgba(255,255,255,0.05)', 'transparent'];

    state.metricsChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: dataLabels,
        datasets: [{
          data: dataValues,
          backgroundColor: bgColors,
          hoverBackgroundColor: hoverBgColors,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.05)',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#94a3b8',
              font: {
                family: 'Inter',
                size: 11
              }
            }
          }
        },
        cutout: '70%',
      }
    });
  }

  // --- HELPERS ---
  function truncateString(str, num) {
    if (!str) return '';
    if (str.length <= num) return str;
    return str.slice(0, num) + '...';
  }

  // --- BOOTSTRAP APP ---
  init();
});
