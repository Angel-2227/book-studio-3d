/**
 * book.js
 * Clase Book3D: construye y gestiona el libro 3D en Three.js.
 * Incluye tapa delantera, trasera, lomo, páginas interiores y sombras.
 */

;(function(global) {
  'use strict';

  class Book3D {
    constructor(scene, renderer) {
      this.scene = scene;
      this.renderer = renderer;
      this.group = new THREE.Group();
      scene.add(this.group);

      // Datos
      this.pageTextures = [];        // Array de THREE.Texture
      this.currentSpread = 0;        // índice del spread visible
      this.totalSpreads = 1;

      // Parámetros del libro (se pueden actualizar desde UI)
      this.params = {
        width: 1.6,       // ancho de cada página (unidades Three)
        height: 2.2,      // alto
        thickness: 0.20,  // grosor del lomo
        openAngle: 70,    // grados de apertura
        coverColor: 0x2d2016,
        paperColor: 0xf5f0e8,
        coverRoughness: 0.85,
        coverMetalness: 0.0,
      };

      this._built = false;
      this._pagesMesh = null;
      this._frontCover = null;
      this._backCover = null;
      this._spine = null;
      this._shadow = null;
    }

    /**
     * Construye la geometría del libro.
     * @param {THREE.Texture[]} textures - texturas de las páginas
     */
    build(textures) {
      this.pageTextures = textures;
      this.totalSpreads = Math.max(1, Math.ceil(textures.length / 2));

      // Limpiar grupo anterior
      while (this.group.children.length > 0) {
        const child = this.group.children[0];
        this.group.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      }

      this._buildBook();
      this._buildShadow();
      this._built = true;
      this.setOpenAngle(this.params.openAngle);
      this.showSpread(0);
    }

    _buildBook() {
      const p = this.params;
      const w = p.width;
      const h = p.height;
      const t = p.thickness;

      // ── Materiales de tapa ──
      const coverMat = this._makeCoverMat();

      // ── Tapa trasera ──
      const backGeo = new THREE.BoxGeometry(w, h, 0.018);
      const backMesh = new THREE.Mesh(backGeo, coverMat);
      backMesh.position.set(-w / 2, 0, -t / 2);
      backMesh.receiveShadow = true;
      backMesh.castShadow = true;
      this.group.add(backMesh);
      this._backCover = backMesh;

      // ── Lomo ──
      const spineGeo = new THREE.BoxGeometry(t, h, 0.018);
      const spineMesh = new THREE.Mesh(spineGeo, coverMat);
      spineMesh.position.set(-w - t / 2, 0, 0);
      spineMesh.rotation.y = Math.PI / 2;
      spineMesh.receiveShadow = true;
      spineMesh.castShadow = true;
      this.group.add(spineMesh);
      this._spine = spineMesh;

      // ── Bloque de páginas (representación del canto) ──
      const blockGeo = new THREE.BoxGeometry(w - 0.01, h - 0.01, t - 0.005);
      const blockMat = new THREE.MeshStandardMaterial({
        color: this.params.paperColor,
        roughness: 0.9, metalness: 0,
      });
      const blockMesh = new THREE.Mesh(blockGeo, blockMat);
      blockMesh.position.set(-w / 2, 0, 0);
      blockMesh.receiveShadow = true;
      this.group.add(blockMesh);
      this._pageBlock = blockMesh;

      // ── Tapa delantera (con pivot en el lomo) ──
      const frontGroup = new THREE.Group();
      frontGroup.position.set(-w, 0, 0); // pivot en lomo
      this.group.add(frontGroup);

      const frontGeo = new THREE.BoxGeometry(w, h, 0.018);

      // Material frontal con textura de portada o color sólido
      const frontMat = this._makeCoverMat();
      if (this.pageTextures.length > 0) {
        // Asignar textura de la primera página como portada
        const coverTex = this.pageTextures[0];
        const matWithTex = new THREE.MeshStandardMaterial({
          map: coverTex,
          roughness: this.params.coverRoughness,
          metalness: this.params.coverMetalness,
        });
        const matBack = this._makeCoverMat();
        frontGroup.userData.coverMatFront = matWithTex;
        frontGroup.userData.coverMatBack = matBack;

        // La tapa frontal tiene distintas materiales por cara
        const mats = [
          coverMat, coverMat,  // laterales
          coverMat, coverMat,  // top/bottom
          matBack,             // cara interior (Z-)
          matWithTex,          // cara exterior (Z+)
        ];
        const frontMesh = new THREE.Mesh(frontGeo, mats);
        frontMesh.position.set(w / 2, 0, t / 2);
        frontMesh.castShadow = true;
        frontGroup.add(frontMesh);
      } else {
        const frontMesh = new THREE.Mesh(frontGeo, frontMat);
        frontMesh.position.set(w / 2, 0, t / 2);
        frontMesh.castShadow = true;
        frontGroup.add(frontMesh);
      }

      this._frontCover = frontGroup;

      // ── Plano de páginas con textura ──
      this._buildPagePlane();
    }

    _buildPagePlane() {
      const p = this.params;
      const w = p.width;
      const h = p.height;

      // Plano doble que simula el spread abierto
      // (dos páginas: izquierda y derecha)
      const spreadGroup = new THREE.Group();
      spreadGroup.position.set(-w / 2, 0, p.thickness / 2 + 0.001);
      this.group.add(spreadGroup);
      this._spreadGroup = spreadGroup;

      // Página izquierda
      const leftGeo = new THREE.PlaneGeometry(w, h);
      const leftMat = new THREE.MeshStandardMaterial({
        color: this.params.paperColor, roughness: 0.9, metalness: 0,
        side: THREE.FrontSide,
      });
      const leftMesh = new THREE.Mesh(leftGeo, leftMat);
      leftMesh.position.set(-w / 2, 0, 0);
      leftMesh.receiveShadow = true;
      spreadGroup.add(leftMesh);
      this._leftPage = leftMesh;

      // Página derecha
      const rightGeo = new THREE.PlaneGeometry(w, h);
      const rightMat = new THREE.MeshStandardMaterial({
        color: this.params.paperColor, roughness: 0.9, metalness: 0,
        side: THREE.FrontSide,
      });
      const rightMesh = new THREE.Mesh(rightGeo, rightMat);
      rightMesh.position.set(w / 2, 0, 0);
      rightMesh.receiveShadow = true;
      spreadGroup.add(rightMesh);
      this._rightPage = rightMesh;

      // Línea de doblez (sutil)
      const lineGeo = new THREE.PlaneGeometry(0.003, h);
      const lineMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 });
      const line = new THREE.Mesh(lineGeo, lineMat);
      line.position.set(0, 0, 0.001);
      spreadGroup.add(line);
    }

    _buildShadow() {
      // Sombra de contacto (blob shadow)
      const shadowGeo = new THREE.PlaneGeometry(this.params.width * 4, this.params.width * 3);
      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
      });
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(-this.params.width, -this.params.height / 2 - 0.001, 0);
      shadow.receiveShadow = false;
      this.scene.add(shadow);
      this._shadowMesh = shadow;
    }

    _makeCoverMat() {
      return new THREE.MeshStandardMaterial({
        color: this.params.coverColor,
        roughness: this.params.coverRoughness,
        metalness: this.params.coverMetalness,
      });
    }

    /**
     * Muestra el spread (doble página) con índice dado.
     */
    showSpread(index) {
      if (!this._built) return;
      this.currentSpread = Math.max(0, Math.min(index, this.totalSpreads - 1));

      const leftIdx = this.currentSpread * 2;
      const rightIdx = leftIdx + 1;

      // Asignar texturas
      if (this._leftPage) {
        const tex = this.pageTextures[leftIdx] || null;
        this._leftPage.material.map = tex;
        this._leftPage.material.color.set(tex ? 0xffffff : this.params.paperColor);
        this._leftPage.material.needsUpdate = true;
      }
      if (this._rightPage) {
        const tex = this.pageTextures[rightIdx] || null;
        this._rightPage.material.map = tex;
        this._rightPage.material.color.set(tex ? 0xffffff : this.params.paperColor);
        this._rightPage.material.needsUpdate = true;
      }
    }

    nextSpread() {
      if (this.currentSpread < this.totalSpreads - 1) {
        this.showSpread(this.currentSpread + 1);
        return true;
      }
      return false;
    }

    prevSpread() {
      if (this.currentSpread > 0) {
        this.showSpread(this.currentSpread - 1);
        return true;
      }
      return false;
    }

    /**
     * Establece el ángulo de apertura del libro (0 = cerrado, 180 = totalmente abierto).
     */
    setOpenAngle(degrees) {
      if (!this._built) return;
      this.params.openAngle = degrees;

      const t = this.params.thickness;
      const angleRad = THREE.MathUtils.degToRad(degrees);

      // Rotar tapa delantera sobre el lomo (eje Y)
      if (this._frontCover) {
        this._frontCover.rotation.y = -angleRad;
      }

      // Ajustar visibilidad y posición del spread de páginas
      // El spread solo es visible cuando el libro está abierto
      if (this._spreadGroup) {
        const visibility = Math.min(1, degrees / 30);
        this._spreadGroup.position.z = t / 2 + 0.002;

        // Rotar ligeramente las páginas según apertura para simular curvatura
        const leftAngle = THREE.MathUtils.degToRad(degrees * 0.08);
        const rightAngle = THREE.MathUtils.degToRad(-degrees * 0.04);
        if (this._leftPage) this._leftPage.rotation.y = leftAngle;
        if (this._rightPage) this._rightPage.rotation.y = rightAngle;

        // Fade in de las páginas al abrir
        if (this._leftPage && this._leftPage.material) {
          this._leftPage.material.opacity = visibility;
          this._leftPage.material.transparent = visibility < 1;
        }
        if (this._rightPage && this._rightPage.material) {
          this._rightPage.material.opacity = visibility;
          this._rightPage.material.transparent = visibility < 1;
        }
      }
    }

    /**
     * Actualiza el color de la tapa.
     */
    setCoverColor(hexStr) {
      const color = new THREE.Color(hexStr);
      this.params.coverColor = color.getHex();
      this.group.traverse(obj => {
        if (obj.isMesh && obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => {
            // Solo cambiar materiales sin textura de página
            if (!m.map && m.color) m.color.set(color);
          });
        }
      });
    }

    setCoverFinish(type) {
      const finishMap = {
        matte: { roughness: 0.9, metalness: 0.0 },
        glossy: { roughness: 0.05, metalness: 0.1 },
        satin: { roughness: 0.45, metalness: 0.05 },
      };
      const f = finishMap[type] || finishMap.matte;
      this.params.coverRoughness = f.roughness;
      this.params.coverMetalness = f.metalness;
      this.group.traverse(obj => {
        if (obj.isMesh && obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => {
            if (!m.map) {
              m.roughness = f.roughness;
              m.metalness = f.metalness;
              m.needsUpdate = true;
            }
          });
        }
      });
    }

    setPaperColor(hexStr) {
      const color = new THREE.Color(hexStr);
      this.params.paperColor = color.getHex();
      if (this._leftPage) this._leftPage.material.color.set(color);
      if (this._rightPage) this._rightPage.material.color.set(color);
      if (this._pageBlock) this._pageBlock.material.color.set(color);
    }

    /**
     * Actualiza el grosor del lomo (reconstruye el libro).
     */
    setThickness(value) {
      const t = THREE.MathUtils.mapLinear(value, 2, 60, 0.02, 0.6);
      if (Math.abs(t - this.params.thickness) < 0.001) return;
      this.params.thickness = t;
      if (this._built && this.pageTextures.length > 0) {
        this.build(this.pageTextures);
      }
    }

    setShadowOpacity(value) {
      if (this._shadowMesh) {
        this._shadowMesh.material.opacity = value * 0.4;
      }
    }

    /**
     * Obtiene el bounding box del libro para centrar la cámara.
     */
    getBoundingBox() {
      const box = new THREE.Box3();
      box.setFromObject(this.group);
      return box;
    }
  }

  global.Book3D = Book3D;

})(window);
