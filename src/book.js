/**
 * book.js  v3 — geometría corregida
 *
 * SISTEMA DE COORDENADAS:
 *   El lomo está en X = 0 (eje Y vertical).
 *   La tapa trasera se extiende hacia X NEGATIVO (X = -pageW/2).
 *   La tapa delantera y las hojas se extienden hacia X POSITIVO,
 *   rotando alrededor del eje Y en X=0.
 *
 *   Cuando openAngle = 0   → libro cerrado (tapa delantera sobre la trasera)
 *   Cuando openAngle = 158 → libro completamente abierto (spread plano)
 *
 *   Tapa trasera:  rotation.y = 0  (fija, apunta hacia Z-)
 *   Tapa delantera: rotation.y = openAngle (en radianes, rotando desde Z- hacia Z+)
 *   Hojas: interpoladas entre 0 y openAngle con smoothstep
 *
 *   Desde la cámara, vemos:
 *     izquierda = tapa trasera / páginas pares (verso)
 *     centro    = lomo
 *     derecha   = tapa delantera / páginas impares (recto)
 *
 *   En un spread abierto, la hoja central muestra:
 *     cara Z- = página izquierda del spread
 *     cara Z+ = página derecha del spread
 */

;(function(global) {
  'use strict';

  const DEG = d => d * Math.PI / 180;

  class Book3D {
    constructor(scene, renderer) {
      this.scene    = scene;
      this.renderer = renderer;

      // Grupo raíz — centrado en el lomo
      this.group = new THREE.Group();
      scene.add(this.group);

      this.pageTextures  = [];  // array de THREE.Texture, una por página PDF
      this.coverTexture  = null; // textura de portada (cargada por el usuario)
      this.totalPages    = 0;
      this.currentSpread = 0;   // índice del spread visible (0 = primera apertura)
      this._openAngle    = 0;   // grados, 0..158

      // Parámetros físicos
      this.params = {
        pageW:     1.48,   // ancho de una página
        pageH:     2.10,   // alto
        coverT:    0.010,  // grosor de la tapa
        spineW:    0.22,   // grosor del lomo / bloque de páginas
        numSheets: 0,      // calculado en build()

        coverColor:    0x2a1a0a,
        paperColor:    0xf5f0e8,
        coverRoughness:0.88,
        coverMetalness:0.00,
      };

      this._built = false;

      // Referencias internas
      this._backGroup   = null;   // grupo tapa trasera (fijo)
      this._frontGroup  = null;   // grupo tapa delantera (rota)
      this._sheetGroups = [];     // grupos de hojas internas
      this._spineMesh   = null;
      this._blockMesh   = null;   // bloque de canto (páginas apiladas)
      this._floorMesh   = null;
    }

    // ─────────────────────────────────────────────────────────────
    //  BUILD — construir toda la geometría
    // ─────────────────────────────────────────────────────────────

    build(textures) {
      this.pageTextures = textures || [];
      this.totalPages   = this.pageTextures.length;

      // numSheets = hojas internas (cada hoja = 2 páginas)
      this.params.numSheets = Math.max(1, Math.ceil(this.totalPages / 2));

      this._dispose();

      const { pageW, pageH, coverT, spineW } = this.params;

      // ── 1. TAPA TRASERA (fija, rotation.y = 0) ──
      // Se extiende hacia X negativo desde el lomo
      this._backGroup = new THREE.Group();
      this.group.add(this._backGroup);
      {
        const mesh = this._makeCoverBox('back');
        // Centro de la caja en X = -pageW/2 (a la izquierda del lomo)
        mesh.position.set(-pageW / 2, 0, 0);
        this._backGroup.add(mesh);
      }

      // ── 2. LOMO ──
      // Una caja delgada centrada en X=0, Z = -(spineW/2)
      // (el libro cerrado se extiende hacia Z negativo)
      {
        const geo  = new THREE.BoxGeometry(coverT * 2, pageH, spineW + coverT * 2);
        const mat  = this._solidCoverMat();
        this._spineMesh = new THREE.Mesh(geo, mat);
        this._spineMesh.position.set(0, 0, -(spineW / 2));
        this._spineMesh.castShadow = true;
        this._spineMesh.receiveShadow = true;
        this.group.add(this._spineMesh);
      }

      // ── 3. BLOQUE DE HOJAS (canto) ──
      // Se ve como el grosor de papel entre las tapas
      {
        const geo = new THREE.BoxGeometry(pageW * 0.98, pageH * 0.995, spineW);
        const mat = new THREE.MeshStandardMaterial({
          color: this.params.paperColor, roughness: 0.95, metalness: 0,
        });
        this._blockMesh = new THREE.Mesh(geo, mat);
        // Centrado en X = -pageW/2, extendido hacia Z negativo (cerrado)
        this._blockMesh.position.set(-pageW / 2, 0, -(spineW / 2));
        this._blockMesh.receiveShadow = true;
        this.group.add(this._blockMesh);
      }

      // ── 4. HOJAS INTERNAS ──
      this._buildSheets();

      // ── 5. TAPA DELANTERA (rota con openAngle) ──
      this._frontGroup = new THREE.Group();
      // El pivot es el eje Y en X=0 (el lomo) — el grupo rota en Y
      this.group.add(this._frontGroup);
      {
        const mesh = this._makeCoverBox('front');
        mesh.position.set(pageW / 2, 0, 0);
        this._frontGroup.add(mesh);
      }

      // ── 6. SUELO ──
      {
        const geo = new THREE.PlaneGeometry(pageW * 5, pageH * 3);
        const mat = new THREE.ShadowMaterial({ opacity: 0.28, transparent: true, depthWrite: false });
        this._floorMesh = new THREE.Mesh(geo, mat);
        this._floorMesh.rotation.x = -Math.PI / 2;
        this._floorMesh.position.y = -pageH / 2 - 0.005;
        this._floorMesh.receiveShadow = true;
        this.scene.add(this._floorMesh);
      }

      this._built = true;

      // Aplicar estado actual
      this._applyAngle(this._openAngle);
      this._showSpreadTextures(this.currentSpread);
    }

    // ─────────────────────────────────────────────────────────────
    //  HOJAS INTERNAS
    // ─────────────────────────────────────────────────────────────

    _buildSheets() {
      const { pageW, pageH, numSheets } = this.params;
      this._sheetGroups = [];

      for (let i = 0; i < numSheets; i++) {
        const group = new THREE.Group();
        // El grupo pivota en X=0 (el lomo), igual que la tapa delantera
        this.group.add(group);

        // Cada hoja es un PlaneGeometry con dos caras (FrontSide + BackSide)
        // que se corresponden con las páginas izq/dcha del spread
        const geo  = new THREE.PlaneGeometry(pageW, pageH);

        // Cara recto (Z+, página derecha del spread)
        const matFront = this._pageMat(null);
        const meshFront = new THREE.Mesh(geo, matFront);
        meshFront.position.set(pageW / 2, 0, 0);
        group.add(meshFront);

        // Cara verso (Z-, página izquierda del spread)
        // Rotamos 180° en Y para que quede cara a cara con la anterior
        const matBack = this._pageMat(null);
        const meshBack = new THREE.Mesh(geo, matBack);
        meshBack.position.set(pageW / 2, 0, 0);
        meshBack.rotation.y = Math.PI;
        group.add(meshBack);

        this._sheetGroups.push({ group, meshFront, meshBack, matFront, matBack });
      }
    }

    // ─────────────────────────────────────────────────────────────
    //  APERTURA
    // ─────────────────────────────────────────────────────────────

    setOpenAngle(degrees) {
      this._openAngle = Math.max(0, Math.min(158, degrees));
      if (this._built) this._applyAngle(this._openAngle);
    }

    _applyAngle(deg) {
      if (!this._built) return;
      const { pageW, spineW } = this.params;
      const n = this._sheetGroups.length;
      const rad = DEG(deg);

      // Tapa delantera: rota desde 0° (cerrada, apilada sobre la trasera)
      // hasta 158° (completamente abierta y plana)
      // rotation.y negativo para que abra hacia Z+
      if (this._frontGroup) {
        this._frontGroup.rotation.y = -rad;
      }

      // Hojas: distribuidas en abanico con smoothstep
      for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 0.5;
        const eased = this._smoothstep(t);
        this._sheetGroups[i].group.rotation.y = -DEG(eased * deg);
      }

      // El bloque de canto se "aplana" conforme el libro se abre
      if (this._blockMesh) {
        // Cuando abierto, el bloque rota para quedar de lado
        // y se escala en Z para simular que las páginas se dispersan
        const t = deg / 158;
        this._blockMesh.rotation.y = -rad / 2;
        this._blockMesh.position.x = -pageW / 2 * Math.cos(rad / 2);
        this._blockMesh.position.z = -(spineW / 2) - pageW / 2 * Math.sin(rad / 2) * 0.5;
        this._blockMesh.scale.z = Math.max(0.06, 1 - t * 0.92);
      }
    }

    _smoothstep(t) {
      return t * t * (3 - 2 * t);
    }

    // ─────────────────────────────────────────────────────────────
    //  SPREADS — gestión de páginas visibles
    // ─────────────────────────────────────────────────────────────

    /**
     * Spread layout:
     *   spread 0 → páginas 0, 1  (portada interna + p.2)
     *   spread k → páginas k*2, k*2+1
     *
     * En un spread abierto, la hoja CENTRAL (índice = currentSpread) muestra:
     *   cara verso (Z-)  = página izquierda  (pageIndex = spread * 2)
     *   cara recto (Z+)  = página derecha    (pageIndex = spread * 2 + 1)
     *
     * Las demás hojas quedan apiladas bajo las tapas y no se ven.
     */

    showSpread(index) {
      if (!this._built) return;
      const maxSpread = Math.max(0, this._sheetGroups.length - 1);
      this.currentSpread = Math.max(0, Math.min(index, maxSpread));
      this._showSpreadTextures(this.currentSpread);
    }

    _showSpreadTextures(spreadIdx) {
      const n = this._sheetGroups.length;
      for (let i = 0; i < n; i++) {
        const sheet = this._sheetGroups[i];
        const leftPageIdx  = spreadIdx * 2;
        const rightPageIdx = spreadIdx * 2 + 1;

        if (i === spreadIdx) {
          // Hoja activa: muestra las páginas del spread
          this._setPageTex(sheet.matBack,  this.pageTextures[leftPageIdx]);   // verso = izquierda
          this._setPageTex(sheet.matFront, this.pageTextures[rightPageIdx]);  // recto = derecha
        } else {
          // Hojas inactivas: color papel liso
          this._setPageTex(sheet.matBack,  null);
          this._setPageTex(sheet.matFront, null);
        }
      }
    }

    _setPageTex(mat, tex) {
      if (!mat) return;
      mat.map = tex || null;
      mat.color.setHex(tex ? 0xffffff : this.params.paperColor);
      mat.needsUpdate = true;
    }

    nextSpread() {
      const max = Math.max(0, this._sheetGroups.length - 1);
      if (this.currentSpread < max) { this.showSpread(this.currentSpread + 1); return true; }
      return false;
    }

    prevSpread() {
      if (this.currentSpread > 0) { this.showSpread(this.currentSpread - 1); return true; }
      return false;
    }

    totalSpreads() {
      return this._sheetGroups.length;
    }

    // ─────────────────────────────────────────────────────────────
    //  PORTADA — imagen subida por el usuario
    // ─────────────────────────────────────────────────────────────

    setCoverTexture(texture) {
      this.coverTexture = texture;
      if (!this._frontGroup) return;

      // La tapa delantera es un BoxGeometry; su cara +Z (índice 4) es la portada
      this._frontGroup.traverse(obj => {
        if (!obj.isMesh) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        // Cara +Z = índice 4 en BoxGeometry
        if (mats.length >= 6) {
          if (mats[4]) {
            mats[4].map = texture;
            mats[4].color.set(0xffffff);
            mats[4].needsUpdate = true;
          }
        }
      });
    }

    clearCoverTexture() {
      this.coverTexture = null;
      if (!this._frontGroup) return;
      this._frontGroup.traverse(obj => {
        if (!obj.isMesh) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        if (mats.length >= 6 && mats[4]) {
          mats[4].map = null;
          mats[4].color.setHex(this.params.coverColor);
          mats[4].needsUpdate = true;
        }
      });
    }

    // ─────────────────────────────────────────────────────────────
    //  ESTILO
    // ─────────────────────────────────────────────────────────────

    setCoverColor(hexStr) {
      const color = new THREE.Color(hexStr);
      this.params.coverColor = color.getHex();
      this.group.traverse(obj => {
        if (!obj.isMesh) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => {
          if (m && !m.map && m.isMeshStandardMaterial && m.roughness > 0.5) {
            m.color.copy(color);
          }
        });
      });
      // Lomo también
      if (this._spineMesh) this._spineMesh.material.color.copy(color);
    }

    setCoverFinish(type) {
      const map = { matte: [0.92, 0], glossy: [0.04, 0.08], satin: [0.42, 0.04] };
      const [r, m] = map[type] || map.matte;
      this.params.coverRoughness = r;
      this.params.coverMetalness = m;
      this.group.traverse(obj => {
        if (!obj.isMesh) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(mat => {
          if (!mat || mat.map) return;
          mat.roughness  = r;
          mat.metalness  = m;
          mat.needsUpdate = true;
        });
      });
    }

    setPaperColor(hexStr) {
      const color = new THREE.Color(hexStr);
      this.params.paperColor = color.getHex();
      this._sheetGroups.forEach(s => {
        if (!s.matFront.map) s.matFront.color.copy(color);
        if (!s.matBack.map)  s.matBack.color.copy(color);
      });
      if (this._blockMesh) this._blockMesh.material.color.copy(color);
    }

    setThickness(sliderVal) {
      const t = THREE.MathUtils.mapLinear(sliderVal, 2, 60, 0.04, 0.72);
      if (Math.abs(t - this.params.spineW) < 0.005) return;
      this.params.spineW = t;
      if (this._built && this.pageTextures.length > 0) {
        const angle  = this._openAngle;
        const spread = this.currentSpread;
        this.build(this.pageTextures);
        this._openAngle = angle;
        this._applyAngle(angle);
        this.showSpread(spread);
      }
    }

    setShadowOpacity(v) {
      if (this._floorMesh) this._floorMesh.material.opacity = Math.max(0, Math.min(0.7, v * 0.6));
    }

    getBoundingBox() {
      return new THREE.Box3().setFromObject(this.group);
    }

    // ─────────────────────────────────────────────────────────────
    //  FÁBRICAS DE MATERIAL / GEOMETRÍA
    // ─────────────────────────────────────────────────────────────

    _makeCoverBox(side) {
      const { pageW, pageH, coverT, coverRoughness, coverMetalness } = this.params;
      const geo  = new THREE.BoxGeometry(pageW, pageH, coverT);

      const solid = () => new THREE.MeshStandardMaterial({
        color: this.params.coverColor, roughness: coverRoughness, metalness: coverMetalness,
      });

      // Para la tapa delantera: la cara +Z (índice 4) puede mostrar portada
      if (side === 'front') {
        const mats = [solid(), solid(), solid(), solid(), solid(), solid()];
        const mesh = new THREE.Mesh(geo, mats);
        mesh.castShadow = mesh.receiveShadow = true;
        return mesh;
      } else {
        const mat  = solid();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = mesh.receiveShadow = true;
        return mesh;
      }
    }

    _solidCoverMat() {
      return new THREE.MeshStandardMaterial({
        color:     this.params.coverColor,
        roughness: this.params.coverRoughness,
        metalness: this.params.coverMetalness,
      });
    }

    _pageMat(tex) {
      return new THREE.MeshStandardMaterial({
        map:       tex || null,
        color:     tex ? 0xffffff : this.params.paperColor,
        roughness: 0.88,
        metalness: 0,
        side:      THREE.FrontSide,
      });
    }

    // ─────────────────────────────────────────────────────────────
    //  DISPOSE
    // ─────────────────────────────────────────────────────────────

    _dispose() {
      // Limpiar hijos del grupo principal
      while (this.group.children.length) {
        const child = this.group.children[0];
        this.group.remove(child);
        child.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          const mats = obj.material
            ? (Array.isArray(obj.material) ? obj.material : [obj.material])
            : [];
          mats.forEach(m => m && m.dispose());
        });
      }

      // Suelo
      if (this._floorMesh) {
        this.scene.remove(this._floorMesh);
        this._floorMesh.geometry.dispose();
        this._floorMesh.material.dispose();
        this._floorMesh = null;
      }

      this._sheetGroups  = [];
      this._frontGroup   = null;
      this._backGroup    = null;
      this._spineMesh    = null;
      this._blockMesh    = null;
      this._built        = false;
    }
  }

  global.Book3D = Book3D;

})(window);
