const I18N = {
  'panel-title':     { zh: '下雨了 ☁️ <span class="url-sub">itisraining.com</span>', en: '下雨了 ☁️ <span class="url-sub">itisraining.com</span>' },

  'rain-speed':      { zh: '速度', en: 'Speed' },
  'static-density':  { zh: '静止密度', en: 'Static Density' },
  'rolling-density': { zh: '滚动密度', en: 'Rolling Density' },
  'static-size':     { zh: '静止大小', en: 'Static Size' },
  'rolling-size':    { zh: '滚动大小', en: 'Rolling Size' },
  'lens-refraction': { zh: '折射', en: 'Refraction' },
  'bg-blur':         { zh: '背景模糊', en: 'BG Blur' },
  'drop-blur':       { zh: '水滴模糊', en: 'Drop Blur' },
  'volume':          { zh: '音量', en: 'Volume' },
  'brush-size':      { zh: '笔触', en: 'Brush' },

  'double-layer':    { zh: '双层雨', en: 'Double Layer' },
  'magic-pen':       { zh: '画画', en: 'Draw' },

  'ai-scene':        { zh: '生成背景', en: 'AI Background' },
  'btn-clear':       { zh: '清除 Clear', en: '' },
  'btn-mute':        { zh: '静音 Mute', en: '' },
  'btn-unmute':      { zh: '播放 Unmute', en: '' },
  'btn-generate':    { zh: '生成 Gen', en: '' },
  'btn-upload':      { zh: '背景 BG', en: '' },
  'btn-export':      { zh: '导出 Export', en: '' },
};

function getLabel(key) {
  const t = I18N[key];
  if (!t) return key;
  return `${t.zh} ${t.en}`.trim();
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const t = I18N[key];
    if (!t) return;
    
    // For slider labels, we might just want to set the title (tooltip)
    if (el.classList.contains('cicon-wrap')) {
      el.title = getLabel(key);
      return;
    }

    if (el.tagName === 'H3') {
      el.innerHTML = t.zh;
    } else {
      el.textContent = getLabel(key);
    }
  });
}

applyI18n();
if (window.lucide) lucide.createIcons();

applyI18n();
if (window.lucide) lucide.createIcons();
