/**
 * HUNGRY NOODLE 3D — the jungle world.
 *
 * A naturalistic environment and snake skin, built entirely in code. The
 * project ships no image files, so every texture here is painted onto a
 * canvas at boot: forest floor, snake scales, bark and foliage.
 *
 * Everything is created ONCE and reused. Nothing in here allocates during a
 * frame, and `dispose()` releases every geometry, material and texture.
 *
 * Kept in its own file so `renderer3d.js` stays readable, and so the arcade
 * world it already knows how to build is untouched.
 */
(function (NS) {
  'use strict';

  /* ====================================================================== *
   * Deterministic noise — the same jungle every time
   * ====================================================================== */

  function seeded(seed) {
    let value = seed >>> 0;
    return function next() {
      value = (value * 1664525 + 1013904223) % 4294967296;
      return value / 4294967296;
    };
  }

  /* ====================================================================== *
   * Procedural textures
   * ====================================================================== */

  function makeCanvas(size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas;
  }

  /**
   * Forest floor: damp earth, moss patches, scattered leaf litter, and a very
   * faint grid so the playfield is still readable.
   */
  function paintGround(size, grid) {
    const canvas = makeCanvas(size);
    const c = canvas.getContext('2d');
    const random = seeded(20260916);

    // The playfield is a clearing: lighter than the jungle around it, so the
    // board reads as a distinct surface rather than blending into the scenery.
    c.fillStyle = '#3d3320';
    c.fillRect(0, 0, size, size);

    // Damp earth mottling
    for (let i = 0; i < 900; i += 1) {
      const x = random() * size;
      const y = random() * size;
      const r = 6 + random() * 42;
      c.globalAlpha = 0.05 + random() * 0.09;
      c.fillStyle = random() > 0.5 ? '#3d3018' : '#211a0f';
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }

    // Moss, clumped rather than even
    for (let i = 0; i < 260; i += 1) {
      const cx = random() * size;
      const cy = random() * size;
      const clump = 3 + Math.floor(random() * 7);
      for (let j = 0; j < clump; j += 1) {
        c.globalAlpha = 0.10 + random() * 0.20;
        c.fillStyle = random() > 0.4 ? '#3f5a24' : '#2c451a';
        c.beginPath();
        c.arc(cx + (random() - 0.5) * 60, cy + (random() - 0.5) * 60,
          5 + random() * 16, 0, Math.PI * 2);
        c.fill();
      }
    }

    // Leaf litter
    for (let i = 0; i < 220; i += 1) {
      const x = random() * size;
      const y = random() * size;
      const len = 8 + random() * 18;
      c.save();
      c.translate(x, y);
      c.rotate(random() * Math.PI * 2);
      c.globalAlpha = 0.16 + random() * 0.22;
      c.fillStyle = ['#6b5a22', '#4e3f18', '#7a6b2c', '#3f4a1c'][Math.floor(random() * 4)];
      c.beginPath();
      c.ellipse(0, 0, len, len * 0.38, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }

    // A whisper of a grid — enough to read cells, not enough to look drawn
    c.globalAlpha = 0.07;
    c.strokeStyle = '#000000';
    c.lineWidth = 2;
    const step = size / grid;
    for (let i = 1; i < grid; i += 1) {
      c.beginPath();
      c.moveTo(i * step, 0);
      c.lineTo(i * step, size);
      c.moveTo(0, i * step);
      c.lineTo(size, i * step);
      c.stroke();
    }

    c.globalAlpha = 1;
    return canvas;
  }

  /**
   * Snake skin: overlapping scales, plus irregular dorsal blotches. Tiles
   * along the body, so it has to be seamless left-to-right.
   */
  function paintScales(size, palette) {
    const canvas = makeCanvas(size);
    const c = canvas.getContext('2d');
    const random = seeded(77415);

    c.fillStyle = palette.body;
    c.fillRect(0, 0, size, size);

    // Belly runs lighter — the texture wraps around the tube, so the lower
    // band becomes the underside.
    const belly = c.createLinearGradient(0, 0, 0, size);
    belly.addColorStop(0, 'rgba(0,0,0,0.30)');
    belly.addColorStop(0.45, 'rgba(0,0,0,0)');
    belly.addColorStop(0.75, 'rgba(255,255,255,0.10)');
    belly.addColorStop(1, palette.belly);
    c.fillStyle = belly;
    c.fillRect(0, 0, size, size);

    // Dorsal blotches, python-ish: irregular dark shapes along the back
    c.globalAlpha = 0.55;
    c.fillStyle = palette.bodyDark;
    for (let i = 0; i < 9; i += 1) {
      const cx = (i / 9) * size + random() * 18;
      const cy = size * (0.10 + random() * 0.30);
      c.beginPath();
      c.moveTo(cx, cy);
      for (let a = 0; a <= 8; a += 1) {
        const angle = (a / 8) * Math.PI * 2;
        const r = size * (0.055 + random() * 0.05);
        c.lineTo(cx + Math.cos(angle) * r * 1.5, cy + Math.sin(angle) * r);
      }
      c.closePath();
      c.fill();
    }
    c.globalAlpha = 1;

    // Scales: staggered rows of overlapping arcs
    const rows = 26;
    const cols = 30;
    const w = size / cols;
    const h = size / rows;
    for (let row = 0; row < rows; row += 1) {
      const offset = (row % 2) * (w / 2);
      for (let col = -1; col <= cols; col += 1) {
        const x = col * w + offset;
        const y = row * h;
        c.beginPath();
        c.ellipse(x + w / 2, y + h / 2, w * 0.56, h * 0.62, 0, 0, Math.PI * 2);
        c.strokeStyle = 'rgba(0,0,0,0.26)';
        c.lineWidth = 1.4;
        c.stroke();
        // A highlight on the upper edge of each scale gives the sheen
        c.beginPath();
        c.ellipse(x + w / 2, y + h * 0.42, w * 0.40, h * 0.34, 0, Math.PI, Math.PI * 2);
        c.strokeStyle = 'rgba(255,255,255,0.13)';
        c.lineWidth = 1;
        c.stroke();
      }
    }

    return canvas;
  }

  /** Tree bark: vertical grain with knots. */
  function paintBark(size) {
    const canvas = makeCanvas(size);
    const c = canvas.getContext('2d');
    const random = seeded(3312);

    c.fillStyle = '#4a3a26';
    c.fillRect(0, 0, size, size);
    for (let i = 0; i < 260; i += 1) {
      const x = random() * size;
      c.globalAlpha = 0.10 + random() * 0.22;
      c.fillStyle = random() > 0.5 ? '#5c4a30' : '#32271a';
      c.fillRect(x, 0, 1 + random() * 5, size);
    }
    c.globalAlpha = 0.5;
    for (let i = 0; i < 14; i += 1) {
      c.fillStyle = '#2a2114';
      c.beginPath();
      c.ellipse(random() * size, random() * size, 3 + random() * 8,
        10 + random() * 26, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    return canvas;
  }

  /** A fern frond on transparency, used on crossed billboard planes. */
  function paintFrond(size) {
    const canvas = makeCanvas(size);
    const c = canvas.getContext('2d');
    const random = seeded(9091);

    c.clearRect(0, 0, size, size);
    const stemX = size / 2;

    c.strokeStyle = '#3c5a1e';
    c.lineWidth = size * 0.035;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(stemX, size);
    c.lineTo(stemX, size * 0.12);
    c.stroke();

    const leaves = 11;
    for (let i = 0; i < leaves; i += 1) {
      const t = i / (leaves - 1);
      const y = size * (0.92 - t * 0.78);
      const span = size * 0.42 * (1 - Math.pow(t, 1.7)) + size * 0.04;
      for (const side of [-1, 1]) {
        c.save();
        c.translate(stemX, y);
        c.rotate(side * (0.55 + random() * 0.18));
        c.fillStyle = ['#4a7226', '#3d6020', '#56852c'][Math.floor(random() * 3)];
        c.beginPath();
        c.ellipse(side * span * 0.5, 0, span * 0.55, size * 0.030, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
    }
    return canvas;
  }

  /* ====================================================================== *
   * Public: build the world
   * ====================================================================== */

  /**
   * @param {object} THREE
   * @param {object} options {scene, arena, grid, cell, palette, shadows, worldX, worldZ}
   * @returns {{dispose: function, setPalette: function, update: function}}
   */
  NS.buildJungleWorld = function buildJungleWorld(THREE, options) {
    const { scene, arena, grid, palette, shadows, camera } = options;
    const span = grid;
    const random = seeded(51423);

    /*
     * Nothing may stand between the camera and the board.
     *
     * The camera sits out at +z looking back at the origin, so a ring of
     * trees puts a third of them directly in front of the lens. Scenery is
     * therefore only placed behind and beside the arena. You never see the
     * near side anyway — the camera is standing in it.
     */
    const camZ = camera ? camera.z : grid * 1.32;
    const NEAR_LIMIT = span * 0.22;

    function blocksTheView(x, z, height) {
      if (z < NEAR_LIMIT) return false;        // behind or beside the board
      if (z > camZ + 6) return false;          // behind the camera
      const spread = 10 + height * 0.9;        // wider things block from further out
      return Math.abs(x) < spread;
    }

    const textures = [];
    const geometries = [];
    const materials = [];

    function texture(canvas, repeatX, repeatY) {
      const map = new THREE.CanvasTexture(canvas);
      map.wrapS = THREE.RepeatWrapping;
      map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(repeatX || 1, repeatY || 1);
      map.anisotropy = 4;
      if ('encoding' in map) map.encoding = THREE.sRGBEncoding;
      textures.push(map);
      return map;
    }

    function track(item) {
      if (item.isBufferGeometry) geometries.push(item);
      else materials.push(item);
      return item;
    }

    /* ------------------------------ ground ------------------------------ */

    const groundMap = texture(paintGround(1024, grid), 1, 1);
    const groundMaterial = track(new THREE.MeshStandardMaterial({
      map: groundMap,
      roughness: 0.95,
      metalness: 0,
    }));
    const groundGeometry = track(new THREE.PlaneGeometry(span, span));
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = shadows;
    arena.add(ground);

    // A wider floor beyond the playfield, so the arena is not an island
    const surroundMap = texture(paintGround(512, 1), 6, 6);
    const surroundMaterial = track(new THREE.MeshStandardMaterial({
      map: surroundMap,
      roughness: 1,
      metalness: 0,
    }));
    const surroundGeometry = track(new THREE.PlaneGeometry(span * 5, span * 5));
    const surround = new THREE.Mesh(surroundGeometry, surroundMaterial);
    surround.rotation.x = -Math.PI / 2;
    surround.position.y = -0.08;
    arena.add(surround);

    /* ------------------------- boundary: mossy logs --------------------- */
    /*
     * The wall still has to read as lethal, so it is a solid, continuous ring
     * of fallen logs rather than scattered scenery.
     */
    const barkMap = texture(paintBark(256), 1, 3);
    const logMaterial = track(new THREE.MeshStandardMaterial({
      map: barkMap,
      roughness: 0.85,
      metalness: 0,
    }));
    const logGeometry = track(new THREE.CylinderGeometry(0.46, 0.52, 1, 10));

    const edge = span / 2 + 0.5;
    const logCount = grid + 2;
    const logs = new THREE.InstancedMesh(logGeometry, logMaterial, logCount * 4);
    logs.castShadow = shadows;
    logs.receiveShadow = shadows;
    arena.add(logs);

    const dummy = new THREE.Object3D();
    let at = 0;
    for (const side of ['n', 's', 'e', 'w']) {
      for (let i = 0; i < logCount; i += 1) {
        const t = (i / (logCount - 1) - 0.5) * (span + 1);
        const jitter = (random() - 0.5) * 0.12;
        if (side === 'n' || side === 's') {
          dummy.position.set(t, 0.42 + jitter, side === 'n' ? -edge : edge);
          dummy.rotation.set(0, 0, Math.PI / 2);
        } else {
          dummy.position.set(side === 'e' ? edge : -edge, 0.42 + jitter, t);
          dummy.rotation.set(Math.PI / 2, 0, 0);
        }
        dummy.scale.set(1, 1.08, 1);
        dummy.updateMatrix();
        logs.setMatrixAt(at, dummy.matrix);
        at += 1;
      }
    }
    logs.instanceMatrix.needsUpdate = true;

    /* ------------------------------ trees ------------------------------- */

    const trunkGeometry = track(new THREE.CylinderGeometry(0.42, 0.78, 1, 8));
    const trunkMaterial = track(new THREE.MeshStandardMaterial({
      map: texture(paintBark(256), 1, 4),
      roughness: 0.9,
      metalness: 0,
    }));
    const canopyGeometry = track(new THREE.IcosahedronGeometry(1, 0));
    const canopyMaterial = track(new THREE.MeshStandardMaterial({
      color: new THREE.Color('#2f5220'),
      roughness: 1,
      metalness: 0,
      flatShading: true,
    }));

    const TREES = 26;
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, TREES);
    const canopies = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, TREES * 3);
    trunks.castShadow = shadows;
    canopies.castShadow = shadows;
    arena.add(trunks);
    arena.add(canopies);

    let canopyAt = 0;
    let treeAt = 0;
    for (let i = 0; i < TREES; i += 1) {
      // Ringed around the arena, never on it and never in front of it
      const angle = (i / TREES) * Math.PI * 2 + random() * 0.18;
      const distance = span * (0.78 + random() * 0.55);
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      const height = 9 + random() * 11;
      if (blocksTheView(x, z, height)) continue;

      dummy.position.set(x, height / 2, z);
      dummy.rotation.set(0, random() * Math.PI, (random() - 0.5) * 0.06);
      dummy.scale.set(1, height, 1);
      dummy.updateMatrix();
      trunks.setMatrixAt(treeAt, dummy.matrix);
      treeAt += 1;

      for (let b = 0; b < 3; b += 1) {
        const blobSize = 2.6 + random() * 2.4;
        dummy.position.set(
          x + (random() - 0.5) * 3.2,
          height * (0.82 + random() * 0.22),
          z + (random() - 0.5) * 3.2
        );
        dummy.rotation.set(random() * 3, random() * 3, random() * 3);
        dummy.scale.setScalar(blobSize);
        dummy.updateMatrix();
        canopies.setMatrixAt(canopyAt, dummy.matrix);
        canopyAt += 1;
      }
    }
    trunks.count = treeAt;
    canopies.count = canopyAt;
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;

    /* ------------------------------ ferns -------------------------------- */

    const frondMap = texture(paintFrond(256), 1, 1);
    const frondMaterial = track(new THREE.MeshStandardMaterial({
      map: frondMap,
      transparent: true,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      roughness: 1,
      metalness: 0,
    }));
    const frondGeometry = track(new THREE.PlaneGeometry(1, 1));

    const FERNS = 90;
    const ferns = new THREE.InstancedMesh(frondGeometry, frondMaterial, FERNS * 2);
    ferns.castShadow = false;
    arena.add(ferns);

    let fernAt = 0;
    for (let i = 0; i < FERNS; i += 1) {
      const angle = random() * Math.PI * 2;
      const distance = span * (0.58 + random() * 0.85);
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      const size = 1.6 + random() * 2.2;
      if (blocksTheView(x, z, size)) continue;
      // Two crossed planes so a frond reads from any angle
      for (let k = 0; k < 2; k += 1) {
        dummy.position.set(x, size / 2, z);
        dummy.rotation.set(0, random() * Math.PI + k * Math.PI / 2, 0);
        dummy.scale.set(size, size, size);
        dummy.updateMatrix();
        ferns.setMatrixAt(fernAt, dummy.matrix);
        fernAt += 1;
      }
    }
    ferns.count = fernAt;
    ferns.instanceMatrix.needsUpdate = true;

    /* ------------------------------ rocks -------------------------------- */

    const rockGeometry = track(new THREE.DodecahedronGeometry(1, 0));
    const rockMaterial = track(new THREE.MeshStandardMaterial({
      color: new THREE.Color('#5a5a52'),
      roughness: 1,
      metalness: 0,
      flatShading: true,
    }));
    const ROCKS = 18;
    const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, ROCKS);
    rocks.castShadow = shadows;
    rocks.receiveShadow = shadows;
    arena.add(rocks);
    let rockAt = 0;
    for (let i = 0; i < ROCKS; i += 1) {
      const angle = random() * Math.PI * 2;
      const distance = span * (0.62 + random() * 0.8);
      const size = 0.5 + random() * 1.5;
      const rx = Math.cos(angle) * distance;
      const rz = Math.sin(angle) * distance;
      if (blocksTheView(rx, rz, size)) continue;
      dummy.position.set(rx, size * 0.35, rz);
      dummy.rotation.set(random() * 3, random() * 3, random() * 3);
      dummy.scale.set(size, size * 0.7, size);
      dummy.updateMatrix();
      rocks.setMatrixAt(rockAt, dummy.matrix);
      rockAt += 1;
    }
    rocks.count = rockAt;
    rocks.instanceMatrix.needsUpdate = true;

    /* --------------------------- atmosphere ------------------------------ */

    scene.background = new THREE.Color('#1b2a12');
    /*
     * Linear fog, starting past the far edge of the board. Exponential fog
     * washed out 22% of the playfield at the centre and 35% at the back;
     * this leaves the board completely clear and only fades the treeline.
     */
    scene.fog = new THREE.Fog(new THREE.Color('#2a3d1c'), grid * 1.9, grid * 4.2);

    return {
      /** The snake skin, so the renderer can dress the body with it. */
      makeSkin(forPalette) {
        const map = texture(paintScales(512, forPalette), 5, 1);
        const material = track(new THREE.MeshStandardMaterial({
          map,
          bumpMap: map,
          bumpScale: 0.035,
          roughness: 0.42,
          metalness: 0.08,
        }));
        return material;
      },

      dispose() {
        for (const item of geometries) item.dispose();
        for (const item of materials) item.dispose();
        for (const item of textures) item.dispose();
      },
    };
  };
}(window.HungryNoodle));
