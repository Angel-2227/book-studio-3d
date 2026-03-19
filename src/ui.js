/**
 * ui.js  v3
 * Conecta controles HTML con la escena y el libro.
 * Añade soporte para carga de imagen de portada.
 */

;(function(global) {
  'use strict';

  class UI {
    constructor(app) {
      this.app = app;
      this._hintTimer  = null;
      this._toastTimer = null;
      this._bound      = false;
    }

    bind() {
      if (this._bound) return;
      this._bound = true;

      const app = this.app;

      // ── Apertura ──
      this._on('ctrl-open', 'input', e => {
        app.book.setOpenAngle(parseFloat(e.target.value));
      });

      // ── Grosor ──
      this._on('ctrl-thickness', 'input', e => {
        app.book.setThickness(parseFloat(e.target.value));
      });

      // ── Color tapa ──
      this._on('ctrl-cover-color', 'input', e => {
        document.getElementById('ctrl-cover-color-val').textContent = e.target.value;
        app.book.setCoverColor(e.target.value);
      });

      // ── Color papel ──
      this._on('ctrl-paper-color', 'input', e => {
        document.getElementById('ctrl-paper-color-val').textContent = e.target.value;
        app.book.setPaperColor(e.target.value);
      });

      // ── Acabado tapa ──
      this._on('ctrl-cover-finish', 'change', e => {
        app.book.setCoverFinish(e.target.value);
      });

      // ── Ambiente ──
      this._on('ctrl-env', 'change', e => {
        app.setEnvironment(e.target.value);
      });

      // ── Color fondo ──
      this._on('ctrl-bg-color', 'input', e => {
        document.getElementById('ctrl-bg-color-val').textContent = e.target.value;
        app.setBackground(e.target.value);
      });

      // ── Sombra ──
      this._on('ctrl-shadow', 'input', e => {
        app.setShadowIntensity(parseFloat(e.target.value) / 100);
      });

      // ── Luz ambiente ──
      this._on('ctrl-ambient', 'input', e => {
        app.setAmbientLight(parseFloat(e.target.value) / 100);
      });

      // ── Navegación ──
      this._on('btn-prev', 'click', () => {
        if (app.book.prevSpread()) this.updatePageIndicator();
      });
      this._on('btn-next', 'click', () => {
        if (app.book.nextSpread()) this.updatePageIndicator();
      });

      // ── Presets de cámara ──
      document.querySelectorAll('.preset-btn[data-cam]').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.preset-btn[data-cam]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          app.setCameraPreset(btn.dataset.cam);
        });
      });

      // ── Screenshot ──
      this._on('btn-screenshot', 'click', () => app.takeScreenshot());

      // ── Volver ──
      this._on('btn-back', 'click', () => {
        if (confirm('¿Volver al inicio? Se perderán los cambios.')) location.reload();
      });

      // ── Portada: subir imagen ──
      this._on('cover-image-input', 'change', e => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { this.showToast('Por favor selecciona una imagen.'); return; }

        const reader = new FileReader();
        reader.onload = ev => {
          const loader = new THREE.TextureLoader();
          loader.load(ev.target.result, tex => {
            tex.encoding = THREE.sRGBEncoding;
            tex.flipY = false; // BoxGeometry face UV no necesita flip
            app.book.setCoverTexture(tex);
            this.showToast('✓ Portada aplicada');
            const preview = document.getElementById('cover-preview');
            if (preview) { preview.style.backgroundImage = `url(${ev.target.result})`; preview.classList.add('has-img'); }
          });
        };
        reader.readAsDataURL(file);
        // Reset input para permitir reselección del mismo archivo
        e.target.value = '';
      });

      // ── Portada: quitar imagen ──
      this._on('cover-clear-btn', 'click', () => {
        app.book.clearCoverTexture();
        const preview = document.getElementById('cover-preview');
        if (preview) { preview.style.backgroundImage = ''; preview.classList.remove('has-img'); }
        this.showToast('Portada eliminada');
      });

      // ── Teclado ──
      document.addEventListener('keydown', e => {
        if (!app.loaded) return;
        if (e.key === 'ArrowRight') { app.book.nextSpread(); this.updatePageIndicator(); }
        if (e.key === 'ArrowLeft')  { app.book.prevSpread(); this.updatePageIndicator(); }
        if (e.key === 'o' || e.key === 'O') {
          const ctrl = document.getElementById('ctrl-open');
          if (!ctrl) return;
          const next = parseFloat(ctrl.value) > 10 ? 0 : 120;
          ctrl.value = next;
          app.book.setOpenAngle(next);
        }
      });

      // Ocultar hints tras 6 s
      this._hintTimer = setTimeout(() => {
        const bar = document.getElementById('hint-bar');
        if (bar) bar.classList.add('hidden');
      }, 6000);
    }

    _on(id, event, handler) {
      const el = document.getElementById(id);
      if (el) el.addEventListener(event, handler);
    }

    updatePageIndicator() {
      const el = document.getElementById('page-indicator');
      if (!el || !this.app.book) return;
      const b = this.app.book;
      const spread = b.currentSpread;
      const total  = b.totalPages;
      // páginas visibles en el spread actual
      const left  = spread * 2 + 1;
      const right = Math.min(spread * 2 + 2, total);
      el.textContent = left < right
        ? `${left}–${right} / ${total}`
        : `${left} / ${total}`;

      // Habilitar / deshabilitar botones
      const btnPrev = document.getElementById('btn-prev');
      const btnNext = document.getElementById('btn-next');
      if (btnPrev) btnPrev.disabled = spread === 0;
      if (btnNext) btnNext.disabled = spread >= b.totalSpreads() - 1;
    }

    showToast(msg, duration = 2500) {
      const toast = document.getElementById('toast');
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add('show');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
    }
  }

  global.UI = UI;

})(window);
