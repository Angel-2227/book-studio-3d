# Book Studio 3D

Visualizador tridimensional de libros y publicaciones para diseño gráfico editorial.

## Características

- Carga cualquier PDF y lo convierte en un libro 3D interactivo
- Sombras suaves con shadow maps (Three.js PCFSoftShadowMap)
- Materiales PBR (físicamente correctos): mate, brillante, satinado
- Control orbital completo: rotar, zoom, panear, touch/pinch
- Presets de cámara para fotografía de producto
- Ambientes de iluminación: Estudio, Natural, Oscuro, Cálido
- Captura de pantalla en alta resolución
- Sin build step: HTML/CSS/JS puro con CDN

## Estructura

```
book-studio-3d/
├── index.html          ← Entrada principal
├── src/
│   ├── styles.css      ← Estilos (editorial, Cormorant Garamond)
│   ├── pdfLoader.js    ← Carga y rasterización de PDF con pdf.js
│   ├── book.js         ← Clase Book3D (geometría, materiales, páginas)
│   ├── ui.js           ← Controlador de interfaz
│   └── main.js         ← Three.js: escena, luces, cámara, OrbitControls
├── _redirects          ← Para Cloudflare Pages
├── package.json
└── README.md
```

## Despliegue en Cloudflare Pages

### Opción 1: Desde GitHub (recomendada)

1. Sube la carpeta a un repositorio GitHub
2. Ve a [pages.cloudflare.com](https://pages.cloudflare.com)
3. Haz clic en **Create a project → Connect to Git**
4. Selecciona tu repositorio
5. Configuración de build:
   - **Framework preset**: None
   - **Build command**: (dejar vacío)
   - **Build output directory**: `/` (raíz)
6. Despliega

### Opción 2: Direct Upload (sin GitHub)

1. Ve a [pages.cloudflare.com](https://pages.cloudflare.com)
2. Haz clic en **Create a project → Direct Upload**
3. Arrastra la carpeta `book-studio-3d/` completa
4. Asigna un nombre al proyecto y despliega

## Uso local

```bash
# Con Node.js instalado:
npx serve . -p 3000
# Abre http://localhost:3000
```

O simplemente abre `index.html` directamente en el navegador
(algunos browsers bloquean pdf.js por CORS en file://, mejor usar serve).

## Controles

| Acción | Mouse | Touch |
|--------|-------|-------|
| Rotar | Arrastrar | 1 dedo |
| Zoom | Scroll | Pinch |
| Panear | Shift + Arrastrar | — |
| Página siguiente | → | — |
| Página anterior | ← | — |
| Abrir/cerrar | O | — |

## Dependencias (CDN, sin instalación)

- [Three.js r128](https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js)
- [PDF.js 3.11.174](https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js)
- [Google Fonts: Cormorant Garamond + DM Mono](https://fonts.google.com)
