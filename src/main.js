/**
 * main.js  v2
 *
 * - Three.js renderer con sombras PCFSoft
 * - OrbitControls implementado manualmente (r128 CDN no incluye módulos)
 * - Luces de estudio (key + fill + rim)
 * - Plano de suelo receptor de sombras
 * - Carga de PDF → Book3D
 */

;(function() {
  'use strict';

  // ─────────────────────────────────────────────────
  //  OrbitControls (implementación propia para r128)
  // ─────────────────────────────────────────────────
  class OrbitControls {
    constructor(camera, domElement) {
      this.camera     = camera;
      this.domElement = domElement;
      this.target     = new THREE.Vector3(0, 0, 0);

      this.enableDamping = true;
      this.dampingFactor = 0.07;
      this.minDistance   = 1.2;
      this.maxDistance   = 14;
      this.minPolarAngle = 0.05;
      this.maxPolarAngle = Math.PI * 0.88;

      this._sph   = new THREE.Spherical();
      this._dSph  = new THREE.Spherical(0, 0, 0);
      this._scale = 1;
      this._pan   = new THREE.Vector3();

      this._mouse = { down: false, pan: false, x: 0, y: 0 };
      this._touches = [];

      this._init();

      const offset = new THREE.Vector3().subVectors(camera.position, this.target);
      this._sph.setFromVector3(offset);
    }

    _init() {
      const el = this.domElement;
      el.addEventListener('contextmenu', e => e.preventDefault());
      el.addEventListener('mousedown',   e => this._mDown(e));
      el.addEventListener('mousemove',   e => this._mMove(e));
      window.addEventListener('mouseup', ()  => this._mUp());
      el.addEventListener('wheel',       e => this._wheel(e), { passive: false });
      el.addEventListener('touchstart',  e => this._tStart(e), { passive: false });
      el.addEventListener('touchmove',   e => this._tMove(e),  { passive: false });
      el.addEventListener('touchend',    ()  => this._mUp());
    }

    _mDown(e) {
      e.preventDefault();
      this._mouse.down = true;
      this._mouse.pan  = (e.button === 2 || e.shiftKey);
      this._mouse.x    = e.clientX;
      this._mouse.y    = e.clientY;
    }

    _mMove(e) {
      if (!this._mouse.down) return;
      const dx = e.clientX - this._mouse.x;
      const dy = e.clientY - this._mouse.y;
      this._mouse.x = e.clientX;
      this._mouse.y = e.clientY;
      this._mouse.pan ? this._doPan(dx, dy) : this._doRotate(dx, dy);
    }

    _mUp() { this._mouse.down = false; }

    _wheel(e) {
      e.preventDefault();
      this._scale *= e.deltaY > 0 ? 1.10 : 0.91;
    }

    _tStart(e) {
      e.preventDefault();
      this._touches = Array.from(e.touches);
      if (e.touches.length === 1) {
        this._mouse.down = true;
        this._mouse.pan  = false;
        this._mouse.x    = e.touches[0].clientX;
        this._mouse.y    = e.touches[0].clientY;
      }
    }

    _tMove(e) {
      e.preventDefault();
      if (e.touches.length === 1 && this._mouse.down) {
        const dx = e.touches[0].clientX - this._mouse.x;
        const dy = e.touches[0].clientY - this._mouse.y;
        this._mouse.x = e.touches[0].clientX;
        this._mouse.y = e.touches[0].clientY;
        this._doRotate(dx, dy);
      } else if (e.touches.length === 2 && this._touches.length === 2) {
        const prev = Math.hypot(
          this._touches[0].clientX - this._touches[1].clientX,
          this._touches[0].clientY - this._touches[1].clientY);
        const curr = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
        this._scale *= prev / curr;
        this._touches = Array.from(e.touches);
      }
    }

    _doRotate(dx, dy) {
      const el = this.domElement;
      this._dSph.theta -= (2 * Math.PI * dx) / el.clientWidth  * 0.7;
      this._dSph.phi   -= (2 * Math.PI * dy) / el.clientHeight * 0.7;
    }

    _doPan(dx, dy) {
      const el   = this.domElement;
      const dist = this.camera.position.distanceTo(this.target);
      const fov  = THREE.MathUtils.degToRad(this.camera.fov);
      const h    = 2 * Math.tan(fov / 2) * dist;
      const w    = h * (el.clientWidth / el.clientHeight);

      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
      const up    = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
      right.multiplyScalar(-(dx / el.clientWidth)  * w);
      up.multiplyScalar   ( (dy / el.clientHeight) * h);
      this._pan.add(right).add(up);
    }

    update() {
      const pos    = this.camera.position;
      const offset = new THREE.Vector3().subVectors(pos, this.target);
      this._sph.setFromVector3(offset);

      const df = this.dampingFactor;

      this._sph.theta  += this._dSph.theta * df;
      this._sph.phi    += this._dSph.phi   * df;
      this._dSph.theta *= (1 - df);
      this._dSph.phi   *= (1 - df);

      this._sph.radius *= 1 + (this._scale - 1) * df;
      this._scale       = 1 + (this._scale - 1) * (1 - df);

      this.target.addScaledVector(this._pan, df);
      this._pan.multiplyScalar(1 - df);

      this._sph.phi    = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this._sph.phi));
      this._sph.radius = Math.max(this.minDistance,   Math.min(this.maxDistance,   this._sph.radius));
      this._sph.makeSafe();

      offset.setFromSpherical(this._sph);
      pos.copy(this.target).add(offset);
      this.camera.lookAt(this.target);
    }
  }

  // ─────────────────────────────────────────────────
  //  App
  // ─────────────────────────────────────────────────
  class App {
    constructor() {
      this.loaded   = false;
      this.book     = null;
      this.ui       = null;
      this._animId  = null;
    }

    // ── Three.js ──────────────────────────────────────
    initScene() {
      const canvas = document.getElementById('gl-canvas');

      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
      this.renderer.outputEncoding    = THREE.sRGBEncoding;
      this.renderer.toneMapping       = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.1;
      this.renderer.physicallyCorrectLights = true;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0xe8e4dd);

      // Cámara
      this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.01, 100);
      this.camera.position.set(1.5, 1.2, 6);

      // Controles
      this.controls = new OrbitControls(this.camera, canvas);

      // Luces
      this._setupLights();

      // Suelo con sombra
      const floorGeo = new THREE.PlaneGeometry(60, 60);
      const floorMat = new THREE.ShadowMaterial({ opacity: 0.32 });
      this._floor = new THREE.Mesh(floorGeo, floorMat);
      this._floor.rotation.x = -Math.PI / 2;
      // El suelo va justo bajo el libro; se ajusta cuando el libro se construya
      this._floor.position.y = -1.08;
      this._floor.receiveShadow = true;
      this.scene.add(this._floor);

      // Resize
      window.addEventListener('resize', () => this._onResize());

      // Libro
      this.book = new Book3D(this.scene, this.renderer);

      // UI
      this.ui = new UI(this);
    }

    _setupLights() {
      // Ambiente
      this._ambientLight = new THREE.AmbientLight(0xfff8f0, 0.65);
      this.scene.add(this._ambientLight);

      // Key light (arriba-derecha-frente)
      this._keyLight = new THREE.DirectionalLight(0xfffaf0, 2.8);
      this._keyLight.position.set(5, 9, 6);
      this._keyLight.castShadow = true;
      this._keyLight.shadow.mapSize.width  = 2048;
      this._keyLight.shadow.mapSize.height = 2048;
      this._keyLight.shadow.camera.near   = 0.5;
      this._keyLight.shadow.camera.far    = 30;
      this._keyLight.shadow.camera.left   = -6;
      this._keyLight.shadow.camera.right  =  6;
      this._keyLight.shadow.camera.top    =  6;
      this._keyLight.shadow.camera.bottom = -6;
      this._keyLight.shadow.bias   = -0.0004;
      this._keyLight.shadow.radius = 4;
      this.scene.add(this._keyLight);

      // Fill (izquierda-abajo, suave)
      this._fillLight = new THREE.DirectionalLight(0xd8eaff, 0.55);
      this._fillLight.position.set(-4, 1, 4);
      this.scene.add(this._fillLight);

      // Rim (atrás, contraluz)
      this._rimLight = new THREE.DirectionalLight(0xfff0e0, 0.35);
      this._rimLight.position.set(0, 3, -7);
      this.scene.add(this._rimLight);
    }

    startLoop() {
      const tick = () => {
        this._animId = requestAnimationFrame(tick);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
      };
      tick();
    }

    _onResize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    }

    // ── Entornos de luz ───────────────────────────────
    setEnvironment(type) {
      const envs = {
        studio:  { amb: [0xfff8f0, 0.65], key: [0xfffaf0, 2.8], bg: 0xe8e4dd, floorOp: 0.32 },
        natural: { amb: [0xd0f0e0, 0.80], key: [0xffffff, 2.2], bg: 0xc0d4dc, floorOp: 0.28 },
        dark:    { amb: [0x181820, 0.25], key: [0xfff0cc, 4.0], bg: 0x0e0e14, floorOp: 0.65 },
        warm:    { amb: [0xffe4b0, 0.90], key: [0xffd060, 3.0], bg: 0xf0dab8, floorOp: 0.30 },
      };
      const e = envs[type] || envs.studio;
      this._ambientLight.color.setHex(e.amb[0]);
      this._ambientLight.intensity = e.amb[1];
      this._keyLight.color.setHex(e.key[0]);
      this._keyLight.intensity = e.key[1];
      this.scene.background = new THREE.Color(e.bg);
      this._floor.material.opacity = e.floorOp;

      const hex = '#' + new THREE.Color(e.bg).getHexString();
      const picker = document.getElementById('ctrl-bg-color');
      const label  = document.getElementById('ctrl-bg-color-val');
      if (picker) picker.value = hex;
      if (label)  label.textContent = hex;
    }

    setBackground(hexStr) {
      this.scene.background = new THREE.Color(hexStr);
    }

    setShadowIntensity(v) {
      this._floor.material.opacity = v * 0.65;
    }

    setAmbientLight(v) {
      this._ambientLight.intensity = v * 1.5;
    }

    // ── Presets de cámara ────────────────────────────
    setCameraPreset(name) {
      // Centro del libro = (pageW/2, 0, 0) aprox
      const cx = this.book ? this.book.params.pageW / 2 : 0.74;
      const cy = 0;
      const cz = 0;

      const presets = {
        front:          [cx,      cy + 0.1, 6.0],
        side:           [cx + 5,  cy + 0.3, 0.2],
        top:            [cx,      6.0,      0.01],
        iso:            [cx + 2.8, cy + 2.2, 4.5],
        'three-quarter':[cx + 1.5, cy + 1.5, 5.0],
        spine:          [-2.5,    cy + 0.3, 0.2],
      };
      const pos = presets[name] || presets['three-quarter'];
      this._animCamTo(
        new THREE.Vector3(...pos),
        new THREE.Vector3(cx, cy, cz)
      );
    }

    _animCamTo(toPos, toTarget) {
      const fromPos    = this.camera.position.clone();
      const fromTarget = this.controls.target.clone();
      const t0 = performance.now();
      const dur = 750;

      const step = () => {
        const t = Math.min((performance.now() - t0) / dur, 1);
        const e = 1 - Math.pow(1 - t, 3);
        this.camera.position.lerpVectors(fromPos,    toPos,    e);
        this.controls.target.lerpVectors(fromTarget, toTarget, e);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    // ── Screenshot ───────────────────────────────────
    takeScreenshot() {
      this.renderer.render(this.scene, this.camera);
      const url = this.renderer.domElement.toDataURL('image/png');
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `book-studio-${Date.now()}.png`;
      a.click();
      this.ui.showToast('📷 Imagen guardada');
    }

    // ── Cargar PDF ───────────────────────────────────
    async loadPDF(file) {
      this._showScreen('loading-screen');

      try {
        const buffer = await file.arrayBuffer();

        const result = await PDFLoader.loadPDFFromBuffer(buffer, (loaded, total, label) => {
          const fill = document.getElementById('loading-fill');
          const lbl  = document.getElementById('loading-label');
          if (fill) fill.style.width = `${Math.round(loaded / total * 100)}%`;
          if (lbl)  lbl.textContent  = label;
        });

        document.getElementById('loading-label').textContent = 'Construyendo libro 3D…';

        const maxAni  = this.renderer.capabilities.getMaxAnisotropy();
        const textures = await Promise.all(
          result.pages.map(async dataURL => {
            const tex = await PDFLoader.createTexture(dataURL);
            tex.anisotropy = maxAni;
            return tex;
          })
        );

        // ── Construir libro ──
        this.book.build(textures);
        this.book.setOpenAngle(0);    // comenzar cerrado
        this.book.showSpread(0);

        // ── Ajustar suelo ──
        const p = this.book.params;
        this._floor.position.y = -p.pageH / 2 - 0.01;

        // ── Actualizar slider a 0 ──
        const ctrlOpen = document.getElementById('ctrl-open');
        if (ctrlOpen) ctrlOpen.value = 0;

        // ── Título ──
        const titleEl = document.getElementById('book-title');
        if (titleEl) titleEl.textContent = result.title || file.name.replace(/\.pdf$/i, '');

        // ── Mostrar viewer ──
        this._showScreen('viewer-screen');
        this.ui.updatePageIndicator();
        this.ui.bind();

        // ── Cámara inicial ──
        this.setCameraPreset('three-quarter');

        this.loaded = true;

      } catch (err) {
        console.error(err);
        alert('Error al cargar el PDF:\n' + err.message);
        this._showScreen('upload-screen');
      }
    }

    _showScreen(id) {
      document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
      });
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = (id === 'viewer-screen') ? 'block' : 'flex';
      requestAnimationFrame(() => el.classList.add('active'));
    }
  }

  // ─────────────────────────────────────────────────
  //  Bootstrap
  // ─────────────────────────────────────────────────
  const app = new App();
  app.initScene();
  app.startLoop();

  // Drop zone
  const dropZone  = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('over'); });
  dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('over');
    const f = e.dataTransfer.files[0];
    if (f && (f.type === 'application/pdf' || f.name.endsWith('.pdf'))) app.loadPDF(f);
    else alert('Por favor, selecciona un archivo PDF.');
  });

  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => { if (e.target.files[0]) app.loadPDF(e.target.files[0]); });

  // Pantalla inicial
  const up = document.getElementById('upload-screen');
  up.style.display = 'flex';
  requestAnimationFrame(() => up.classList.add('active'));

  // Keyboard
  document.addEventListener('keydown', e => {
    if (!app.loaded) return;
    if (e.key === 'ArrowRight') { app.book.nextSpread(); app.ui.updatePageIndicator(); }
    if (e.key === 'ArrowLeft')  { app.book.prevSpread(); app.ui.updatePageIndicator(); }
    if (e.key === 'o' || e.key === 'O') {
      const ctrl = document.getElementById('ctrl-open');
      if (!ctrl) return;
      const next = parseInt(ctrl.value) > 10 ? 0 : 120;
      ctrl.value = next;
      app.book.setOpenAngle(next);
    }
  });

  window._app = app;

})();
