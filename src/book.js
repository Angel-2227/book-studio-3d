/**
 * book.js  v2
 *
 * Modelo físicamente correcto de un libro:
 *
 *   LOMO (eje fijo, pivot de todo)
 *     ├─ Tapa trasera    → fija, extendida a la derecha del lomo
 *     ├─ Bloque de hojas → entre las dos tapas (canto)
 *     ├─ Hojas internas  → en abanico, distribuidas entre 0° y openAngle
 *     └─ Tapa delantera  → rota desde el lomo de 0° a ~150°
 *
 * Cuando openAngle = 0   → libro cerrado
 * Cuando openAngle = 150 → libro completamente abierto (spread plano)
 *
 * El pivot de TODA la rotación es el lomo (X=0 del grupo).
 */

;(function(global) {
  'use strict';

  const DEG = THREE.MathUtils.degToRad;

  class Book3D {
    constructor(scene, renderer) {
      this.scene    = scene;
      this.renderer = renderer;

      this.group = new THREE.Group();
      scene.add(this.group);

      this.pageTextures  = [];
      this.totalPages    = 0;
      this.currentSpread = 0;
      this._openAngle    = 0;

      this.params = {
        pageW:          1.48,
        pageH:          2.10,
        coverThickness: 0.012,
        spineW:         0.22,
        coverColor:     0x2a1a0a,
        paperColor:     0xf5f0e8,
        coverRoughness: 0.88,
        coverMetalness: 0.0,
      };

      this._frontCoverGroup = null;
      this._backCoverMesh   = null;
      this._spineMesh       = null;
      this._pageBlockMesh   = null;
      this._pageGroups      = [];
      this._pageSheets      = [];
      this._floorShadow     = null;
      this._built           = false;
    }

    // ─────────────────────────────────────────────────
    //  BUILD
    // ─────────────────────────────────────────────────

    build(textures) {
      this.pageTextures = textures;
      this.totalPages   = textures.length;
      this._disposeMeshes();

      const p = this.params;

      // 1. Tapa trasera — fija
      //    Pivota en X=0 (lomo), se extiende hacia X+ y Z+ (hacia cámara)
      const backGroup = new THREE.Group();
      this.group.add(backGroup);
      this._backCoverGroup = backGroup;

      const backMesh = this._makeCoverMesh('back', null);
      backMesh.position.set(p.pageW / 2, 0, -p.coverThickness / 2);
      backGroup.add(backMesh);
      // La tapa trasera NO rota — está a 0°

      // 2. Lomo
      this._spineMesh = this._makeSpineMesh();
      this.group.add(this._spineMesh);

      // 3. Bloque de hojas (canto)
      this._pageBlockMesh = this._makePageBlock();
      this.group.add(this._pageBlockMesh);

      // 4. Hojas internas
      this._buildInternalPages();

      // 5. Tapa delantera — rota con openAngle
      this._frontCoverGroup = new THREE.Group();
      this.group.add(this._frontCoverGroup);

      const frontMesh = this._makeCoverMesh('front', textures[0] || null);
      frontMesh.position.set(p.pageW / 2, 0, p.coverThickness / 2);
      this._frontCoverGroup.add(frontMesh);

      // 6. Sombra de contacto
      this._buildContactShadow();

      this._built = true;
      this.setOpenAngle(this._openAngle);
      this.showSpread(this.currentSpread);
    }

    // ─────────────────────────────────────────────────
    //  HOJAS INTERNAS
    // ─────────────────────────────────────────────────

    _buildInternalPages() {
      const p = this.params;
      const numSheets = Math.max(2, Math.ceil(this.totalPages / 2));

      this._pageGroups = [];
      this._pageSheets = [];

      for (let i = 0; i < numSheets; i++) {
        const group = new THREE.Group();
        // El grupo pivota en el lomo (X=0, que es el origen)

        const geo = new THREE.PlaneGeometry(p.pageW, p.pageH);
        const texA = this.pageTextures[i * 2]     || null;
        const texB = this.pageTextures[i * 2 + 1] || null;

        const matFront = this._makePageMat(texA);
        const matBack  = this._makePageMat(texB);

        // Cara visible al abrir (mirando hacia Z+)
        const meshFront = new THREE.Mesh(geo, matFront);
        meshFront.position.set(p.pageW / 2, 0, 0);
        group.add(meshFront);

        // Cara trasera (mirando hacia Z-)
        const meshBack = new THREE.Mesh(geo, matBack);
        meshBack.position.set(p.pageW / 2, 0, 0);
        meshBack.rotation.y = Math.PI;
        group.add(meshBack);

        this.group.add(group);
        this._pageGroups.push(group);
        this._pageSheets.push({ group, matFront, matBack, sheetIndex: i });
      }
    }

    // ─────────────────────────────────────────────────
    //  APERTURA
    // ─────────────────────────────────────────────────

    setOpenAngle(degrees) {
      this._openAngle = Math.max(0, Math.min(158, degrees));
      if (this._built) this._applyOpenAngle(this._openAngle);
    }

    _applyOpenAngle(angleDeg) {
      const p = this.params;
      const n = this._pageGroups.length;
      if (n === 0) return;

      // La tapa trasera está a rotation.y = 0 (fija, eje Z positivo)
      // La tapa delantera rota a -angleDeg alrededor del lomo

      // Tapa delantera
      if (this._frontCoverGroup) {
        this._frontCoverGroup.rotation.y = DEG(angleDeg);
      }

      // Hojas: distribuidas en abanico entre 0° y angleDeg
      // La hoja 0 (más pegada a la tapa trasera) está casi en 0°
      // La hoja n-1 (más pegada a la tapa delantera) está casi en angleDeg
      for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 0.5;
        const eased = this._smoothStep(t);
        const pageAngle = eased * angleDeg;
        this._pageGroups[i].rotation.y = DEG(pageAngle);
      }

      // El bloque de canto se aplana con la apertura
      if (this._pageBlockMesh) {
        const t = angleDeg / 158;
        const scaleZ = THREE.MathUtils.lerp(1.0, 0.08, t);
        this._pageBlockMesh.scale.z = scaleZ;
        // Rotar el bloque para seguir el spread
        this._pageBlockMesh.rotation.y = DEG(angleDeg / 2);
      }
    }

    _smoothStep(t) {
      // SmoothStep: densifica en los extremos (hojas apiladas en tapas)
      return t * t * (3 - 2 * t);
    }

    // ─────────────────────────────────────────────────
    //  SPREAD VISIBLE
    // ─────────────────────────────────────────────────

    showSpread(index) {
      if (!this._built) return;
      const maxSpread = Math.max(0, Math.ceil(this.totalPages / 2) - 1);
      this.currentSpread = Math.max(0, Math.min(index, maxSpread));

      // Actualizar texturas de la hoja activa (la del centro visual)
      // La hoja "activa" es la que corresponde al spread actual
      this._pageSheets.forEach((sheet, i) => {
        const isActive = i === this.currentSpread;
        const leftIdx  = this.currentSpread * 2;
        const rightIdx = this.currentSpread * 2 + 1;

        if (isActive) {
          if (sheet.matFront) {
            const tex = this.pageTextures[leftIdx] || null;
            sheet.matFront.map = tex;
            sheet.matFront.color.set(tex ? 0xffffff : this.params.paperColor);
            sheet.matFront.needsUpdate = true;
          }
          if (sheet.matBack) {
            const tex = this.pageTextures[rightIdx] || null;
            sheet.matBack.map = tex;
            sheet.matBack.color.set(tex ? 0xffffff : this.params.paperColor);
            sheet.matBack.needsUpdate = true;
          }
        }
      });
    }

    nextSpread() {
      const max = Math.max(0, Math.ceil(this.totalPages / 2) - 1);
      if (this.currentSpread < max) { this.showSpread(this.currentSpread + 1); return true; }
      return false;
    }

    prevSpread() {
      if (this.currentSpread > 0) { this.showSpread(this.currentSpread - 1); return true; }
      return false;
    }

    // ─────────────────────────────────────────────────
    //  FÁBRICAS DE GEOMETRÍA / MATERIAL
    // ─────────────────────────────────────────────────

    _makeCoverMesh(side, coverTex) {
      const p   = this.params;
      const geo = new THREE.BoxGeometry(p.pageW, p.pageH, p.coverThickness);

      let mats;
      if (coverTex && side === 'front') {
        const texMat = new THREE.MeshStandardMaterial({
          map: coverTex, roughness: p.coverRoughness, metalness: p.coverMetalness,
        });
        const solid = this._makeSolidCoverMat();
        // BoxGeometry face order: +X, -X, +Y, -Y, +Z (front), -Z (back)
        mats = [solid, solid, solid, solid, solid, texMat];
      } else {
        mats = this._makeSolidCoverMat();
      }

      const mesh = new THREE.Mesh(geo, mats);
      mesh.castShadow = mesh.receiveShadow = true;
      return mesh;
    }

    _makeSolidCoverMat() {
      return new THREE.MeshStandardMaterial({
        color:     this.params.coverColor,
        roughness: this.params.coverRoughness,
        metalness: this.params.coverMetalness,
      });
    }

    _makeSpineMesh() {
      const p   = this.params;
      const geo = new THREE.BoxGeometry(p.coverThickness * 1.6, p.pageH, p.spineW + p.coverThickness * 2);
      const mat = this._makeSolidCoverMat();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(-p.coverThickness * 0.8, 0, -(p.spineW / 2 + p.coverThickness));
      mesh.castShadow = mesh.receiveShadow = true;
      return mesh;
    }

    _makePageBlock() {
      const p   = this.params;
      const geo = new THREE.BoxGeometry(p.pageW * 0.98, p.pageH * 0.995, p.spineW);
      const mat = new THREE.MeshStandardMaterial({
        color: this.params.paperColor, roughness: 0.92, metalness: 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      // Centrado en lomo, extendido hacia X+
      mesh.position.set(p.pageW / 2, 0, -(p.spineW / 2 + p.coverThickness));
      mesh.receiveShadow = true;
      return mesh;
    }

    _makePageMat(tex) {
      return new THREE.MeshStandardMaterial({
        map:       tex  || null,
        color:     tex  ? 0xffffff : this.params.paperColor,
        roughness: 0.88,
        metalness: 0,
        side:      THREE.FrontSide,
      });
    }

    _buildContactShadow() {
      const p   = this.params;
      const geo = new THREE.PlaneGeometry(p.pageW * 3, p.pageH * 1.6);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0, depthWrite: false,
      });
      this._floorShadow = new THREE.Mesh(geo, mat);
      this._floorShadow.rotation.x = -Math.PI / 2;
      this._floorShadow.position.set(p.pageW / 2, -p.pageH / 2 - 0.002, 0);
      this.scene.add(this._floorShadow);
    }

    // ─────────────────────────────────────────────────
    //  API PÚBLICA DE ESTILO
    // ─────────────────────────────────────────────────

    setCoverColor(hexStr) {
      const color = new THREE.Color(hexStr);
      this.params.coverColor = color.getHex();
      this.group.traverse(obj => {
        if (!obj.isMesh) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => { if (m && !m.map && m.color) m.color.set(color); });
      });
    }

    setCoverFinish(type) {
      const pr = { matte: [0.92,0], glossy: [0.04,0.08], satin: [0.42,0.04] }[type] || [0.92,0];
      this.params.coverRoughness = pr[0];
      this.params.coverMetalness = pr[1];
      this.group.traverse(obj => {
        if (!obj.isMesh) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => {
          if (!m || m.map) return;
          m.roughness = pr[0]; m.metalness = pr[1]; m.needsUpdate = true;
        });
      });
    }

    setPaperColor(hexStr) {
      const color = new THREE.Color(hexStr);
      this.params.paperColor = color.getHex();
      this._pageSheets.forEach(s => {
        if (s.matFront && !s.matFront.map) s.matFront.color.set(color);
        if (s.matBack  && !s.matBack.map)  s.matBack.color.set(color);
      });
      if (this._pageBlockMesh) this._pageBlockMesh.material.color.set(color);
    }

    setThickness(sliderVal) {
      const t = THREE.MathUtils.mapLinear(sliderVal, 2, 60, 0.04, 0.72);
      if (Math.abs(t - this.params.spineW) < 0.005) return;
      this.params.spineW = t;
      if (this._built && this.pageTextures.length > 0) {
        const angle = this._openAngle;
        const spread = this.currentSpread;
        this.build(this.pageTextures);
        this._openAngle = angle;
        this._applyOpenAngle(angle);
        this.showSpread(spread);
      }
    }

    setShadowOpacity(v) {
      if (this._floorShadow) this._floorShadow.material.opacity = v * 0.5;
    }

    getBoundingBox() {
      const box = new THREE.Box3();
      box.setFromObject(this.group);
      return box;
    }

    _disposeMeshes() {
      while (this.group.children.length) {
        const c = this.group.children[0];
        this.group.remove(c);
        c.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach(m => { if (m) m.dispose(); });
          }
        });
      }
      if (this._floorShadow) {
        this.scene.remove(this._floorShadow);
        this._floorShadow.geometry.dispose();
        this._floorShadow.material.dispose();
        this._floorShadow = null;
      }
      this._pageGroups = [];
      this._pageSheets = [];
      this._built      = false;
    }
  }

  global.Book3D = Book3D;

})(window);
