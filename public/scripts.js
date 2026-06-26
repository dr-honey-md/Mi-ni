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
    if (window.__soundEnabled === false) return;
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
    if (window.__soundEnabled === false) return;
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
  // 🎵 BACKGROUND LOFI MUSIC
  // ══════════════════════════════════════════════════
  (function () {
    const bgMusic       = document.getElementById('bgMusic');
    const musicBtn       = document.getElementById('musicBtn');
    const musicIcon       = document.getElementById('musicIcon');
    const musicOptions    = document.getElementById('musicOptions');
    const playPauseBtn    = document.getElementById('musicPlayPauseBtn');
    const playPauseIcon   = document.getElementById('musicPlayPauseIcon');
    const nowPlayingLabel = document.getElementById('musicNowPlaying');
    const trackChips      = document.querySelectorAll('#musicTrackPicker .chip-btn');
    const volSlider       = document.getElementById('musicVolSlider');
    const volVal          = document.getElementById('musicVolVal');
    if (!bgMusic || !musicBtn) return;

    const defaultTrack = '/music/lofi1.mp3';
    let track  = localStorage.getItem('drHoneyMusicTrack') || defaultTrack;
    let vol    = localStorage.getItem('drHoneyMusicVol');
    vol        = vol !== null ? parseFloat(vol) : 0.35;
    let wantsPlaying = localStorage.getItem('drHoneyMusicOn') === '1'; // default OFF until user opts in

    bgMusic.src = track;
    bgMusic.volume = vol;
    volSlider.value = Math.round(vol * 100);
    volVal.textContent = Math.round(vol * 100) + '%';
    trackChips.forEach(c => c.classList.toggle('active', c.dataset.track === track));

    function updateUI() {
      const playing = !bgMusic.paused;
      playPauseIcon.className = playing ? 'fas fa-pause' : 'fas fa-play';
      musicIcon.className = playing ? 'fas fa-music' : 'fas fa-volume-xmark';
      nowPlayingLabel.textContent = playing
        ? (trackChips.length ? [...trackChips].find(c => c.dataset.track === track)?.textContent || 'Playing' : 'Playing')
        : 'Off';
    }

    function startMusic() {
      bgMusic.play().then(() => {
        wantsPlaying = true;
        localStorage.setItem('drHoneyMusicOn', '1');
        updateUI();
      }).catch(() => { /* blocked until user gesture; tried again on first click below */ });
    }
    function stopMusic() {
      bgMusic.pause();
      wantsPlaying = false;
      localStorage.setItem('drHoneyMusicOn', '0');
      updateUI();
    }

    // Try to honor a previous "on" choice as soon as the browser allows audio (first user gesture)
    if (wantsPlaying) {
      const tryAutoplay = () => {
        bgMusic.play().then(updateUI).catch(() => {});
      };
      tryAutoplay();
      ['click', 'touchstart', 'keydown'].forEach(evt =>
        document.addEventListener(evt, function once() {
          if (bgMusic.paused && wantsPlaying) bgMusic.play().then(updateUI).catch(() => {});
        }, { once: true })
      );
    }
    updateUI();

    musicBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      musicOptions.classList.toggle('open');
    });
    document.addEventListener('click', () => musicOptions.classList.remove('open'));
    musicOptions.addEventListener('click', e => e.stopPropagation());

    playPauseBtn.addEventListener('click', () => {
      if (bgMusic.paused) startMusic(); else stopMusic();
    });

    trackChips.forEach(chip => {
      chip.addEventListener('click', () => {
        track = chip.dataset.track;
        trackChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        localStorage.setItem('drHoneyMusicTrack', track);
        const wasPlaying = !bgMusic.paused;
        bgMusic.src = track;
        if (wasPlaying) bgMusic.play().catch(() => {});
        updateUI();
        showToast(`Now playing: ${chip.textContent} 🎵`, 'info', 1800);
      });
    });

    volSlider.addEventListener('input', () => {
      vol = volSlider.value / 100;
      bgMusic.volume = vol;
      volVal.textContent = volSlider.value + '%';
      localStorage.setItem('drHoneyMusicVol', vol);
    });

    bgMusic.addEventListener('play', updateUI);
    bgMusic.addEventListener('pause', updateUI);
  })();

  // ══════════════════════════════════════════════════
  // 🌌 LIVE WALLPAPER ENGINE (canvas-based animated backgrounds)
  // ══════════════════════════════════════════════════
  (function () {
    const canvas = document.getElementById('wallpaperCanvas');
    const ctx = canvas.getContext('2d');
    const domParticles = document.getElementById('particles');
    let w, h, items = [], mode = 'particles', rafId = null, speedMul = 1, intensity = 0.6;

    function resize() {
      w = canvas.width  = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    function themeRGB() {
      const hex = (getComputedStyle(document.documentElement).getPropertyValue('--c-bright') || '#8b5cf6').trim();
      const m = hex.replace('#', '').match(/.{2}/g) || ['8b', '5c', 'f6'];
      return m.map(x => parseInt(x, 16));
    }

    function rand(a, b) { return a + Math.random() * (b - a); }

    function build() {
      items = [];
      const density = window.innerWidth < 600 ? 0.6 : 1;
      if (mode === 'snow') {
        for (let i = 0; i < 70 * density; i++) {
          items.push({ x: rand(0, w), y: rand(-h, h), r: rand(1.5, 4), s: rand(0.4, 1.6), drift: rand(-0.4, 0.4), a: rand(0.4, 0.9) });
        }
      } else if (mode === 'bubbles') {
        for (let i = 0; i < 28 * density; i++) {
          items.push({ x: rand(0, w), y: rand(0, h), r: rand(6, 26), s: rand(0.3, 1.1), wob: rand(0, Math.PI * 2), a: rand(0.12, 0.3) });
        }
      } else if (mode === 'stars') {
        for (let i = 0; i < 110 * density; i++) {
          items.push({ x: rand(0, w), y: rand(0, h), r: rand(0.6, 2.2), tw: rand(0, Math.PI * 2), sp: rand(0.02, 0.06) });
        }
      } else if (mode === 'matrix') {
        const cols = Math.floor(w / 18);
        for (let i = 0; i < cols; i++) {
          items.push({ x: i * 18, y: rand(-h, 0), s: rand(2, 6), len: Math.floor(rand(6, 18)) });
        }
      } else if (mode === 'waves') {
        items = [{ t: 0 }];
      } else if (mode === 'fireflies') {
        for (let i = 0; i < 32 * density; i++) {
          items.push({ x: rand(0, w), y: rand(0, h), vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), r: rand(1.5, 3), ph: rand(0, Math.PI * 2) });
        }
      } else if (mode === 'hearts') {
        for (let i = 0; i < 26 * density; i++) {
          items.push({ x: rand(0, w), y: rand(0, h) + h, r: rand(8, 18), s: rand(0.3, 1), drift: rand(-0.3, 0.3), a: rand(0.3, 0.7) });
        }
      }
    }

    const matrixChars = 'アカサタナハマヤラワ0123456789ABCDEF'.split('');

    function draw() {
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = intensity;
      const [r, g, b] = themeRGB();
      const sm = speedMul;

      if (mode === 'snow') {
        items.forEach(p => {
          p.y += p.s * sm; p.x += p.drift * sm;
          if (p.y > h) { p.y = -10; p.x = rand(0, w); }
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${p.a})`;
          ctx.fill();
        });
      } else if (mode === 'bubbles') {
        items.forEach(p => {
          p.y -= p.s * sm; p.wob += 0.02 * sm;
          p.x += Math.sin(p.wob) * 0.6;
          if (p.y < -p.r) { p.y = h + p.r; p.x = rand(0, w); }
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${r},${g},${b},${p.a})`;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        });
      } else if (mode === 'stars') {
        items.forEach(p => {
          p.tw += p.sp * sm;
          const a = 0.35 + Math.abs(Math.sin(p.tw)) * 0.65;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${a})`;
          ctx.fill();
        });
      } else if (mode === 'matrix') {
        ctx.font = '14px monospace';
        items.forEach(col => {
          col.y += col.s * sm;
          if (col.y > h + col.len * 16) col.y = rand(-h, 0);
          for (let i = 0; i < col.len; i++) {
            const cy = col.y - i * 16;
            if (cy < 0 || cy > h) continue;
            const alpha = i === 0 ? 1 : Math.max(0, 1 - i / col.len);
            ctx.fillStyle = i === 0 ? `rgba(255,255,255,${alpha})` : `rgba(${r},${g},${b},${alpha})`;
            ctx.fillText(matrixChars[Math.floor(Math.random() * matrixChars.length)], col.x, cy);
          }
        });
      } else if (mode === 'waves') {
        const t = (items[0].t += 0.012 * sm);
        for (let layer = 0; layer < 3; layer++) {
          ctx.beginPath();
          ctx.moveTo(0, h);
          const amp = 28 + layer * 14;
          const freq = 0.006 + layer * 0.002;
          const offset = h * (0.65 + layer * 0.1);
          for (let x = 0; x <= w; x += 10) {
            const y = offset + Math.sin(x * freq + t * (1 + layer * 0.4)) * amp;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h);
          ctx.closePath();
          ctx.fillStyle = `rgba(${r},${g},${b},${0.10 + layer * 0.06})`;
          ctx.fill();
        }
      } else if (mode === 'fireflies') {
        items.forEach(p => {
          p.x += p.vx * sm; p.y += p.vy * sm; p.ph += 0.05 * sm;
          if (p.x < 0 || p.x > w) p.vx *= -1;
          if (p.y < 0 || p.y > h) p.vy *= -1;
          const a = 0.3 + Math.abs(Math.sin(p.ph)) * 0.7;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,224,130,${a})`;
          ctx.shadowBlur = 8;
          ctx.shadowColor = 'rgba(255,224,130,0.8)';
          ctx.fill();
          ctx.shadowBlur = 0;
        });
      } else if (mode === 'hearts') {
        items.forEach(p => {
          p.y -= p.s * sm; p.x += p.drift * sm;
          if (p.y < -20) { p.y = h + 20; p.x = rand(0, w); }
          drawHeart(p.x, p.y, p.r, `rgba(${r},${g},${b},${p.a})`);
        });
      }
      ctx.globalAlpha = 1;
      rafId = requestAnimationFrame(draw);
    }

    function drawHeart(x, y, size, color) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(size / 16, size / 16);
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.bezierCurveTo(0, -2, -10, -2, -10, 5);
      ctx.bezierCurveTo(-10, 12, 0, 16, 0, 20);
      ctx.bezierCurveTo(0, 16, 10, 12, 10, 5);
      ctx.bezierCurveTo(10, -2, 0, -2, 0, 4);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    }

    function setMode(next) {
      mode = next;
      if (rafId) cancelAnimationFrame(rafId);
      ctx.clearRect(0, 0, w, h);
      if (domParticles) domParticles.style.display = (mode === 'particles') ? '' : 'none';
      if (mode === 'particles' || mode === 'none') return;
      build();
      draw();
    }

    function applyOrbVisuals() {
      document.querySelectorAll('.bg-orb').forEach(o => o.style.opacity = (0.45 * intensity * 1.4).toFixed(2));
      document.querySelectorAll('.particle').forEach(p => p.style.opacity = '');
      document.documentElement.style.setProperty('--orb-speed', (12 / speedMul).toFixed(2) + 's');
    }

    window.__wallpaperEngine = {
      setIntensity(v) { intensity = v; canvas.style.opacity = v; applyOrbVisuals(); },
      setSpeed(v) { speedMul = v; applyOrbVisuals(); }
    };

    const savedIntensity = parseFloat(localStorage.getItem('drHoneyBgIntensity'));
    const savedSpeed = parseFloat(localStorage.getItem('drHoneySpeed'));
    if (!isNaN(savedIntensity)) window.__wallpaperEngine.setIntensity(savedIntensity);
    if (!isNaN(savedSpeed)) window.__wallpaperEngine.setSpeed(savedSpeed);
    applyOrbVisuals();

    const wallpaperPickerBtn = document.getElementById('wallpaperPickerBtn');
    const wallpaperOptions   = document.getElementById('wallpaperOptions');
    const wallpaperSwatches  = document.querySelectorAll('.wallpaper-swatch[data-wp]');

    const savedWp = localStorage.getItem('drHoneyWallpaper') || 'particles';
    setMode(savedWp);
    wallpaperSwatches.forEach(sw => sw.classList.toggle('active', sw.dataset.wp === savedWp));

    if (wallpaperPickerBtn) {
      wallpaperPickerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        wallpaperOptions.classList.toggle('open');
      });
      document.addEventListener('click', () => wallpaperOptions.classList.remove('open'));
      wallpaperOptions.addEventListener('click', e => e.stopPropagation());
    }

    wallpaperSwatches.forEach(sw => {
      sw.addEventListener('click', () => {
        const wp = sw.dataset.wp;
        setMode(wp);
        localStorage.setItem('drHoneyWallpaper', wp);
        wallpaperSwatches.forEach(s => s.classList.toggle('active', s === sw));
        wallpaperOptions.classList.remove('open');
        showToast(`Wallpaper set to ${sw.querySelector('span').textContent}! ✨`, 'info', 2000);
      });
    });

    window.addEventListener('resize', () => { if (mode !== 'particles' && mode !== 'none') build(); });
  })();

  // ══════════════════════════════════════════════════
  // ⚙️ CUSTOMIZE SETTINGS PANEL
  // (font, card style, accent border, mascot, density, speed, bg intensity, blur, sound)
  // ══════════════════════════════════════════════════
  (function () {
    const settingsBtn      = document.getElementById('settingsBtn');
    const settingsOverlay  = document.getElementById('settingsOverlay');
    const settingsCloseBtn = document.getElementById('settingsCloseBtn');
    const settingsResetBtn = document.getElementById('settingsResetBtn');
    if (!settingsBtn) return;

    settingsBtn.addEventListener('click', () => settingsOverlay.style.display = 'flex');
    settingsCloseBtn.addEventListener('click', () => settingsOverlay.style.display = 'none');
    settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) settingsOverlay.style.display = 'none'; });

    function wireChipGroup(containerId, attr, storageKey, onSelect, defaultVal) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const chips = container.querySelectorAll('.chip-btn');
      const saved = localStorage.getItem(storageKey) || defaultVal;
      chips.forEach(c => c.classList.toggle('active', c.dataset[attr] === saved));
      onSelect(saved, true);
      chips.forEach(chip => {
        chip.addEventListener('click', () => {
          const val = chip.dataset[attr];
          chips.forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          localStorage.setItem(storageKey, val);
          onSelect(val, false);
        });
      });
    }

    // Font
    wireChipGroup('fontPicker', 'font', 'drHoneyFont', (val) => {
      document.documentElement.style.setProperty('--font-main', val);
      document.body.style.fontFamily = `${val}, sans-serif`;
    }, 'Poppins');

    // Card style
    wireChipGroup('cardStylePicker', 'card', 'drHoneyCardStyle', (val) => {
      document.body.dataset.cardstyle = val;
    }, 'glass');

    // Accent border
    wireChipGroup('accentPicker', 'accent', 'drHoneyAccent', (val) => {
      document.body.dataset.accent = val;
    }, 'solid');

    // Mascot skin
    wireChipGroup('mascotPicker', 'mascot', 'drHoneyMascot', (val) => {
      document.body.dataset.mascot = val;
    }, 'robot');

    // Layout density
    wireChipGroup('densityPicker', 'density', 'drHoneyDensity', (val) => {
      document.body.dataset.density = val;
    }, 'normal');

    // Animation speed (also drives the live wallpaper engine + orb float speed)
    wireChipGroup('speedPicker', 'speed', 'drHoneySpeed', (val) => {
      const v = parseFloat(val);
      if (window.__wallpaperEngine) window.__wallpaperEngine.setSpeed(v);
      localStorage.setItem('drHoneySpeed', v);
    }, '1');

    // Background intensity slider
    const bgSlider = document.getElementById('bgIntensitySlider');
    const bgVal    = document.getElementById('bgIntensityVal');
    const savedBg  = localStorage.getItem('drHoneyBgIntensity');
    if (bgSlider) {
      const initial = savedBg !== null ? Math.round(parseFloat(savedBg) * 100) : 60;
      bgSlider.value = initial;
      bgVal.textContent = initial + '%';
      bgSlider.addEventListener('input', () => {
        const v = bgSlider.value / 100;
        bgVal.textContent = bgSlider.value + '%';
        if (window.__wallpaperEngine) window.__wallpaperEngine.setIntensity(v);
        localStorage.setItem('drHoneyBgIntensity', v);
      });
    }

    // Glass blur slider
    const blurSlider = document.getElementById('cardBlurSlider');
    const blurVal     = document.getElementById('cardBlurVal');
    const savedBlur   = localStorage.getItem('drHoneyCardBlur');
    if (blurSlider) {
      const initial = savedBlur !== null ? parseInt(savedBlur) : 22;
      blurSlider.value = initial;
      blurVal.textContent = initial + 'px';
      document.documentElement.style.setProperty('--card-blur', initial + 'px');
      blurSlider.addEventListener('input', () => {
        blurVal.textContent = blurSlider.value + 'px';
        document.documentElement.style.setProperty('--card-blur', blurSlider.value + 'px');
        localStorage.setItem('drHoneyCardBlur', blurSlider.value);
      });
    }

    // Sound toggle
    const soundToggle = document.getElementById('soundToggle');
    if (soundToggle) {
      const savedSound = localStorage.getItem('drHoneySound');
      soundToggle.checked = savedSound === null ? true : savedSound === '1';
      window.__soundEnabled = soundToggle.checked;
      soundToggle.addEventListener('change', () => {
        window.__soundEnabled = soundToggle.checked;
        localStorage.setItem('drHoneySound', soundToggle.checked ? '1' : '0');
      });
    }

    // Reset to default
    if (settingsResetBtn) {
      settingsResetBtn.addEventListener('click', () => {
        ['drHoneyFont','drHoneyCardStyle','drHoneyAccent','drHoneyMascot','drHoneyDensity',
         'drHoneySpeed','drHoneyBgIntensity','drHoneyCardBlur','drHoneySound',
         'drHoneyWallpaper','drHoneyColor','drHoneyCustomHex',
         'drHoneyMusicTrack','drHoneyMusicVol','drHoneyMusicOn'].forEach(k => localStorage.removeItem(k));
        showToast('Settings reset! Reloading...', 'info', 1800);
        setTimeout(() => location.reload(), 600);
      });
    }
  })();

  // ══════════════════════════════════════════════════
  // 🎨 THEME COLOR PICKER (presets + custom hex)
  // ══════════════════════════════════════════════════
  const colorPickerBtn   = document.getElementById("colorPickerBtn");
  const colorOptions     = document.getElementById("colorOptions");
  const colorSwatches    = document.querySelectorAll(".color-swatch[data-color]");
  const metaThemeColor   = document.getElementById("metaThemeColor");
  const customColorInput = document.getElementById("customColorInput");

  const themeColors = {
    purple: "#6c3adb", red:    "#dc2626", blue:   "#1d4ed8",
    green:  "#059669", orange: "#ea580c", pink:   "#be185d",
    cyan:   "#0891b2", lime:   "#65a30d", amber:  "#d97706",
    rose:   "#e11d48", violet: "#7c3aed", teal:   "#0f766e"
  };

  // Derive the lighter/glow/etc. shades a custom hex needs, mirroring the preset palettes.
  function hexToRgb(hex) {
    const m = hex.replace('#','').match(/.{2}/g) || ['6c','3a','db'];
    return m.map(h => parseInt(h, 16));
  }
  function shade(hex, amt) {
    const [r,g,b] = hexToRgb(hex).map(c => Math.max(0, Math.min(255, c + amt)));
    return `#${[r,g,b].map(c => c.toString(16).padStart(2,'0')).join('')}`;
  }
  function applyCustomColor(hex) {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    document.body.dataset.theme = 'custom';
    const bright = shade(hex, 40);
    const light  = shade(hex, 100);
    const [r,g,b] = hexToRgb(hex);
    document.documentElement.style.setProperty('--c-main', hex);
    document.documentElement.style.setProperty('--c-bright', bright);
    document.documentElement.style.setProperty('--c-light', light);
    document.documentElement.style.setProperty('--c-glow', `rgba(${r},${g},${b},0.35)`);
    document.documentElement.style.setProperty('--c-glass', `rgba(${r},${g},${b},0.12)`);
    colorSwatches.forEach(sw => sw.classList.remove('active'));
    const customSwatch = document.getElementById('customSwatch');
    if (customSwatch) customSwatch.classList.add('active');
    if (metaThemeColor) metaThemeColor.content = hex;
  }

  const savedColor = localStorage.getItem('drHoneyColor') || 'purple';
  const savedCustomHex = localStorage.getItem('drHoneyCustomHex');
  if (savedColor === 'custom' && savedCustomHex) {
    applyCustomColor(savedCustomHex);
    if (customColorInput) customColorInput.value = savedCustomHex;
  } else {
    applyColor(savedColor);
  }

  colorPickerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    colorOptions.classList.toggle('open');
  });
  document.addEventListener('click', () => colorOptions.classList.remove('open'));
  colorOptions.addEventListener('click', e => e.stopPropagation());

  colorSwatches.forEach(sw => {
    sw.addEventListener('click', () => {
      const color = sw.dataset.color;
      // clear any inline custom-color overrides so the preset CSS vars take over
      ['--c-main','--c-bright','--c-light','--c-glow','--c-glass'].forEach(v =>
        document.documentElement.style.removeProperty(v)
      );
      applyColor(color);
      localStorage.setItem('drHoneyColor', color);
      localStorage.removeItem('drHoneyCustomHex');
      colorOptions.classList.remove('open');
      showToast(`Theme changed to ${color.charAt(0).toUpperCase()+color.slice(1)}! 🎨`, 'info', 2000);
    });
  });

  if (customColorInput) {
    customColorInput.addEventListener('input', () => {
      applyCustomColor(customColorInput.value);
    });
    customColorInput.addEventListener('change', () => {
      localStorage.setItem('drHoneyColor', 'custom');
      localStorage.setItem('drHoneyCustomHex', customColorInput.value);
      showToast('Custom theme color applied! 🎨', 'info', 2000);
    });
  }

  function applyColor(color) {
    document.body.dataset.theme = color;
    colorSwatches.forEach(sw => sw.classList.toggle('active', sw.dataset.color === color));
    if (metaThemeColor) metaThemeColor.content = themeColors[color] || themeColors.purple;
  }

  // ══════════════════════════════════════════════════
  // 🌙 DARK / LIGHT / AUTO MODE TOGGLE
  // ══════════════════════════════════════════════════
  const themeToggleLabel = document.getElementById('themeToggleLabel');
  const prefersDarkMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  // cycles: dark -> light -> auto -> dark ...
  const savedTheme = localStorage.getItem('drHoneyTheme') || 'dark';
  applyThemeMode(savedTheme);

  themeToggle.addEventListener('click', () => {
    const current = localStorage.getItem('drHoneyTheme') || 'dark';
    const next = current === 'dark' ? 'light' : current === 'light' ? 'auto' : 'dark';
    localStorage.setItem('drHoneyTheme', next);
    applyThemeMode(next);
    showToast(`Theme mode: ${next.charAt(0).toUpperCase()+next.slice(1)}`, 'info', 1800);
  });

  if (prefersDarkMQ) {
    prefersDarkMQ.addEventListener('change', () => {
      if ((localStorage.getItem('drHoneyTheme') || 'dark') === 'auto') applySystemTheme();
    });
  }

  function applyThemeMode(mode) {
    themeToggle.classList.toggle('auto-mode', mode === 'auto');
    if (themeToggleLabel) themeToggleLabel.textContent = mode === 'auto' ? 'AUTO' : '';
    if (mode === 'light') applyLight();
    else if (mode === 'dark') applyDark();
    else applySystemTheme(); // auto
  }
  function applySystemTheme() {
    const systemPrefersDark = prefersDarkMQ ? prefersDarkMQ.matches : true;
    if (systemPrefersDark) applyDark(); else applyLight();
  }

  function applyLight() { document.body.classList.add('light-mode');    themeIcon.className = 'fas fa-sun'; }
  function applyDark()  { document.body.classList.remove('light-mode'); themeIcon.className = 'fas fa-moon'; }

  // ══════════════════════════════════════════════════
  // 🏷️ BRANDING (bot name / tagline / logo / default theme color)
  // ══════════════════════════════════════════════════
  function applyBranding(b) {
    if (!b) return;
    const titleEl   = document.getElementById('pageTitle');
    const brandEl   = document.getElementById('brandName');
    const subEl     = document.getElementById('brandSub');
    const avatarIco = document.getElementById('botAvatarIcon');
    const avatarBox = document.getElementById('botAvatar');

    if (b.botName) {
      if (titleEl) titleEl.textContent = b.botName;
      if (brandEl) brandEl.textContent = b.botName;
      document.title = b.botName;
    }
    if (b.botTagline && subEl) subEl.textContent = b.botTagline;

    if (b.botLogoUrl) {
      if (avatarBox) {
        avatarBox.innerHTML = `<img src="${b.botLogoUrl}" alt="logo" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.style.display='none'">`;
      }
    } else if (b.botLogoIcon && avatarIco) {
      avatarIco.className = 'fas ' + b.botLogoIcon;
    }

    // Only apply the server-side default color if the visitor hasn't picked their own.
    const hasLocalColorChoice = localStorage.getItem('drHoneyColor');
    if (!hasLocalColorChoice) {
      if (b.colorPreset === 'custom' && b.themeColor) {
        applyCustomColor(b.themeColor);
      } else if (b.colorPreset && themeColors[b.colorPreset]) {
        applyColor(b.colorPreset);
      }
    }
  }

  fetch('/api/branding').then(r => r.json()).then(applyBranding).catch(() => {});

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

  // Channel gate on phone field focus — 5 minute cooldown ke saath
  phoneInput.addEventListener('focus', function() {
    // shouldShowChannelModal() index.html mein define hai — cooldown check karta hai
    var shouldShow = (typeof window.shouldShowChannelModal === 'function')
      ? window.shouldShowChannelModal()
      : !window.channelsVerified;

    if (shouldShow) {
      phoneInput.blur();
      // ch1/ch2 state + modal UI reset karo
      if (typeof ch1Joined !== 'undefined') { ch1Joined = false; ch2Joined = false; }
      var btn = document.getElementById('channelContinueBtn');
      if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.style.cursor = 'not-allowed'; btn.style.background = ''; }
      var ch1s = document.getElementById('ch1-status');
      var ch2s = document.getElementById('ch2-status');
      if (ch1s) ch1s.innerHTML = '<i class="fas fa-arrow-right" style="color:#aaa;font-size:1.1rem"></i>';
      if (ch2s) ch2s.innerHTML = '<i class="fas fa-arrow-right" style="color:#aaa;font-size:1.1rem"></i>';
      var ch1el = document.getElementById('ch1'); var ch2el = document.getElementById('ch2');
      if (ch1el) { ch1el.style.borderColor = ''; ch1el.style.background = ''; }
      if (ch2el) { ch2el.style.borderColor = ''; ch2el.style.background = ''; }
      var ctnText = document.getElementById('continueBtnText');
      var ctnIcon = document.getElementById('continueBtnIcon');
      if (ctnText) ctnText.textContent = 'Join Both Channels to Continue';
      if (ctnIcon) ctnIcon.className = 'fas fa-lock';
      var overlay = document.getElementById('channelModalOverlay');
      if (overlay) { overlay.style.animation = ''; overlay.style.display = 'flex'; }
      if (typeof showToast === 'function') showToast('Pehle dono channels join karein!', 'warning', 3000);
    }
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

  // ══════════════════════════════════════════════════
  // 🌐 MULTI-LANGUAGE SYSTEM
  // ══════════════════════════════════════════════════
  const LANGS = {
    en: {
      title:        'Connect Your WhatsApp',
      subtitle:     'Enter your number to get a pairing code',
      inputLabel:   '📱 Phone Number (with country code)',
      inputHint:    'Example: 923001234567 (no + or spaces)',
      genBtn:       '🔑 Generate Pair Code',
      step1:        'Open WhatsApp → Settings',
      step2:        'Tap Linked Devices → Link a Device',
      step3:        'Tap "Link with phone number instead"',
      step4:        'Enter the pairing code shown above',
      uptimeLabel:  '⏱️ Bot Uptime',
      usersLabel:   '👥 Total Users',
      liveLabel:    '🤖 Active Bots',
      successTitle: '🎉 Bot Connected!',
      successMsg:   'Your WhatsApp bot is now live and ready!',
      successClose: '✅ Got it!',
      pwaInstall:   '📲 Install App',
      pwaDismiss:   '✕',
      pwaText:      'Install DR-HONEY as an app for quick access!',
    },
    ur: {
      title:        'WhatsApp کنیکٹ کریں',
      subtitle:     'پیئرنگ کوڈ لینے کے لیے نمبر درج کریں',
      inputLabel:   '📱 فون نمبر (کنٹری کوڈ کے ساتھ)',
      inputHint:    'مثال: 923001234567 (بغیر + یا اسپیس)',
      genBtn:       '🔑 پیئر کوڈ حاصل کریں',
      step1:        'WhatsApp کھولیں ← Settings',
      step2:        'Linked Devices ← Link a Device',
      step3:        '"Link with phone number instead" دبائیں',
      step4:        'اوپر دکھایا گیا کوڈ درج کریں',
      uptimeLabel:  '⏱️ بوٹ اپٹائم',
      usersLabel:   '👥 کل صارفین',
      liveLabel:    '🤖 فعال بوٹس',
      successTitle: '🎉 بوٹ کنیکٹ ہوگیا!',
      successMsg:   'آپ کا واٹس ایپ بوٹ اب چالو ہے!',
      successClose: '✅ ٹھیک ہے!',
      pwaInstall:   '📲 ایپ انسٹال کریں',
      pwaDismiss:   '✕',
      pwaText:      'DR-HONEY کو ایپ کے طور پر انسٹال کریں!',
    },
    hi: {
      title:        'WhatsApp कनेक्ट करें',
      subtitle:     'पेयरिंग कोड पाने के लिए नंबर डालें',
      inputLabel:   '📱 फ़ोन नंबर (कंट्री कोड के साथ)',
      inputHint:    'उदाहरण: 923001234567 (बिना + या स्पेस)',
      genBtn:       '🔑 पेयर कोड लें',
      step1:        'WhatsApp खोलें → Settings',
      step2:        'Linked Devices → Link a Device',
      step3:        '"Link with phone number instead" दबाएं',
      step4:        'ऊपर दिखाया गया कोड डालें',
      uptimeLabel:  '⏱️ बॉट अपटाइम',
      usersLabel:   '👥 कुल यूज़र',
      liveLabel:    '🤖 एक्टिव बॉट्स',
      successTitle: '🎉 बॉट कनेक्ट हो गया!',
      successMsg:   'आपका WhatsApp बॉट अब लाइव है!',
      successClose: '✅ ठीक है!',
      pwaInstall:   '📲 ऐप इंस्टॉल करें',
      pwaDismiss:   '✕',
      pwaText:      'DR-HONEY को ऐप की तरह इंस्टॉल करें!',
    }
  };

  let currentLang = localStorage.getItem('drHoneyLang') || 'en';

  function applyLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('drHoneyLang', lang);
    const t = LANGS[lang] || LANGS.en;

    // Brand subtitle
    const brandSub = document.getElementById('brandSub');
    if (brandSub) brandSub.textContent = t.subtitle;

    // Input label
    const inputLabelEl = document.getElementById('inputLabel');
    if (inputLabelEl) inputLabelEl.innerHTML = t.inputLabel;

    // Input hint
    const inputHintEl = document.getElementById('inputHint');
    if (inputHintEl) inputHintEl.textContent = t.inputHint;

    // Gen button
    const genBtn = document.getElementById('requestPairing');
    if (genBtn && !genBtn.disabled) genBtn.innerHTML = '<i class="fas fa-key"></i> ' + t.genBtn.replace(/^🔑 /, '');

    // Steps
    const stepTexts = document.querySelectorAll('.step-text');
    const stepKeys = ['step1','step2','step3','step4'];
    stepTexts.forEach((el, i) => { if (stepKeys[i]) el.textContent = t[stepKeys[i]]; });

    // Stats labels
    const uptimeLbl = document.getElementById('uptimeLabel');
    if (uptimeLbl) uptimeLbl.textContent = t.uptimeLabel;
    const usersLbl = document.getElementById('usersLabel');
    if (usersLbl) usersLbl.textContent = t.usersLabel;
    const liveLbl = document.getElementById('liveLabel');
    if (liveLbl) liveLbl.textContent = t.liveLabel;

    // Success overlay
    const sTitle = document.getElementById('successTitle');
    const sMsg   = document.getElementById('successMsg');
    const sClose = document.getElementById('successCloseBtn');
    if (sTitle) sTitle.textContent = t.successTitle;
    if (sMsg)   sMsg.textContent   = t.successMsg;
    if (sClose) sClose.textContent = t.successClose;

    // PWA banner
    const pwaText = document.getElementById('pwaText');
    const pwaInst = document.getElementById('pwaInstallBtn');
    const pwaDis  = document.getElementById('pwaDismiss');
    if (pwaText) pwaText.textContent = t.pwaText;
    if (pwaInst) pwaInst.textContent = t.pwaInstall;
    if (pwaDis)  pwaDis.textContent  = t.pwaDismiss;

    // Active lang button highlight
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });
  }

  // Language toggle buttons
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyLanguage(btn.dataset.lang);
      showToast('Language changed! 🌐', 'info', 1800);
    });
  });

  // Apply saved language on load
  applyLanguage(currentLang);

  // ══════════════════════════════════════════════════
  // ⏱️ BOT UPTIME LIVE TIMER
  // ══════════════════════════════════════════════════
  let _uptimeBase = 0; // seconds at page load
  let _uptimeStart = Date.now();

  function formatUptime(sec) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  }

  function updateUptimeDisplay() {
    const elapsed = Math.floor((Date.now() - _uptimeStart) / 1000);
    const total   = _uptimeBase + elapsed;
    const el = document.getElementById('uptimeValue');
    if (el) el.textContent = formatUptime(total);
  }

  // Fetch base uptime from server
  fetch('/api/uptime').then(r => r.json()).then(d => {
    _uptimeBase  = d.uptimeSeconds || 0;
    _uptimeStart = Date.now();
    updateUptimeDisplay();
  }).catch(() => {});

  // Tick every second
  setInterval(updateUptimeDisplay, 1000);

  // ══════════════════════════════════════════════════
  // 🖼️ CUSTOM LOGO UPLOAD (via branding API)
  // ══════════════════════════════════════════════════
  const logoUploadInput = document.getElementById('logoUploadInput');
  if (logoUploadInput) {
    logoUploadInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { showToast('Image too large! Max 2MB.', 'error'); return; }

      const reader = new FileReader();
      reader.onload = async (ev) => {
        const imageData = ev.target.result; // base64 data URL
        const adminPass = localStorage.getItem('drHoneyAdminPass') || prompt('Admin password:');
        if (!adminPass) return;
        localStorage.setItem('drHoneyAdminPass', adminPass);

        try {
          const res = await fetch('/api/admin/upload-logo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-pass': adminPass },
            body: JSON.stringify({ imageData })
          });
          const data = await res.json();
          if (data.ok) {
            // Update avatar live
            const avatarBox = document.getElementById('botAvatar');
            if (avatarBox) avatarBox.innerHTML = `<img src="${data.logoUrl}?t=${Date.now()}" alt="logo" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
            showToast('Logo updated! 🎨', 'success');
          } else {
            showToast(data.error || 'Upload failed', 'error');
          }
        } catch (err) {
          showToast('Upload error: ' + err.message, 'error');
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // ══════════════════════════════════════════════════
  // 🎊 ANIMATED SUCCESS SCREEN (enhanced)
  // ══════════════════════════════════════════════════
  function showSuccessScreen(sessionId) {
    const t = LANGS[currentLang] || LANGS.en;
    const sTitle = document.getElementById('successTitle');
    const sMsg   = document.getElementById('successMsg');
    const sClose = document.getElementById('successCloseBtn');
    const sId    = document.getElementById('successSessionId');

    if (sTitle) sTitle.textContent = t.successTitle;
    if (sMsg)   sMsg.textContent   = t.successMsg;
    if (sClose) sClose.textContent = t.successClose;
    if (sId)    sId.textContent    = sessionId ? ('Session: ' + sessionId) : '';

    // Animated checkmark
    const iconEl = document.getElementById('successIcon');
    if (iconEl) {
      iconEl.textContent = '';
      iconEl.style.animation = 'none';
      void iconEl.offsetWidth;
      // Draw SVG check with stroke animation
      iconEl.innerHTML = `
        <svg width="90" height="90" viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="45" cy="45" r="42" stroke="#10b981" stroke-width="4" fill="rgba(16,185,129,0.1)"
            style="animation:circleGrow 0.5s ease forwards;stroke-dasharray:264;stroke-dashoffset:264"/>
          <polyline points="25,47 38,60 65,30" stroke="#10b981" stroke-width="5" stroke-linecap="round"
            stroke-linejoin="round" fill="none"
            style="animation:checkDraw 0.5s ease 0.4s forwards;stroke-dasharray:80;stroke-dashoffset:80"/>
        </svg>`;
    }

    // Fireworks effect using confetti if available
    successOverlay.style.display = 'flex';
    successOverlay.style.animation = 'overlayIn 0.3s ease';

    launchConfetti();
    playSuccessSound();

    // Shake card briefly
    const card = successOverlay.querySelector('.success-card');
    if (card) {
      card.style.animation = 'successCardIn 0.5s cubic-bezier(0.34,1.56,0.64,1)';
    }
  }

  successCloseBtn.addEventListener('click', () => {
    successOverlay.style.animation = 'overlayOut 0.3s ease forwards';
    setTimeout(() => { successOverlay.style.display = 'none'; }, 300);
  });

  // Confirm Connected button
  const successConfirmBtn = document.getElementById('successConfirmBtn');
  if (successConfirmBtn) {
    successConfirmBtn.addEventListener('click', () => {
      // Visual feedback
      successConfirmBtn.innerHTML = '<i class="fas fa-check-circle"></i> Connected! 🎉';
      successConfirmBtn.style.background = 'linear-gradient(135deg,#059669,#10b981)';
      successConfirmBtn.disabled = true;
      playSuccessSound();
      launchConfetti();
      setTimeout(() => {
        successOverlay.style.animation = 'overlayOut 0.3s ease forwards';
        setTimeout(() => { successOverlay.style.display = 'none'; showRateModal(); }, 300);
      }, 1200);
    });
  }

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
    // Show rate modal after 3 seconds
    setTimeout(() => showRateModal(), 3000);
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

  socket.on("statsUpdate", ({ activeSockets, activeBots, totalUniqueNumbers, totalBotLinks, totalUsers, msgToday, msgWeek, banned, ipBans }) => {
    // Total Users box = unique phone numbers jo pair ho chuke hain
    animateTo(document.getElementById("totalUsers"),  totalUniqueNumbers ?? totalUsers ?? 0);
    // Active Bots box = bot kitni baar linked hua (ever)
    animateTo(document.getElementById("activeCount"), totalBotLinks ?? activeSockets ?? 0);
    // status dot: activeConnections.size use karo (activeBots) — sahi count
    const liveCount = activeBots != null ? activeBots : activeSockets;
    updateBotStatus(liveCount > 0, liveCount);

    // ── LIVE STATS: Msgs Today / Msgs This Week / Banned / IP Bans ──────────
    // Yeh values har command run pe server se aati hain — real-time update karo
    const msgsT = document.getElementById("msgsToday");
    const msgsW = document.getElementById("msgsWeek");
    const bannedEl = document.getElementById("bannedCount");
    const ipBanEl = document.getElementById("ipBanCount");
    if (msgsT && msgToday != null) animateTo(msgsT, msgToday);
    if (msgsW && msgWeek  != null) animateTo(msgsW, msgWeek);
    if (bannedEl && banned  != null) animateTo(bannedEl, banned);
    if (ipBanEl  && ipBans  != null) animateTo(ipBanEl,  ipBans);
  });

  // ══════════════════════════════════════════════════
  // 📱 PWA — IMPROVED (Android prompt + iOS manual + desktop)
  // ══════════════════════════════════════════════════
  let deferredPrompt = null;
  const pwaBanner     = document.getElementById('pwaBanner');
  const pwaInstallBtn = document.getElementById('pwaInstallBtn');
  const pwaDismiss    = document.getElementById('pwaDismiss');
  const pwaManualBtn  = document.getElementById('pwaManualBtn'); // optional manual trigger

  // Detect iOS (no beforeinstallprompt support)
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

  function showPwaBanner() {
    if (isInStandaloneMode) return; // already installed
    if (localStorage.getItem('pwaDismissed')) return;
    if (pwaBanner) { pwaBanner.style.display = 'flex'; }
  }
  // Show PWA banner after 2s on all browsers (not just on beforeinstallprompt)
  setTimeout(showPwaBanner, 2000);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showPwaBanner();
  });

  // Show iOS install tip if no prompt fires after 3s
  if (isIOS && !isInStandaloneMode) {
    setTimeout(() => {
      if (!localStorage.getItem('pwaDismissed')) {
        const iosBanner = document.getElementById('iosBanner');
        if (iosBanner) iosBanner.style.display = 'flex';
      }
    }, 3000);
  }

  if (pwaInstallBtn) {
    pwaInstallBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        if (pwaBanner) pwaBanner.style.display = 'none';
        showToast(outcome === 'accepted' ? '🎉 App installed successfully!' : 'Maybe next time!',
                  outcome === 'accepted' ? 'success' : 'info');
        if (outcome === 'accepted') playSuccessSound();
      } else if (isIOS) {
        // iOS: show instructions toast
        showToast('📲 Tap Share → "Add to Home Screen" to install!', 'info', 5000);
      }
    });
  }

  if (pwaManualBtn) {
    pwaManualBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        showToast(outcome === 'accepted' ? '🎉 App installed!' : 'Install cancelled', outcome === 'accepted' ? 'success' : 'info');
      } else if (isIOS) {
        showToast('📲 iOS: Tap Share → "Add to Home Screen"', 'info', 5000);
      } else if (isInStandaloneMode) {
        showToast('✅ Already installed as app!', 'info');
      } else {
        showToast('ℹ️ Install option not available on this browser yet.', 'info', 4000);
      }
    });
  }

  if (pwaDismiss) {
    pwaDismiss.addEventListener('click', () => {
      if (pwaBanner)  pwaBanner.style.display  = 'none';
      const iosBanner = document.getElementById('iosBanner');
      if (iosBanner)  iosBanner.style.display  = 'none';
      localStorage.setItem('pwaDismissed', '1');
    });
  }

  // appinstalled event
  window.addEventListener('appinstalled', () => {
    showToast('✅ App installed successfully!', 'success', 4000);
    if (pwaBanner) pwaBanner.style.display = 'none';
    playSuccessSound();
  });

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // ══════════════════════════════════════════════════
  // 🤖 MASCOT SYSTEM
  // ══════════════════════════════════════════════════
  const mascotWrap   = document.getElementById('mascotWrap');
  const mascotBubble = document.getElementById('mascotBubble');
  const mascotMsg    = document.getElementById('mascotMsg');
  const mascotMouth  = document.getElementById('mascotMouth');

  const mascotMsgs = {
    idle:    "👋 Assalam o Alaikum! Number enter karein aur pair code hasil karein!",
    typing:  "✍️ Number likh rahe hain? Country code mat bhulaen!",
    loading: "⏳ Pair code aa raha hai... thoda sabr karein!",
    success: "🎉 Mubarak ho! Bot successfully connect ho gaya!",
    error:   "😓 Koi masla aaya! Number check karein aur dobara try karein.",
    copy:    "📋 Code copy ho gaya! Ab WhatsApp mein paste karein.",
  };

  let mascotVisible = false;
  let mascotTimeout;

  function showMascot(state = 'idle', duration = 5000) {
    mascotMsg.textContent = mascotMsgs[state] || mascotMsgs.idle;
    mascotBubble.classList.add('show');
    mascotVisible = true;
    if (state === 'error') mascotMouth.textContent = '😟';
    else if (state === 'success') mascotMouth.textContent = '😄';
    else if (state === 'loading') mascotMouth.textContent = '😐';
    else mascotMouth.textContent = '😊';
    clearTimeout(mascotTimeout);
    if (duration > 0) {
      mascotTimeout = setTimeout(() => {
        mascotBubble.classList.remove('show');
        mascotMouth.textContent = '😊';
      }, duration);
    }
  }

  // Show mascot on page load
  setTimeout(() => showMascot('idle', 6000), 1500);

  // Mascot click toggle
  mascotWrap.addEventListener('click', () => {
    if (mascotBubble.classList.contains('show')) {
      mascotBubble.classList.remove('show');
    } else {
      showMascot('idle', 5000);
    }
  });

  // Phone input — mascot reacts
  phoneInput.addEventListener('input', () => {
    if (phoneInput.value.length > 2) showMascot('typing', 3000);
  });

  // ══════════════════════════════════════════════════
  // 🔊 ERROR SOUND
  // ══════════════════════════════════════════════════
  function playErrorSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Descending sad beeps
      const notes = [400, 300, 200];
      notes.forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.15;
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.start(t);
        osc.stop(t + 0.2);
      });
    } catch(e) {}
  }

  // Patch showToast to play error sound
  const _origShowToast = showToast;

  // Hook into error events from requestPairing button
  const _origBtn = requestPairingBtn.addEventListener.bind(requestPairingBtn);

  // Override: intercept errors via MutationObserver on statusEl
  const statusObserver = new MutationObserver(() => {
    const html = statusEl.innerHTML;
    if (html.includes('❌') || html.includes('ef4444')) {
      playErrorSound();
      showMascot('error', 5000);
    } else if (html.includes('✅') || html.includes('10b981')) {
      showMascot('success', 6000);
    } else if (html.includes('spinner') || html.includes('Requesting')) {
      showMascot('loading', 0);
    }
  });
  statusObserver.observe(statusEl, { childList: true, subtree: true, characterData: true });

  // ══════════════════════════════════════════════════
  // ⭐ RATE US SYSTEM
  // ══════════════════════════════════════════════════
  const rateOverlay    = document.getElementById('rateOverlay');
  const starRow        = document.getElementById('starRow');
  const rateMsg        = document.getElementById('rateMsg');
  const rateSubmitBtn  = document.getElementById('rateSubmitBtn');
  const rateSkipBtn    = document.getElementById('rateSkipBtn');
  const stars          = document.querySelectorAll('.star');

  const rateMsgs = ['', '😕 Bohat bura laga...', '😐 Theek tha', '🙂 Acha tha!', '😊 Bohat acha!', '🔥 Zabardast! Shukriya!'];
  let selectedRating = 0;

  stars.forEach(star => {
    star.addEventListener('click', () => {
      selectedRating = parseInt(star.dataset.val);
      stars.forEach((s, i) => {
        s.classList.toggle('active', i < selectedRating);
      });
      star.classList.add('pop');
      setTimeout(() => star.classList.remove('pop'), 300);
      rateMsg.textContent = rateMsgs[selectedRating] || '';
      rateSubmitBtn.disabled = false;
    });
    star.addEventListener('mouseover', () => {
      const val = parseInt(star.dataset.val);
      stars.forEach((s, i) => s.style.filter = i < val ? 'grayscale(0) opacity(1)' : 'grayscale(1) opacity(0.4)');
    });
    star.addEventListener('mouseout', () => {
      stars.forEach((s, i) => s.style.filter = i < selectedRating ? 'grayscale(0) opacity(1)' : 'grayscale(1) opacity(0.4)');
    });
  });

  rateSubmitBtn.addEventListener('click', async () => {
    if (!selectedRating) return;
    rateOverlay.style.animation = 'overlayOut 0.4s ease forwards';
    setTimeout(() => { rateOverlay.style.display = 'none'; }, 400);
    showToast(`Shukriya! Aapne ${selectedRating} ⭐ diye! 🎉`, 'success', 4000);
    showMascot('success', 5000);
    playSuccessSound();
    // Save rating to server
    try {
      await fetch('/api/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: selectedRating, ts: Date.now() })
      });
    } catch(e) { /* silent fail */ }
  });

  rateSkipBtn.addEventListener('click', () => {
    rateOverlay.style.animation = 'overlayOut 0.4s ease forwards';
    setTimeout(() => { rateOverlay.style.display = 'none'; }, 400);
  });

  function showRateModal() {
    if (localStorage.getItem('drHoneyRated')) return;
    rateOverlay.style.display = 'flex';
    rateOverlay.style.animation = 'overlayIn 0.3s ease';
    localStorage.setItem('drHoneyRated', '1');
  }

  // Show rate modal after successful pairing
  const _origLinked = socket.on.bind(socket);

});
