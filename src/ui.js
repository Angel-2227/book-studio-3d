/**
 * ui.js
 * Conecta los controles HTML con la escena Three.js y el libro.
 */

;(function(global) {
  'use strict';

  class UI {
    constructor(app) {
      this.app = app; // referencia a la app principal
      this._hintTimer = null;
      this._bound = false;
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

      // ── Navegación de páginas ──
      this._on('btn-prev', 'click', () => {
        if (app.book.prevSpread()) this.updatePageIndicator();
      });
      this._on('btn-next', 'click', () => {
        if (app.book.nextSpread()) this.updatePageIndicator();
      });

      // ── Presets de cámara ──
      document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          app.setCameraPreset(btn.dataset.cam);
        });
      });

      // ── Screenshot ──
      this._on('btn-screenshot', 'click', () => app.takeScreenshot());

      // ── Volver ──
      this._on('btn-back', 'click', () => {
        if (confirm('¿Volver al inicio? Perderás los cambios no guardados.')) {
          location.reload();
        }
      });

      // ── Teclado ──
      document.addEventListener('keydown', e => {
        if (!app.loaded) return;
        if (e.key === 'ArrowRight') { app.book.nextSpread(); this.updatePageIndicator(); }
        if (e.key === 'ArrowLeft')  { app.book.prevSpread(); this.updatePageIndicator(); }
        if (e.key === 'o' || e.key === 'O') {
          const ctrl = document.getElementById('ctrl-open');
          const val = parseInt(ctrl.value);
          ctrl.value = val > 10 ? 0 : 70;
          app.book.setOpenAngle(parseInt(ctrl.value));
        }
      });

      // Ocultar hint bar tras 6s
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
      const from = b.currentSpread * 2 + 1;
      const to = Math.min(from + 1, b.pageTextures.length);
      el.textContent = `${from}–${to} / ${b.pageTextures.length}`;
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
