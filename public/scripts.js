document.addEventListener("DOMContentLoaded", () => {

  // ── Socket ──────────────────────────────────────────────
  let socket;
  try { socket = io(); } catch(e) { socket = { on: () => {}, emit: () => {} }; }

  const phoneInput        = document.getElementById("phone");
  const requestPairingBtn = document.getElementById("requestPairing");
  const statusEl          = document.getElementById("status");
  const countdownWrap     = document.getElementById("countdownWrap");
  const countdownBar      = document.getElementById("countdownBar");
  const countdownSec      = document.getElementById("countdownSec");
  const stepsWrap         = document.getElementById("stepsWrap");
  const botStatusDot      = document.getElementById("botStatusDot");
  const botStatusText     = document.getElementById("botStatusText");
  const themeToggle       = document.getElementById("themeToggle");
  const themeIcon         = document.getElementById("themeIcon");
  const toastContainer    = document.getElementById("toastContainer");
  const flagEmoji         = document.getElementById("flagEmoji");
  const countryLabel      = document.getElementById("countryLabel");

  // ── Year ─────────────────────────────────────────────────
  document.getElementById('year').textContent = new Date().getFullYear();

  // ── Particles ────────────────────────────────────────────
  const pc = document.getElementById('particles');
  const count = window.innerWidth < 600 ? 18 : 36;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 4 + 2;
    p.style.cssText = `width:${size}px;height:${size}px;left:${Math.random()*100}%;animation-duration:${Math.random()*18+14}s;animation-delay:${Math.random()*18}s;`;
    pc.appendChild(p);
  }

  // ══════════════════════════════════════════════════
  // 🎵 SUCCESS SOUND
  // ══════════════════════════════════════════════════
  function playSuccessSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5 E5 G5 C6
      notes.forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.12;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.25, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.start(t);
        osc.stop(t + 0.35);
      });
    } catch(e) {}
  }

  function playGenerateSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(660, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } catch(e) {}
  }

  // ══════════════════════════════════════════════════
  // 🎨 THEME COLOR PICKER
  // ══════════════════════════════════════════════════
  const colorPickerBtn  = document.getElementById("colorPickerBtn");
  const colorOptions    = document.getElementById("colorOptions");
  const colorSwatches   = document.querySelectorAll(".color-swatch");
  const metaThemeColor  = document.getElementById("metaThemeColor");

  const themeColors = {
    purple: "#6c3adb", red: "#dc2626", blue: "#1d4ed8",
    green:  "#059669", orange: "#ea580c", pink: "#be185d"
  };

  const savedColor = localStorage.getItem('drHoneyColor') || 'purple';
  applyColor(savedColor);

  colorPickerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    colorOptions.classList.toggle('open');
  });
  document.addEventListener('click', () => colorOptions.classList.remove('open'));
  colorOptions.addEventListener('click', e => e.stopPropagation());

  colorSwatches.forEach(sw => {
    sw.addEventListener('click', () => {
      const color = sw.dataset.color;
      applyColor(color);
      localStorage.setItem('drHoneyColor', color);
      colorOptions.classList.remove('open');
      showToast(`Theme changed to ${color.charAt(0).toUpperCase()+color.slice(1)}! 🎨`, 'info', 2000);
    });
  });

  function applyColor(color) {
    document.body.dataset.theme = color;
    colorSwatches.forEach(sw => sw.classList.toggle('active', sw.dataset.color === color));
    if (metaThemeColor) metaThemeColor.content = themeColors[color] || themeColors.purple;
  }

  // ══════════════════════════════════════════════════
  // 🌙 DARK / LIGHT MODE TOGGLE
  // ══════════════════════════════════════════════════
  const savedTheme = localStorage.getItem('drHoneyTheme') || 'dark';
  if (savedTheme === 'light') applyLight();

  themeToggle.addEventListener('click', () => {
    if (document.body.classList.contains('light-mode')) {
      applyDark();
      localStorage.setItem('drHoneyTheme', 'dark');
    } else {
      applyLight();
      localStorage.setItem('drHoneyTheme', 'light');
    }
  });

  function applyLight() { document.body.classList.add('light-mode');    themeIcon.className = 'fas fa-sun'; }
  function applyDark()  { document.body.classList.remove('light-mode'); themeIcon.className = 'fas fa-moon'; }

  // ══════════════════════════════════════════════════
  // 🔔 TOAST NOTIFICATIONS
  // ══════════════════════════════════════════════════
  function showToast(message, type = 'info', duration = 3500) {
    const icons = { success:'✅', error:'❌', info:'💬', warning:'⚠️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type]||'💬'}</span><span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 350);
    }, duration);
  }

  // ══════════════════════════════════════════════════
  // 🌍 COUNTRY FLAG AUTO-DETECT
  // ══════════════════════════════════════════════════
  const countryData = [
    { code:"92", flag:"🇵🇰", name:"Pakistan" },
    { code:"91", flag:"🇮🇳", name:"India" },
    { code:"1",  flag:"🇺🇸", name:"USA / Canada" },
    { code:"44", flag:"🇬🇧", name:"United Kingdom" },
    { code:"971",flag:"🇦🇪", name:"UAE" },
    { code:"966",flag:"🇸🇦", name:"Saudi Arabia" },
    { code:"880", flag:"🇧🇩",name:"Bangladesh" },
    { code:"20", flag:"🇪🇬", name:"Egypt" },
    { code:"234",flag:"🇳🇬", name:"Nigeria" },
    { code:"254",flag:"🇰🇪", name:"Kenya" },
    { code:"27", flag:"🇿🇦", name:"South Africa" },
    { code:"62", flag:"🇮🇩", name:"Indonesia" },
    { code:"60", flag:"🇲🇾", name:"Malaysia" },
    { code:"65", flag:"🇸🇬", name:"Singapore" },
    { code:"63", flag:"🇵🇭", name:"Philippines" },
    { code:"66", flag:"🇹🇭", name:"Thailand" },
    { code:"84", flag:"🇻🇳", name:"Vietnam" },
    { code:"86", flag:"🇨🇳", name:"China" },
    { code:"81", flag:"🇯🇵", name:"Japan" },
    { code:"82", flag:"🇰🇷", name:"South Korea" },
    { code:"55", flag:"🇧🇷", name:"Brazil" },
    { code:"52", flag:"🇲🇽", name:"Mexico" },
    { code:"54", flag:"🇦🇷", name:"Argentina" },
    { code:"49", flag:"🇩🇪", name:"Germany" },
    { code:"33", flag:"🇫🇷", name:"France" },
    { code:"39", flag:"🇮🇹", name:"Italy" },
    { code:"34", flag:"🇪🇸", name:"Spain" },
    { code:"7",  flag:"🇷🇺", name:"Russia" },
    { code:"90", flag:"🇹🇷", name:"Turkey" },
    { code:"98", flag:"🇮🇷", name:"Iran" },
    { code:"93", flag:"🇦🇫", name:"Afghanistan" },
    { code:"964",flag:"🇮🇶", name:"Iraq" },
    { code:"961",flag:"🇱🇧", name:"Lebanon" },
    { code:"962",flag:"🇯🇴", name:"Jordan" },
    { code:"213",flag:"🇩🇿", name:"Algeria" },
    { code:"216",flag:"🇹🇳", name:"Tunisia" },
    { code:"212",flag:"🇲🇦", name:"Morocco" },
    { code:"256",flag:"🇺🇬", name:"Uganda" },
    { code:"255",flag:"🇹🇿", name:"Tanzania" },
    { code:"233",flag:"🇬🇭", name:"Ghana" },
    { code:"94", flag:"🇱🇰", name:"Sri Lanka" },
    { code:"977", flag:"🇳🇵",name:"Nepal" },
    { code:"95", flag:"🇲🇲", name:"Myanmar" },
    { code:"61", flag:"🇦🇺", name:"Australia" },
    { code:"64", flag:"🇳🇿", name:"New Zealand" },
    { code:"31", flag:"🇳🇱", name:"Netherlands" },
    { code:"32", flag:"🇧🇪", name:"Belgium" },
    { code:"41", flag:"🇨🇭", name:"Switzerland" },
    { code:"46", flag:"🇸🇪", name:"Sweden" },
    { code:"47", flag:"🇳🇴", name:"Norway" },
    { code:"45", flag:"🇩🇰", name:"Denmark" },
    { code:"48", flag:"🇵🇱", name:"Poland" },
    { code:"380",flag:"🇺🇦", name:"Ukraine" },
    { code:"30", flag:"🇬🇷", name:"Greece" },
    { code:"351",flag:"🇵🇹", name:"Portugal" },
    { code:"420",flag:"🇨🇿", name:"Czech Republic" },
    { code:"36", flag:"🇭🇺", name:"Hungary" },
    { code:"40", flag:"🇷🇴", name:"Romania" },
  ];

  // Sort by code length descending for longest-match first
  const sortedCountries = [...countryData].sort((a,b)=>b.code.length-a.code.length);

  function detectCountry(number) {
    for (const c of sortedCountries) {
      if (number.startsWith(c.code)) return c;
    }
    return null;
  }

  phoneInput.addEventListener('input', function() {
    this.value = this.value.replace(/\D/g, '').slice(0, 15);
    const val = this.value;
    const country = detectCountry(val);
    if (country && val.length >= country.code.length) {
      flagEmoji.textContent = country.flag;
      countryLabel.textContent = country.flag + ' ' + country.name;
    } else {
      flagEmoji.textContent = '🌍';
      countryLabel.textContent = '';
    }
  });
  phoneInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') requestPairingBtn.click();
  });

  // ══════════════════════════════════════════════════
  // 🤖 BOT STATUS INDICATOR
  // ══════════════════════════════════════════════════
  function updateBotStatus(isOnline, count = 0) {
    if (isOnline && count > 0) {
      botStatusDot.className = 'bot-status-dot online';
      botStatusText.className = 'bot-status-text online';
      botStatusText.textContent = 'Online';
    } else {
      botStatusDot.className = 'bot-status-dot offline';
      botStatusText.className = 'bot-status-text offline';
      botStatusText.textContent = 'Offline';
    }
  }
  updateBotStatus(false, 0);

  // ══════════════════════════════════════════════════
  // 📊 COMMANDS COUNT BADGE
  // ══════════════════════════════════════════════════
  const commandsCount = document.getElementById('commandsCount');
  fetch('/api/commands')
    .then(r => r.json())
    .then(d => {
      const cnt = (d.commands || []).length;
      commandsCount.textContent = cnt + ' cmds';
    })
    .catch(() => { commandsCount.textContent = '? cmds'; });

  // ══════════════════════════════════════════════════
  // 📈 USAGE GRAPH (last 7 days)
  // ══════════════════════════════════════════════════
  function renderUsageChart(data) {
    const chart = document.getElementById('usageChart');
    if (!chart) return;
    chart.innerHTML = '';
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const today = new Date().getDay();
    const max = Math.max(...data.map(d=>d.count), 1);
    data.forEach((d, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'usage-bar-wrap';
      const barH = Math.max(4, Math.round((d.count / max) * 60));
      const isToday = i === data.length - 1;
      wrap.innerHTML = `
        <div class="usage-val">${d.count}</div>
        <div class="usage-bar${isToday?' today':''}" style="height:${barH}px"></div>
        <div class="usage-day">${d.day}</div>
      `;
      chart.appendChild(wrap);
    });
  }

  function loadUsageData() {
    fetch('/api/usage')
      .then(r => r.json())
      .then(d => renderUsageChart(d.data || []))
      .catch(() => {
        // Demo fallback
        const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const td = new Date().getDay();
        const demo = [];
        for (let i = 6; i >= 0; i--) {
          const di = (td - i + 7) % 7;
          demo.push({ day: days[di], count: i === 0 ? 0 : Math.floor(Math.random()*12+1) });
        }
        renderUsageChart(demo);
      });
  }
  loadUsageData();

  // ══════════════════════════════════════════════════
  // ⭐ CONFETTI / FIREWORKS ANIMATION
  // ══════════════════════════════════════════════════
  function launchConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const pieces = [];
    const colors = ['#6c3adb','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#3b82f6','#fbbf24'];

    for (let i = 0; i < 180; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        w: Math.random() * 10 + 4,
        h: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        speed: Math.random() * 3 + 2,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.15,
        drift: (Math.random() - 0.5) * 2
      });
    }

    let frame = 0;
    const maxFrames = 140;

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - frame / maxFrames);
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx.restore();
        p.y     += p.speed;
        p.x     += p.drift;
        p.angle += p.spin;
      });
      frame++;
      if (frame < maxFrames) requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    draw();
  }

  // ══════════════════════════════════════════════════
  // ⭐ SUCCESS OVERLAY
  // ══════════════════════════════════════════════════
  const successOverlay  = document.getElementById('successOverlay');
  const successCloseBtn = document.getElementById('successCloseBtn');
  const successSessionId= document.getElementById('successSessionId');

  function showSuccessScreen(sessionId) {
    successSessionId.textContent = 'Session: ' + (sessionId || '');
    successOverlay.style.display = 'flex';
    launchConfetti();
    playSuccessSound();
  }

  successCloseBtn.addEventListener('click', () => {
    successOverlay.style.display = 'none';
  });

  // ══════════════════════════════════════════════════
  // ⏱️ COUNTDOWN TIMER
  // ══════════════════════════════════════════════════
  let countdownInterval = null;

  function startCountdown(seconds = 60) {
    clearInterval(countdownInterval);
    let remaining = seconds;
    countdownWrap.style.display = 'block';
    countdownBar.style.width = '100%';
    countdownBar.classList.remove('danger');
    countdownSec.textContent = remaining;

    countdownInterval = setInterval(() => {
      remaining--;
      countdownSec.textContent = remaining;
      countdownBar.style.width = (remaining / seconds * 100) + '%';
      if (remaining <= 15) {
        countdownBar.classList.add('danger');
        countdownSec.style.color = '#ef4444';
      }
      if (remaining <= 0) {
        clearInterval(countdownInterval);
        countdownWrap.style.display = 'none';
        countdownSec.style.color = '';
        showToast('⏰ Code expired! Please generate a new one.', 'warning');
        showStatus('<span class="status-msg" style="color:#f59e0b;">⏰ Code expired. Generate a new one.</span>', 'warning');
        stepsWrap.style.display = 'none';
      }
    }, 1000);
  }

  function stopCountdown() {
    clearInterval(countdownInterval);
    countdownWrap.style.display = 'none';
    countdownSec.style.color = '';
  }

  // ── Show status ──────────────────────────────────────────
  function showStatus(html, type = '') {
    statusEl.innerHTML = html;
    statusEl.className = 'code-box fade-in' + (type ? ' ' + type : '');
  }

  // ══════════════════════════════════════════════════
  // 🔑 REQUEST PAIRING + COPY BUTTON
  // ══════════════════════════════════════════════════
  requestPairingBtn.addEventListener("click", async () => {
    const number = phoneInput.value.trim();

    if (!number) {
      showStatus('<span class="status-msg" style="color:#ef4444">❌ Please enter your phone number with country code.</span>', 'error');
      showToast('Enter your phone number first!', 'error');
      return;
    }
    if (!/^[0-9]{8,15}$/.test(number)) {
      showStatus('<span class="status-msg" style="color:#ef4444">❌ Invalid number. Digits only, 8–15 characters.</span>', 'error');
      showToast('Invalid number format!', 'error');
      return;
    }

    playGenerateSound();
    stopCountdown();
    stepsWrap.style.display = 'none';
    requestPairingBtn.disabled = true;
    requestPairingBtn.innerHTML = '<span class="spinner"></span> Generating...';
    showStatus('<span class="status-msg" style="color:#6c3adb"><span class="spinner" style="border-color:rgba(108,58,219,0.3);border-top-color:#6c3adb;"></span> &nbsp;Requesting your pair code…</span>', '');
    showToast('Generating your pair code...', 'info', 2500);

    try {
      const res  = await fetch("/api/pair", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ number }),
      });
      const data = await res.json();

      if (!res.ok) {
        showStatus(`<span class="status-msg" style="color:#ef4444">❌ ${data.error || "Failed to get pairing code."}</span>`, 'error');
        showToast(data.error || 'Failed to get pairing code.', 'error');
        return;
      }

      const code   = (data.pairingCode || "").toString().trim();
      const spaced = code.match(/.{1,4}/g)?.join(' ') || code;

      showStatus(`
        <div style="width:100%;text-align:center;position:relative;">
          <button class="copy-btn" id="copyBtn">
            <i class="fas fa-copy"></i> Copy
          </button>
          <div class="pairing-code" id="pairingCode">${spaced}</div>
          <div class="pair-label" style="margin-top:8px;">
            <i class="fas fa-hand-pointer" style="font-size:0.75rem;"></i> Tap code or use Copy button
          </div>
        </div>
      `, 'success');

      playGenerateSound();
      showToast('Pair code generated! Copy and enter in WhatsApp.', 'success');
      stepsWrap.style.display = 'block';
      startCountdown(60);

      // Track daily usage
      fetch('/api/usage/track', { method:'POST' }).catch(()=>{});

      const copyBtn = document.getElementById("copyBtn");
      const codeEl  = document.getElementById("pairingCode");

      function doCopy() {
        navigator.clipboard.writeText(code).then(() => {
          copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
          copyBtn.classList.add('copied');
          showToast('Code copied to clipboard!', 'success', 2000);
          setTimeout(() => {
            copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
            copyBtn.classList.remove('copied');
          }, 2000);
        }).catch(() => {
          const range = document.createRange();
          range.selectNode(codeEl);
          window.getSelection().removeAllRanges();
          window.getSelection().addRange(range);
          showToast('Select & copy the code manually.', 'warning');
        });
      }

      if (copyBtn) copyBtn.addEventListener("click", doCopy);
      if (codeEl)  codeEl.addEventListener("click", doCopy);

    } catch (err) {
      showStatus('<span class="status-msg" style="color:#ef4444">❌ Network error. Please try again.</span>', 'error');
      showToast('Network error. Try again.', 'error');
    } finally {
      requestPairingBtn.disabled = false;
      requestPairingBtn.innerHTML = '<i class="fas fa-key"></i> Generate Pair Code';
    }
  });

  // ── Socket events ────────────────────────────────────────
  socket.on("linked", ({ sessionId }) => {
    stopCountdown();
    stepsWrap.style.display = 'none';
    showStatus(`
      <div style="text-align:center;">
        <div style="font-size:2rem;color:#10b981;margin-bottom:8px;">✅</div>
        <div class="status-msg" style="color:#10b981;font-weight:700;">Successfully Connected!</div>
        <div class="pair-label">Session: ${sessionId}</div>
      </div>
    `, 'success');
    showToast('WhatsApp connected successfully! 🎉', 'success', 5000);
    updateBotStatus(true, 1);
    phoneInput.value = '';
    flagEmoji.textContent = '🌍';
    countryLabel.textContent = '';
    showSuccessScreen(sessionId);
    loadUsageData();
  });

  socket.on("unlinked",      () => showToast('Bot disconnected.', 'warning'));

  socket.on("pairingTimeout", ({ number }) => {
    stopCountdown();
    stepsWrap.style.display = 'none';
    showStatus(`<div class="status-msg" style="color:#f59e0b;">⏰ Code for ${number} expired. Generate a new one.</div>`, 'warning');
    showToast('Pairing code expired!', 'warning');
  });

  // ── Live stats ──────────────────────────────────────────
  function animateTo(el, newVal) {
    if (!el) return;
    const current = parseInt(el.textContent.replace(/\D/g, '')) || 0;
    if (current === newVal) return;
    el.classList.remove('stat-tick');
    void el.offsetWidth;
    el.textContent = newVal;
    el.classList.add('stat-tick');
  }

  socket.on("statsUpdate", ({ activeSockets, totalUsers }) => {
    animateTo(document.getElementById("totalUsers"),  totalUsers    || 0);
    animateTo(document.getElementById("activeCount"), activeSockets || 0);
    updateBotStatus(activeSockets > 0, activeSockets);
  });

  // ══════════════════════════════════════════════════
  // 📱 PWA SUPPORT
  // ══════════════════════════════════════════════════
  let deferredPrompt = null;
  const pwaBanner     = document.getElementById('pwaBanner');
  const pwaInstallBtn = document.getElementById('pwaInstallBtn');
  const pwaDismiss    = document.getElementById('pwaDismiss');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!localStorage.getItem('pwaDismissed')) {
      pwaBanner.style.display = 'flex';
    }
  });

  if (pwaInstallBtn) {
    pwaInstallBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      pwaBanner.style.display = 'none';
      showToast(outcome === 'accepted' ? 'App installed! 🎉' : 'Maybe next time!', outcome === 'accepted' ? 'success' : 'info');
    });
  }

  if (pwaDismiss) {
    pwaDismiss.addEventListener('click', () => {
      pwaBanner.style.display = 'none';
      localStorage.setItem('pwaDismissed', '1');
    });
  }

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

});
