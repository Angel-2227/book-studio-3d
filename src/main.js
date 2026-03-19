/**
 * main.js
 * Punto de entrada: configura el renderer Three.js, la escena,
 * las luces, el control orbital, y gestiona la carga del PDF.
 */

;(function() {
  'use strict';

  // ─────────────────────────────────────────
  // OrbitControls mínimo (implementado manualmente
  // porque r128 no incluye OrbitControls en el CDN)
  // ─────────────────────────────────────────
  class OrbitControls {
    constructor(camera, domElement) {
      this.camera = camera;
      this.domElement = domElement;
      this.target = new THREE.Vector3(0, 0, 0);
      this.enableDamping = true;
      this.dampingFactor = 0.08;
      this.minDistance = 1;
      this.maxDistance = 20;
      this.minPolarAngle = 0;
      this.maxPolarAngle = Math.PI;

      this._spherical = new THREE.Spherical();
      this._sphericalDelta = new THREE.Spherical();
      this._scale = 1;
      this._panOffset = new THREE.Vector3();

      this._isDragging = false;
      this._isPanning = false;
      this._lastX = 0;
      this._lastY = 0;

      this._attach();

      // Inicializar desde posición de cámara
      const offset = new THREE.Vector3().subVectors(camera.position, this.target);
      this._spherical.setFromVector3(offset);
    }

    _attach() {
      const el = this.domElement;
      el.addEventListener('mousedown', e => this._onMouseDown(e));
      el.addEventListener('mousemove', e => this._onMouseMove(e));
      el.addEventListener('mouseup', () => this._onMouseUp());
      el.addEventListener('wheel', e => this._onWheel(e), { passive: false });
      el.addEventListener('contextmenu', e => e.preventDefault());
      // Touch
      el.addEventListener('touchstart', e => this._onTouchStart(e), { passive: false });
      el.addEventListener('touchmove', e => this._onTouchMove(e), { passive: false });
      el.addEventListener('touchend', () => this._onMouseUp());
    }

    _onMouseDown(e) {
      e.preventDefault();
      this._isDragging = true;
      this._isPanning = e.shiftKey || e.button === 2;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    }

    _onMouseMove(e) {
      if (!this._isDragging) return;
      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;

      if (this._isPanning) {
        this._pan(dx, dy);
      } else {
        this._rotate(dx, dy);
      }
    }

    _onMouseUp() {
      this._isDragging = false;
      this._isPanning = false;
    }

    _onWheel(e) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1.08 : 0.93;
      this._scale *= delta;
    }

    _touchCache = [];
    _onTouchStart(e) {
      e.preventDefault();
      this._touchCache = Array.from(e.touches);
      if (e.touches.length === 1) {
        this._isDragging = true;
        this._lastX = e.touches[0].clientX;
        this._lastY = e.touches[0].clientY;
      }
    }

    _onTouchMove(e) {
      e.preventDefault();
      if (e.touches.length === 1 && this._isDragging) {
        const dx = e.touches[0].clientX - this._lastX;
        const dy = e.touches[0].clientY - this._lastY;
        this._lastX = e.touches[0].clientX;
        this._lastY = e.touches[0].clientY;
        this._rotate(dx, dy);
      } else if (e.touches.length === 2 && this._touchCache.length === 2) {
        // Pinch zoom
        const prev = Math.hypot(
          this._touchCache[0].clientX - this._touchCache[1].clientX,
          this._touchCache[0].clientY - this._touchCache[1].clientY
        );
        const curr = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const ratio = prev / curr;
        this._scale *= ratio;
        this._touchCache = Array.from(e.touches);
      }
    }

    _rotate(dx, dy) {
      const el = this.domElement;
      this._sphericalDelta.theta -= 2 * Math.PI * dx / el.clientWidth;
      this._sphericalDelta.phi -= 2 * Math.PI * dy / el.clientHeight;
    }

    _pan(dx, dy) {
      const el = this.domElement;
      const cam = this.camera;
      const dist = cam.position.distanceTo(this.target);
      const fovRad = THREE.MathUtils.degToRad(cam.fov);
      const targetHeight = 2 * Math.tan(fovRad / 2) * dist;
      const aspect = el.clientWidth / el.clientHeight;

      const panX = -(dx / el.clientWidth) * targetHeight * aspect;
      const panY = (dy / el.clientHeight) * targetHeight;

      const v = new THREE.Vector3();
      v.setFromMatrixColumn(cam.matrix, 0); // right
      v.multiplyScalar(panX);
      this._panOffset.add(v);

      v.setFromMatrixColumn(cam.matrix, 1); // up
      v.multiplyScalar(panY);
      this._panOffset.add(v);
    }

    update() {
      const position = this.camera.position;
      const offset = new THREE.Vector3().subVectors(position, this.target);
      this._spherical.setFromVector3(offset);

      if (this.enableDamping) {
        this._spherical.theta += this._sphericalDelta.theta * this.dampingFactor;
        this._spherical.phi += this._sphericalDelta.phi * this.dampingFactor;
        this._sphericalDelta.theta *= (1 - this.dampingFactor);
        this._sphericalDelta.phi *= (1 - this.dampingFactor);
        this._spherical.radius *= 1 + (this._scale - 1) * this.dampingFactor;
        this._scale = 1 + (this._scale - 1) * (1 - this.dampingFactor);
        this.target.addScaledVector(this._panOffset, this.dampingFactor);
        this._panOffset.multiplyScalar(1 - this.dampingFactor);
      } else {
        this._spherical.theta += this._sphericalDelta.theta;
        this._spherical.phi += this._sphericalDelta.phi;
        this._sphericalDelta.set(0, 0, 0);
        this._spherical.radius *= this._scale;
        this._scale = 1;
        this.target.add(this._panOffset);
        this._panOffset.set(0, 0, 0);
      }

      this._spherical.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this._spherical.phi));
      this._spherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this._spherical.radius));
      this._spherical.makeSafe();

      offset.setFromSpherical(this._spherical);
      position.copy(this.target).add(offset);
      this.camera.lookAt(this.target);
    }
  }

  // ─────────────────────────────────────────
  // App principal
  // ─────────────────────────────────────────
  class App {
    constructor() {
      this.loaded = false;
      this.book = null;
      this.ui = new UI(this);
      this._animFrame = null;
      this._clock = new THREE.Clock();
    }

    // ── Inicializar Three.js ──────────────────
    initScene() {
      const canvas = document.getElementById('gl-canvas');

      // Renderer
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        preserveDrawingBuffer: true, // para screenshots
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.1;
      this.renderer.physicallyCorrectLights = true;

      // Escena
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color('#e8e4dd');

      // Niebla sutil
      this.scene.fog = new THREE.FogExp2(0xe8e4dd, 0.08);

      // Cámara
      this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 100);
      this.camera.position.set(2, 1.5, 5);
      this.camera.lookAt(0, 0, 0);

      // Controles
      this.controls = new OrbitControls(this.camera, canvas);
      this.controls.minDistance = 1.5;
      this.controls.maxDistance = 12;
      this.controls.minPolarAngle = 0.1;
      this.controls.maxPolarAngle = Math.PI - 0.1;

      // Luces
      this._setupLights();

      // Plano de suelo (receptor de sombras)
      const floorGeo = new THREE.PlaneGeometry(40, 40);
      const floorMat = new THREE.ShadowMaterial({ opacity: 0.35 });
      this._floor = new THREE.Mesh(floorGeo, floorMat);
      this._floor.rotation.x = -Math.PI / 2;
      this._floor.position.y = -1.15;
      this._floor.receiveShadow = true;
      this.scene.add(this._floor);

      // Resize
      window.addEventListener('resize', () => this._onResize());

      // Libro
      this.book = new Book3D(this.scene, this.renderer);
    }

    _setupLights() {
      // Luz ambiente
      this._ambientLight = new THREE.AmbientLight(0xffeedd, 0.6);
      this.scene.add(this._ambientLight);

      // Luz principal (key light)
      this._keyLight = new THREE.DirectionalLight(0xfff5e0, 2.5);
      this._keyLight.position.set(4, 8, 5);
      this._keyLight.castShadow = true;
      this._keyLight.shadow.mapSize.width = 2048;
      this._keyLight.shadow.mapSize.height = 2048;
      this._keyLight.shadow.camera.near = 0.1;
      this._keyLight.shadow.camera.far = 30;
      this._keyLight.shadow.camera.left = -6;
      this._keyLight.shadow.camera.right = 6;
      this._keyLight.shadow.camera.top = 6;
      this._keyLight.shadow.camera.bottom = -6;
      this._keyLight.shadow.bias = -0.0003;
      this._keyLight.shadow.radius = 3;
      this.scene.add(this._keyLight);

      // Fill light (suave, desde abajo-izquierda)
      this._fillLight = new THREE.DirectionalLight(0xd0e8ff, 0.6);
      this._fillLight.position.set(-5, 2, 3);
      this.scene.add(this._fillLight);

      // Rim light (contraluz)
      this._rimLight = new THREE.DirectionalLight(0xffeedd, 0.4);
      this._rimLight.position.set(0, 2, -6);
      this.scene.add(this._rimLight);
    }

    // ── Loop de renderizado ───────────────────
    startLoop() {
      const loop = () => {
        this._animFrame = requestAnimationFrame(loop);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
      };
      loop();
    }

    _onResize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    }

    // ── Escenas de iluminación ────────────────
    setEnvironment(type) {
      const envs = {
        studio: { ambient: 0xffeedd, ambInt: 0.6, key: 0xfff5e0, keyInt: 2.5, bg: 0xe8e4dd, fog: 0xe8e4dd },
        natural: { ambient: 0xd0f0e0, ambInt: 0.8, key: 0xffffff, keyInt: 2.0, bg: 0xc8d8e0, fog: 0xc8d8e0 },
        dark:    { ambient: 0x202030, ambInt: 0.3, key: 0xfff0cc, keyInt: 3.5, bg: 0x111118, fog: 0x111118 },
        warm:    { ambient: 0xffe4b0, ambInt: 0.9, key: 0xffd070, keyInt: 2.8, bg: 0xf0dcc0, fog: 0xf0dcc0 },
      };
      const e = envs[type] || envs.studio;
      this._ambientLight.color.set(e.ambient);
      this._ambientLight.intensity = e.ambInt;
      this._keyLight.color.set(e.key);
      this._keyLight.intensity = e.keyInt;
      this.scene.background = new THREE.Color(e.bg);
      this.scene.fog = new THREE.FogExp2(e.fog, 0.08);
      this._floor.material.opacity = type === 'dark' ? 0.6 : 0.35;
      // Actualizar el picker de fondo
      const hex = '#' + new THREE.Color(e.bg).getHexString();
      const picker = document.getElementById('ctrl-bg-color');
      const label = document.getElementById('ctrl-bg-color-val');
      if (picker) picker.value = hex;
      if (label) label.textContent = hex;
    }

    setBackground(hexStr) {
      const color = new THREE.Color(hexStr);
      this.scene.background = color;
      if (this.scene.fog) this.scene.fog.color = color;
    }

    setShadowIntensity(v) {
      this._floor.material.opacity = v * 0.6;
      this._keyLight.shadow.camera.updateProjectionMatrix();
    }

    setAmbientLight(v) {
      this._ambientLight.intensity = v * 1.5;
    }

    // ── Presets de cámara ─────────────────────
    setCameraPreset(preset) {
      const r = 5;
      const presets = {
        front:         [0, 0, r],
        side:          [r, 0.3, 0],
        top:           [0, r, 0.01],
        iso:           [r * 0.7, r * 0.5, r * 0.7],
        'three-quarter': [r * 0.5, r * 0.35, r * 0.85],
        spine:         [-r, 0.3, 0.1],
      };
      const pos = presets[preset] || presets.iso;
      this._animateCameraTo(new THREE.Vector3(...pos), new THREE.Vector3(0, 0, 0));
    }

    _animateCameraTo(targetPos, lookAt) {
      const startPos = this.camera.position.clone();
      const startTarget = this.controls.target.clone();
      const duration = 800; // ms
      const startTime = performance.now();

      const anim = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3); // ease out cubic

        this.camera.position.lerpVectors(startPos, targetPos, ease);
        this.controls.target.lerpVectors(startTarget, lookAt, ease);

        if (t < 1) requestAnimationFrame(anim);
      };
      requestAnimationFrame(anim);
    }

    // ── Screenshot ────────────────────────────
    takeScreenshot() {
      this.renderer.render(this.scene, this.camera);
      const dataURL = this.renderer.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataURL;
      a.download = `book-studio-${Date.now()}.png`;
      a.click();
      this.ui.showToast('📷 Captura guardada');
    }

    // ── Cargar PDF y construir libro ──────────
    async loadPDF(file) {
      // Mostrar pantalla de carga
      this._showScreen('loading-screen');

      try {
        const buffer = await file.arrayBuffer();

        const result = await PDFLoader.loadPDFFromBuffer(buffer, (loaded, total, label) => {
          const fill = document.getElementById('loading-fill');
          const lbl = document.getElementById('loading-label');
          if (fill) fill.style.width = `${Math.round(loaded / total * 100)}%`;
          if (lbl) lbl.textContent = label;
        });

        // Crear texturas Three.js
        document.getElementById('loading-label').textContent = 'Creando texturas 3D…';
        const textures = await Promise.all(
          result.pages.map(dataURL => PDFLoader.createTexture(dataURL))
        );

        // Aplicar anisotropy máxima
        const maxAni = this.renderer.capabilities.getMaxAnisotropy();
        textures.forEach(t => { t.anisotropy = maxAni; });

        // Inicializar escena si no se ha hecho
        if (!this.renderer) this.initScene();

        // Mostrar viewer
        this._showScreen('viewer-screen');

        // Construir libro
        this.book.build(textures);
        this.book.setOpenAngle(70);
        this.book.showSpread(0);

        // Título
        const titleEl = document.getElementById('book-title');
        if (titleEl) titleEl.textContent = result.title || file.name.replace('.pdf', '');

        // Actualizar indicador de páginas
        this.ui.updatePageIndicator();
        this.ui.bind();

        // Centrar cámara
        this.setCameraPreset('three-quarter');

        this.loaded = true;

      } catch (err) {
        console.error(err);
        alert('Error cargando el PDF: ' + err.message);
        this._showScreen('upload-screen');
      }
    }

    _showScreen(id) {
      document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        if (s.id !== 'viewer-screen') s.style.display = '';
      });

      const target = document.getElementById(id);
      if (!target) return;

      if (id === 'viewer-screen') {
        target.style.display = 'block';
        requestAnimationFrame(() => target.classList.add('active'));
      } else {
        target.style.display = 'flex';
        requestAnimationFrame(() => target.classList.add('active'));
      }
    }
  }

  // ─────────────────────────────────────────
  // Bootstrap
  // ─────────────────────────────────────────
  const app = new App();
  app.initScene();
  app.startLoop();

  // ── Drag & Drop + File Input ──────────────
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('over');
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'application/pdf' || file.name.endsWith('.pdf'))) {
      app.loadPDF(file);
    } else {
      alert('Por favor, selecciona un archivo PDF.');
    }
  });

  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) app.loadPDF(file);
  });

  // Mostrar pantalla inicial
  const uploadScreen = document.getElementById('upload-screen');
  uploadScreen.style.display = 'flex';
  requestAnimationFrame(() => uploadScreen.classList.add('active'));

  // Exponer para debugging
  window._app = app;

})();
