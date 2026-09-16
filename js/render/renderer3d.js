/**
 * HUNGRY NOODLE 3D — the Three.js renderer.
 *
 * Implements exactly the same contract as the 2D renderer, so main.js can swap
 * between them without the engine ever knowing. Everything here is view-only:
 * it reads engine state and draws it, and never writes back.
 *
 * Performance rules followed throughout:
 *   - geometries and materials are created ONCE and shared
 *   - snake segments, particles and obstacles come from pools and are hidden
 *     rather than destroyed
 *   - nothing is allocated per frame except small scratch vectors reused below
 *   - dispose() actually releases every geometry, material and texture
 */
(function (NS) {
  'use strict';

  const clamp = NS.clamp;
  const easeOutCubic = NS.easeOutCubic;
  const easeOutBack = NS.easeOutBack;

  /** Grid cell size in world units. The board is centred on the origin. */
  const CELL = 1;
  const MAX_SEGMENTS = 420;
  const MAX_PARTICLES = 180;
  const MAX_OBSTACLES = 40;

  NS.isWebGLAvailable = function isWebGLAvailable() {
    if (typeof window === 'undefined' || !window.WebGLRenderingContext) return false;
    try {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2') || probe.getContext('webgl') ||
        probe.getContext('experimental-webgl');
      if (!gl) return false;
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return true;
    } catch (error) {
      return false;
    }
  };

  NS.createRenderer3D = function createRenderer3D(canvas, options) {
    const THREE = window.THREE;
    if (!THREE) throw new Error('Three.js is not loaded');

    const opts = options || {};
    const reduced = opts.reduced || false;
    // Small touch screens: keep the look, drop the expensive parts
    const lowPower = opts.lowPower || false;
    const shadows = !reduced && !lowPower;
    // Small viewports keep a higher, safer camera angle
    const compact = opts.compact || false;
    const grid = NS.CONFIG.GRID_SIZE;
    const half = (grid - 1) / 2;

    /* ================================================================== *
     * Renderer, scene, camera
     * ================================================================== */

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;

    const scene = new THREE.Scene();

    /*
     * Camera framing.
     *
     * A square board seen at an angle foreshortens, so the lower the camera
     * the more perspective you get and the less of the frame the board fills.
     * These numbers are the closest camera that still frames the whole board
     * with 1.6 cells of horizontal slack — enough for the follow drift.
     *
     *   desktop  42 deg / 60 fov -> a near cell looks 1.72x a far one
     *   compact  46 deg / 58 fov -> 1.64x, keeping more board on screen
     *
     * For comparison the previous framing managed 1.56x and, more to the
     * point, had NEGATIVE horizontal slack: the near edge of the board was
     * being clipped, and the follow drift made it worse.
     */
    const ELEVATION_DEG = compact ? 46 : 42;
    const FIELD_OF_VIEW = compact ? 58 : 60;
    const CAMERA_DISTANCE = grid * (compact ? 1.33 : 1.319);

    const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 0.5, 140);

    const elevation = (ELEVATION_DEG * Math.PI) / 180;
    const CAMERA_HOME = new THREE.Vector3(
      0,
      CAMERA_DISTANCE * Math.sin(elevation),
      CAMERA_DISTANCE * Math.cos(elevation)
    );
    camera.position.copy(CAMERA_HOME);
    camera.lookAt(0, 0, 0);

    const cameraTarget = new THREE.Vector3(0, 0, 0);
    const desiredTarget = new THREE.Vector3(0, 0, 0);
    const desiredPosition = new THREE.Vector3();
    const scratch = new THREE.Vector3();

    /* ================================================================== *
     * Lighting
     * ================================================================== */

    const hemi = new THREE.HemisphereLight(0xffffff, 0x404060, 0.85);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(grid * 0.5, grid * 1.3, grid * 0.55);
    key.castShadow = shadows;
    if (key.shadow) {
      const extent = grid * 0.78;
      key.shadow.camera.left = -extent;
      key.shadow.camera.right = extent;
      key.shadow.camera.top = extent;
      key.shadow.camera.bottom = -extent;
      key.shadow.camera.near = 1;
      key.shadow.camera.far = grid * 3.2;
      key.shadow.mapSize.set(shadows ? 1024 : 512, shadows ? 1024 : 512);
      key.shadow.bias = -0.0012;
      key.shadow.normalBias = 0.02;
    }
    scene.add(key);
    scene.add(key.target);

    const rim = new THREE.DirectionalLight(0xffd9a0, 0.34);
    rim.position.set(-grid * 0.7, grid * 0.5, -grid * 0.6);
    scene.add(rim);

    // Follows the snack so it always reads as the thing you want
    const foodGlow = new THREE.PointLight(0xffffff, 0.75, 7, 2);
    scene.add(foodGlow);

    /* ================================================================== *
     * Shared geometries and materials — built once, reused forever
     * ================================================================== */

    const geo = {
      segment: new THREE.SphereGeometry(0.5, 18, 14),
      eye: new THREE.SphereGeometry(0.5, 14, 10),
      pupil: new THREE.SphereGeometry(0.5, 10, 8),
      mouth: new THREE.SphereGeometry(0.5, 14, 10),
      slab: new THREE.BoxGeometry(1, 1, 1),
      cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
      cone: new THREE.ConeGeometry(0.5, 1, 20),
      torus: new THREE.TorusGeometry(0.34, 0.16, 12, 24),
      tiny: new THREE.SphereGeometry(0.5, 8, 6),
      plate: new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
      wedge: new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1, false, 0, Math.PI * 0.62),
      capsule: THREE.CapsuleGeometry
        ? new THREE.CapsuleGeometry(0.5, 1, 6, 12)
        : new THREE.CylinderGeometry(0.5, 0.5, 2, 14),
    };

    const materialCache = new Map();

    /** Toon materials give the flat, banded cartoon look for almost nothing. */
    function toon(color, extra) {
      const cacheKey = `${color}|${JSON.stringify(extra || {})}`;
      let material = materialCache.get(cacheKey);
      if (!material) {
        material = new THREE.MeshToonMaterial(
          Object.assign({ color: new THREE.Color(color) }, extra || {})
        );
        materialCache.set(cacheKey, material);
      }
      return material;
    }

    function basic(color, extra) {
      const cacheKey = `basic|${color}|${JSON.stringify(extra || {})}`;
      let material = materialCache.get(cacheKey);
      if (!material) {
        material = new THREE.MeshBasicMaterial(
          Object.assign({ color: new THREE.Color(color) }, extra || {})
        );
        materialCache.set(cacheKey, material);
      }
      return material;
    }

    /** Grid coordinates -> world. y is up; the board lies in the x/z plane. */
    function worldX(gx) { return (gx - half) * CELL; }
    function worldZ(gy) { return (gy - half) * CELL; }

    /* ================================================================== *
     * The arena
     * ================================================================== */

    const arena = new THREE.Group();
    scene.add(arena);

    const wallMeshes = [];
    let baseMesh = null;

    /*
     * The floor is real geometry, not a painted checker: two InstancedMeshes
     * of shallow boxes, one per checker parity. Their top faces sit at y = 0
     * and y = -0.05, so the darker squares are physically recessed and the
     * gap between tiles reads as a groove. Two draw calls for 400 tiles, and
     * it catches the shadow the noodle casts as it undulates.
     */
    const TILE_GAP = 0.05;
    const TILE_DEPTH = 0.6;
    const TILE_RECESS = 0.05;
    let tilesLight = null;
    let tilesDark = null;

    /**
     * Build the checkerboard out of instanced boxes.
     *
     * Tops sit at y = 0 (light) and y = -TILE_RECESS (dark), so everything
     * above the floor keeps the coordinates it already had.
     */
    function buildFloorTiles(palette) {
      const dummy = new THREE.Object3D();
      const half = grid / 2;
      const counts = { light: 0, dark: 0 };
      for (let y = 0; y < grid; y += 1) {
        for (let x = 0; x < grid; x += 1) {
          if ((x + y) % 2 === 0) counts.light += 1;
          else counts.dark += 1;
        }
      }

      tilesLight = new THREE.InstancedMesh(geo.slab, toon(palette.board1), counts.light);
      tilesDark = new THREE.InstancedMesh(geo.slab, toon(palette.board2), counts.dark);
      for (const tiles of [tilesLight, tilesDark]) {
        tiles.castShadow = false;
        tiles.receiveShadow = shadows;
        arena.add(tiles);
      }

      const size = CELL - TILE_GAP;
      let lightAt = 0;
      let darkAt = 0;
      for (let y = 0; y < grid; y += 1) {
        for (let x = 0; x < grid; x += 1) {
          const light = (x + y) % 2 === 0;
          const top = light ? 0 : -TILE_RECESS;
          dummy.position.set(worldX(x), top - TILE_DEPTH / 2, worldZ(y));
          dummy.scale.set(size, TILE_DEPTH, size);
          dummy.updateMatrix();
          if (light) tilesLight.setMatrixAt(lightAt++, dummy.matrix);
          else tilesDark.setMatrixAt(darkAt++, dummy.matrix);
        }
      }
      tilesLight.instanceMatrix.needsUpdate = true;
      tilesDark.instanceMatrix.needsUpdate = true;
    }

    function buildArena(theme) {
      const span = grid * CELL;

      buildFloorTiles(theme);

      // A thick slab underneath so the arena reads as a solid object
      baseMesh = new THREE.Mesh(geo.slab, toon(theme.board2));
      baseMesh.scale.set(span + 1.6, 1.2, span + 1.6);
      baseMesh.position.y = -0.62;
      baseMesh.receiveShadow = shadows;
      arena.add(baseMesh);

      // Four chunky walls
      const wallMaterial = toon(theme.accent);
      const thickness = 0.8;
      const height = 0.9;
      const layout = [
        { x: 0, z: -(span / 2 + thickness / 2), sx: span + thickness * 2, sz: thickness },
        { x: 0, z: (span / 2 + thickness / 2), sx: span + thickness * 2, sz: thickness },
        { x: -(span / 2 + thickness / 2), z: 0, sx: thickness, sz: span },
        { x: (span / 2 + thickness / 2), z: 0, sx: thickness, sz: span },
      ];
      for (const item of layout) {
        const wall = new THREE.Mesh(geo.slab, wallMaterial);
        wall.scale.set(item.sx, height, item.sz);
        wall.position.set(item.x, height / 2, item.z);
        wall.castShadow = shadows;
        wall.receiveShadow = shadows;
        arena.add(wall);
        wallMeshes.push(wall);
      }

      // Rounded corner caps, so the border doesn't look like four raw boxes
      const capMaterial = toon(theme.accent2);
      const corner = span / 2 + thickness / 2;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const cap = new THREE.Mesh(geo.segment, capMaterial);
          cap.scale.setScalar(thickness * 1.35);
          cap.position.set(sx * corner, height * 0.5, sz * corner);
          cap.castShadow = shadows;
          arena.add(cap);
          wallMeshes.push(cap);
        }
      }
    }

    /* ================================================================== *
     * The noodle
     * ================================================================== */

    const snakeGroup = new THREE.Group();
    scene.add(snakeGroup);

    const segmentPool = [];
    let bodyMaterial = toon('#FFD23F');
    let bellyMaterial = toon('#FFF4CF');

    function getSegment(index) {
      if (segmentPool[index]) return segmentPool[index];
      const mesh = new THREE.Mesh(geo.segment, bodyMaterial);
      mesh.castShadow = shadows;
      mesh.visible = false;
      snakeGroup.add(mesh);
      segmentPool[index] = mesh;
      return mesh;
    }

    // The head is a little rig: skull, two eyes, two pupils, a mouth and brows
    const head = new THREE.Group();
    const headSkull = new THREE.Mesh(geo.segment, bodyMaterial);
    headSkull.castShadow = shadows;
    head.add(headSkull);

    const eyes = [];
    const pupils = [];
    for (let i = 0; i < 2; i += 1) {
      const eye = new THREE.Mesh(geo.eye, basic('#FFFFFF'));
      const pupil = new THREE.Mesh(geo.pupil, basic('#241826'));
      head.add(eye);
      head.add(pupil);
      eyes.push(eye);
      pupils.push(pupil);
    }

    const mouth = new THREE.Mesh(geo.mouth, basic('#E0426B'));
    head.add(mouth);

    const tongue = new THREE.Mesh(geo.tiny, basic('#FF7DA0'));
    head.add(tongue);

    const cheeks = [];
    for (let i = 0; i < 2; i += 1) {
      const cheek = new THREE.Mesh(geo.tiny, basic('#FF7DA0', { transparent: true, opacity: 0.55 }));
      head.add(cheek);
      cheeks.push(cheek);
    }
    snakeGroup.add(head);

    /* ================================================================== *
     * The best-run ghost
     *
     * A separate pool of translucent spheres. It is fed positions by
     * main.js and has no access to any engine, so it cannot influence the
     * live simulation in any way.
     * ================================================================== */

    const ghostGroup = new THREE.Group();
    scene.add(ghostGroup);
    const ghostPool = [];
    let ghostView = null;

    const ghostMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffffff),
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });

    function getGhostSegment(index) {
      if (ghostPool[index]) return ghostPool[index];
      if (index >= MAX_SEGMENTS) return null;
      const mesh = new THREE.Mesh(geo.segment, ghostMaterial);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.visible = false;
      ghostGroup.add(mesh);
      ghostPool[index] = mesh;
      return mesh;
    }

    function layoutGhost() {
      for (let i = 0; i < ghostPool.length; i += 1) {
        if (ghostPool[i]) ghostPool[i].visible = false;
      }
      if (!ghostView || !ghostView.snake || ghostView.snake.length === 0) return;

      const count = ghostView.snake.length;
      for (let i = 0; i < count && i < MAX_SEGMENTS; i += 1) {
        const segment = ghostView.snake[i];
        const previous = ghostView.previousSnake[i] || segment;
        let px = previous.x;
        let py = previous.y;
        if (Math.abs(segment.x - px) > 1) px = segment.x;
        if (Math.abs(segment.y - py) > 1) py = segment.y;

        const mesh = getGhostSegment(i);
        if (!mesh) break;
        const along = count === 1 ? 0 : i / (count - 1);
        mesh.visible = true;
        mesh.scale.setScalar(0.66 - Math.pow(along, 0.8) * 0.3);
        mesh.position.set(
          worldX(px + (segment.x - px) * ghostView.alpha),
          0.5,
          worldZ(py + (segment.y - py) * ghostView.alpha)
        );
      }
    }

    /* ================================================================== *
     * Food — one procedural group per type, built lazily and reused
     * ================================================================== */

    const foodGroup = new THREE.Group();
    scene.add(foodGroup);
    const foodModels = new Array(NS.FOOD_TYPES).fill(null);

    function addPart(parent, geometry, material, position, scale, rotation) {
      const mesh = new THREE.Mesh(geometry, material);
      if (position) mesh.position.set(position[0], position[1], position[2]);
      if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
      if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
      mesh.castShadow = shadows;
      parent.add(mesh);
      return mesh;
    }

    const FOOD_BUILDERS = {
      pizza(group) {
        // A wedge of cylinder, cheese on top, pepperoni, one olive
        addPart(group, geo.wedge, toon('#F2C266'), [0, 0, 0], [0.86, 0.14, 0.86],
          [0, Math.PI * 0.2, 0]);
        addPart(group, geo.wedge, toon('#FFD98A'), [0, 0.09, 0], [0.8, 0.06, 0.8],
          [0, Math.PI * 0.2, 0]);
        addPart(group, geo.cylinder, toon('#E23B3B'), [0.14, 0.15, 0.1], [0.12, 0.05, 0.12]);
        addPart(group, geo.cylinder, toon('#E23B3B'), [-0.05, 0.15, 0.22], [0.1, 0.05, 0.1]);
        addPart(group, geo.tiny, toon('#3C7A3C'), [0.2, 0.16, -0.1], [0.08, 0.08, 0.08]);
      },

      burger(group) {
        addPart(group, geo.cylinder, toon('#E3A45C'), [0, -0.2, 0], [0.78, 0.18, 0.78]);
        addPart(group, geo.cylinder, toon('#7B4326'), [0, -0.04, 0], [0.82, 0.16, 0.82]);
        addPart(group, geo.slab, toon('#FFC21F'), [0, 0.07, 0], [0.86, 0.04, 0.86],
          [0, 0.4, 0]);
        addPart(group, geo.cylinder, toon('#6BBF3A'), [0, 0.14, 0], [0.86, 0.06, 0.86]);
        // Top bun: a squashed sphere, slightly askew
        const bun = addPart(group, geo.segment, toon('#F0B462'), [0.03, 0.3, 0],
          [0.82, 0.5, 0.82]);
        bun.rotation.z = 0.12;
        addPart(group, geo.tiny, basic('#FFF0D0'), [0.1, 0.46, 0.12], [0.06, 0.04, 0.06]);
        addPart(group, geo.tiny, basic('#FFF0D0'), [-0.14, 0.44, -0.06], [0.06, 0.04, 0.06]);
      },

      donut(group) {
        addPart(group, geo.torus, toon('#E8A85C'), [0, 0, 0], [1, 1, 1],
          [Math.PI / 2, 0, 0]);
        addPart(group, geo.torus, toon('#FF8FC5'), [0, 0.06, 0], [1.01, 1.01, 0.85],
          [Math.PI / 2, 0, 0]);
        const sprinkleColors = ['#5BD1C4', '#FFE08A', '#7CFF8E', '#FFFFFF', '#FF6B6B'];
        for (let i = 0; i < 6; i += 1) {
          const angle = (i / 6) * Math.PI * 2;
          addPart(group, geo.slab, basic(sprinkleColors[i % sprinkleColors.length]),
            [Math.cos(angle) * 0.34, 0.15, Math.sin(angle) * 0.34],
            [0.1, 0.03, 0.03], [0, -angle + i, 0]);
        }
      },

      banana(group) {
        // Five shrinking spheres along an arc make a convincing cartoon banana
        for (let i = 0; i < 6; i += 1) {
          const t = i / 5;
          const angle = Math.PI * (0.18 + t * 0.64);
          const radius = 0.62;
          const taper = 0.3 - Math.abs(t - 0.5) * 0.24;
          addPart(group, geo.segment, toon('#FFE14D'),
            [Math.cos(angle) * radius, Math.sin(angle) * radius - 0.3, 0],
            [taper + 0.1, taper, taper + 0.1]);
        }
        addPart(group, geo.cylinder, toon('#6B4A1F'),
          [Math.cos(Math.PI * 0.18) * 0.62, Math.sin(Math.PI * 0.18) * 0.62 - 0.22, 0],
          [0.06, 0.2, 0.06], [0, 0, -0.5]);
      },

      taco(group) {
        // Half a cylinder on its side is a taco shell
        const shell = addPart(group, geo.cylinder, toon('#F2B233'), [0, 0.06, 0],
          [0.78, 0.72, 0.78], [0, 0, Math.PI / 2]);
        shell.scale.set(0.78, 0.72, 0.78);
        addPart(group, geo.segment, toon('#7BC043'), [0, 0.2, 0.16], [0.4, 0.2, 0.3]);
        addPart(group, geo.segment, toon('#E94F37'), [0.1, 0.24, -0.14], [0.22, 0.16, 0.22]);
        addPart(group, geo.segment, toon('#8B5A2B'), [-0.1, 0.16, -0.02], [0.4, 0.18, 0.3]);
      },

      fries(group) {
        addPart(group, geo.cylinder, toon('#E03B3B'), [0, -0.12, 0], [0.5, 0.42, 0.5]);
        addPart(group, geo.slab, basic('#FFF0E0'), [0, -0.1, 0.26], [0.6, 0.16, 0.02]);
        const layout = [[-0.16, 0.1, -0.1], [0.05, 0.02, 0.16], [0.16, -0.06, 0.28],
          [-0.05, 0.14, 0.04], [0.1, -0.16, 0.1]];
        for (let i = 0; i < layout.length; i += 1) {
          const [x, z, lean] = layout[i];
          addPart(group, geo.slab, toon('#FFD470'), [x, 0.3, z], [0.1, 0.62, 0.1],
            [lean, 0, lean * 0.6]);
        }
      },

      apple(group) {
        const body = addPart(group, geo.segment, toon('#E93B4E'), [0, 0, 0], [0.76, 0.8, 0.76]);
        body.scale.set(0.78, 0.82, 0.78);
        addPart(group, geo.cylinder, toon('#6B4A1F'), [0, 0.44, 0], [0.05, 0.3, 0.05],
          [0, 0, 0.18]);
        addPart(group, geo.segment, toon('#5BB03A'), [0.18, 0.5, 0], [0.22, 0.05, 0.12],
          [0, 0, 0.4]);
      },

      cake(group) {
        addPart(group, geo.wedge, toon('#E8B873'), [0, -0.16, 0], [0.8, 0.2, 0.8]);
        addPart(group, geo.wedge, toon('#FFF2E0'), [0, -0.04, 0], [0.81, 0.06, 0.81]);
        addPart(group, geo.wedge, toon('#F2C98A'), [0, 0.08, 0], [0.8, 0.2, 0.8]);
        addPart(group, geo.wedge, toon('#FF7FB0'), [0, 0.22, 0], [0.82, 0.08, 0.82]);
        addPart(group, geo.segment, toon('#E02040'), [0.1, 0.34, 0.1], [0.16, 0.16, 0.16]);
      },
    };

    function getFoodModel(type) {
      if (foodModels[type]) return foodModels[type];
      const catalogue = NS.FOOD_CATALOGUE[type] || NS.FOOD_CATALOGUE[0];
      const group = new THREE.Group();
      const builder = FOOD_BUILDERS[catalogue.id];
      if (builder) builder(group);
      group.visible = false;
      foodGroup.add(group);
      foodModels[type] = group;
      return group;
    }

    /* ================================================================== *
     * Obstacles
     * ================================================================== */

    const obstacleGroup = new THREE.Group();
    scene.add(obstacleGroup);
    const obstaclePool = [];

    function getObstacle(index) {
      if (obstaclePool[index]) return obstaclePool[index];
      if (index >= MAX_OBSTACLES) return null;
      const mesh = new THREE.Mesh(geo.cylinder, toon('#6B5B8A'));
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      mesh.visible = false;
      obstacleGroup.add(mesh);
      obstaclePool[index] = mesh;
      return mesh;
    }

    /* ================================================================== *
     * Particles — one pooled Points cloud, positions updated on the CPU
     * ================================================================== */

    const particleData = [];
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      particleData.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, decay: 1, size: 1 });
    }
    let liveParticles = 0;

    const particlePositions = new Float32Array(MAX_PARTICLES * 3);
    const particleColors = new Float32Array(MAX_PARTICLES * 3);
    const particleSizes = new Float32Array(MAX_PARTICLES);
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
    particleGeometry.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));
    particleGeometry.setDrawRange(0, 0);

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.32,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const particleCloud = new THREE.Points(particleGeometry, particleMaterial);
    particleCloud.frustumCulled = false;
    scene.add(particleCloud);

    const tempColor = new THREE.Color();

    function emitParticles(count, x, y, z, color, spread, lift) {
      if (reduced) return;
      tempColor.set(color);
      for (let i = 0; i < count; i += 1) {
        if (liveParticles >= MAX_PARTICLES) return;
        const p = particleData[liveParticles];
        const angle = Math.random() * Math.PI * 2;
        const pitch = Math.random() * Math.PI * 0.5;
        const speed = spread * (0.4 + Math.random() * 0.9);
        p.x = x;
        p.y = y;
        p.z = z;
        p.vx = Math.cos(angle) * Math.cos(pitch) * speed;
        p.vy = Math.sin(pitch) * speed + lift;
        p.vz = Math.sin(angle) * Math.cos(pitch) * speed;
        p.life = 1;
        p.decay = 0.9 + Math.random() * 0.8;
        p.size = 0.6 + Math.random() * 0.8;

        const index = liveParticles * 3;
        particleColors[index] = tempColor.r;
        particleColors[index + 1] = tempColor.g;
        particleColors[index + 2] = tempColor.b;
        liveParticles += 1;
      }
    }

    function updateParticles(deltaMs) {
      if (liveParticles === 0) {
        particleGeometry.setDrawRange(0, 0);
        return;
      }
      const seconds = Math.min(deltaMs, 64) / 1000;
      for (let i = liveParticles - 1; i >= 0; i -= 1) {
        const p = particleData[i];
        p.vy -= 9.5 * seconds;
        p.x += p.vx * seconds;
        p.y += p.vy * seconds;
        p.z += p.vz * seconds;
        p.life -= p.decay * seconds;

        if (p.life <= 0 || p.y < -1) {
          // Swap-remove, carrying the colour with it
          liveParticles -= 1;
          const from = liveParticles * 3;
          const to = i * 3;
          particleData[i] = particleData[liveParticles];
          particleData[liveParticles] = p;
          particleColors[to] = particleColors[from];
          particleColors[to + 1] = particleColors[from + 1];
          particleColors[to + 2] = particleColors[from + 2];
        }
      }
      for (let i = 0; i < liveParticles; i += 1) {
        const p = particleData[i];
        const index = i * 3;
        particlePositions[index] = p.x;
        particlePositions[index + 1] = p.y;
        particlePositions[index + 2] = p.z;
        particleSizes[i] = p.size * Math.max(p.life, 0);
      }
      particleGeometry.attributes.position.needsUpdate = true;
      particleGeometry.attributes.color.needsUpdate = true;
      particleGeometry.attributes.size.needsUpdate = true;
      particleGeometry.setDrawRange(0, liveParticles);
    }

    /* ================================================================== *
     * Per-frame presentation state
     * ================================================================== */

    let theme = NS.THEMES.noodle;
    let foodKey = '';
    let foodShownAt = 0;
    let eatFx = null;
    let shake = 0;
    let deathTilt = 0;
    let built = false;

    function applyTheme(next) {
      theme = next;

      bodyMaterial.color.set(theme.body);
      bellyMaterial.color.set(theme.belly);
      mouth.material.color.set(theme.tongue);
      tongue.material.color.set(theme.cheek);
      for (const cheek of cheeks) cheek.material.color.set(theme.cheek);
      for (const pupil of pupils) pupil.material.color.set(theme.ink);

      if (!built) return;

      // Tiles are geometry now, so a theme change is two material swaps
      if (tilesLight) tilesLight.material = toon(theme.board1);
      if (tilesDark) tilesDark.material = toon(theme.board2);

      baseMesh.material = toon(theme.board2);
      const wallMaterial = toon(theme.accent);
      const capMaterial = toon(theme.accent2);
      for (let i = 0; i < wallMeshes.length; i += 1) {
        wallMeshes[i].material = i < 4 ? wallMaterial : capMaterial;
      }
      scene.background = new THREE.Color(theme.board2).multiplyScalar(0.55);
      scene.fog = new THREE.Fog(scene.background, grid * 1.4, grid * 3.1);
    }

    /* ================================================================== *
     * Drawing one frame
     * ================================================================== */

    function layoutSnake(state, alpha, now, face) {
      const count = state.snake.length;

      // The head rig sits on segment 0; the pool draws the rest
      for (let i = 0; i < segmentPool.length; i += 1) {
        if (segmentPool[i]) segmentPool[i].visible = false;
      }

      let headX = 0;
      let headZ = 0;
      // Previous segment world positions, for the perpendicular sway
      const trail = [];

      for (let i = 0; i < count && i < MAX_SEGMENTS; i += 1) {
        const segment = state.snake[i];
        const previous = state.previousSnake[i] || segment;
        let px = previous.x;
        let py = previous.y;
        // A wrap teleports a segment — snap rather than smear it across the board
        if (Math.abs(segment.x - px) > 1) px = segment.x;
        if (Math.abs(segment.y - py) > 1) py = segment.y;

        const gx = px + (segment.x - px) * alpha;
        const gy = py + (segment.y - py) * alpha;
        const x = worldX(gx);
        const z = worldZ(gy);

        // Taper from neck to tail
        const along = count === 1 ? 0 : i / (count - 1);
        let radius = 0.84 - Math.pow(along, 0.8) * 0.42;

        // The swallow-bulge sliding down the body
        if (face.grow > 0) {
          const bulgeAt = face.grow * (count + 2);
          const distance = Math.abs(i - bulgeAt);
          if (distance < 2.2) {
            radius *= 1 + 0.42 * Math.cos((distance / 2.2) * (Math.PI / 2));
          }
        }

        /*
         * A travelling wave down the body. The vertical half is what sells
         * the third dimension: segments lift off the floor and settle back,
         * so the noodle rides over itself and drags its shadow with it.
         * Lift is one-sided (the floor is solid, so it can only go up) and
         * each segment rests at its own radius, which keeps the thin tail on
         * the ground instead of floating.
         */
        const phase = now / 150 - i * 0.55;
        const intensity = 0.45 + 0.55 * face.speed;
        const lift = reduced ? 0
          : (Math.sin(phase) * 0.5 + 0.5) * 0.3 * intensity;
        const sway = reduced ? 0 : Math.sin(phase) * 0.1 * intensity;
        const y = radius + lift;

        // Sway across the direction of travel, rather than always along z
        let sideX = 0;
        let sideZ = 0;
        if (i > 0 && trail[i - 1]) {
          const dx = trail[i - 1].x - x;
          const dz = trail[i - 1].z - z;
          const length = Math.hypot(dx, dz) || 1;
          sideX = -dz / length;
          sideZ = dx / length;
        }
        trail[i] = { x, z };

        if (i === 0) {
          headX = x;
          headZ = z;
          head.position.set(x, y + 0.06, z);
          headSkull.scale.setScalar(radius * 1.16);
        } else {
          const mesh = getSegment(i);
          mesh.visible = true;
          mesh.material = bodyMaterial;
          mesh.position.set(x + sideX * sway, y, z + sideZ * sway);
          mesh.scale.setScalar(radius);
        }
      }

      return { x: headX, z: headZ };
    }

    function layoutFace(face, now) {
      const dir = face.dir || { x: 1, y: 0 };
      // Face the direction of travel; z is "down" on the grid
      const yaw = Math.atan2(dir.x, dir.y);
      head.rotation.y = yaw;

      const dead = face.dead;
      const r = headSkull.scale.x * 0.5;

      // Squash and stretch while chewing
      const chew = face.chew;
      headSkull.scale.y = headSkull.scale.x * (1 - chew * 0.16);
      headSkull.scale.z = headSkull.scale.x * (1 + chew * 0.1);

      const eyeForward = r * 0.72;
      const eyeSide = r * 0.46;
      const eyeHeight = r * 0.34;
      const wide = face.expression === 'fast' || face.expression === 'hungry';
      const eyeScale = r * (wide ? 0.46 : 0.38);
      const pupilScale = r * (wide ? 0.13 : 0.19);

      for (let i = 0; i < 2; i += 1) {
        const side = i === 0 ? -1 : 1;
        const lid = clamp(1 - face.blink, 0.08, 1);

        eyes[i].position.set(side * eyeSide, eyeHeight, eyeForward);
        eyes[i].scale.set(eyeScale, eyeScale * lid, eyeScale * 0.7);
        eyes[i].visible = !dead;

        // Pupils slide toward the heading and toward nearby food
        const lookX = clamp(face.look.x * 0.5, -1, 1);
        const lookY = clamp(-face.look.y * 0.5, -1, 1);
        pupils[i].position.set(
          side * eyeSide + lookX * eyeScale * 0.5,
          eyeHeight + lookY * eyeScale * 0.5,
          eyeForward + eyeScale * 0.42
        );
        pupils[i].scale.setScalar(pupilScale * lid);
        pupils[i].visible = !dead && face.blink < 0.75;

        cheeks[i].position.set(side * (eyeSide + r * 0.24), -r * 0.1, eyeForward * 0.72);
        cheeks[i].scale.set(r * 0.3, r * 0.2, r * 0.12);
        cheeks[i].visible = !dead;
        cheeks[i].material.opacity = face.expression === 'eating' ? 0.75 : 0.45;
      }

      // Dead: the eyes become crossed-out slabs
      if (dead) {
        for (let i = 0; i < 2; i += 1) {
          const side = i === 0 ? -1 : 1;
          eyes[i].visible = true;
          eyes[i].position.set(side * eyeSide, eyeHeight, eyeForward);
          eyes[i].scale.set(eyeScale * 0.9, eyeScale * 0.16, eyeScale * 0.5);
          eyes[i].rotation.z = side * 0.7;
          pupils[i].visible = true;
          pupils[i].position.copy(eyes[i].position);
          pupils[i].scale.set(eyeScale * 0.9, eyeScale * 0.16, eyeScale * 0.5);
          pupils[i].rotation.z = -side * 0.7;
        }
      } else {
        for (let i = 0; i < 2; i += 1) {
          eyes[i].rotation.z = 0;
          pupils[i].rotation.z = 0;
        }
      }

      // Mouth: open while chewing, a small line otherwise
      const open = dead ? 0.5 : (0.12 + chew * 0.5);
      mouth.position.set(0, -r * 0.34, eyeForward * 0.92);
      mouth.scale.set(r * 0.46, r * open, r * 0.3);
      mouth.visible = true;

      const tongueOut = face.tongue;
      tongue.visible = tongueOut > 0.05;
      if (tongue.visible) {
        tongue.position.set(0, -r * (0.44 + tongueOut * 0.2), eyeForward * 1.02);
        tongue.scale.set(r * 0.24, r * 0.16, r * 0.24 * (1 + tongueOut));
      }
    }

    function layoutFood(state, now) {
      const key = `${state.food.x},${state.food.y},${state.food.type}`;
      if (key !== foodKey) {
        foodKey = key;
        foodShownAt = now;
      }

      for (let i = 0; i < foodModels.length; i += 1) {
        if (foodModels[i]) foodModels[i].visible = false;
      }

      const model = getFoodModel(state.food.type);
      model.visible = true;

      const x = worldX(state.food.x);
      const z = worldZ(state.food.y);
      const age = clamp((now - foodShownAt) / 300, 0, 1);
      const pop = reduced ? 1 : easeOutBack(age);
      const float = reduced ? 0 : Math.sin(now / 420) * 0.12;

      model.position.set(x, 0.72 + float, z);
      model.rotation.y = reduced ? 0 : now / 1400;
      model.rotation.z = reduced ? 0 : Math.sin(now / 900) * 0.08;
      model.scale.setScalar(0.92 * pop);

      foodGlow.position.set(x, 1.7, z);
      foodGlow.color.set(theme.accent);

      // The pop ghost of whatever was just eaten
      if (eatFx) {
        const fxAge = (now - eatFx.at) / 300;
        if (fxAge >= 1) {
          eatFx.model.visible = false;
          eatFx = null;
        } else if (eatFx.model !== model) {
          eatFx.model.visible = true;
          eatFx.model.position.set(eatFx.x, 0.8 + fxAge * 0.9, eatFx.z);
          eatFx.model.scale.setScalar(0.92 * (1 + easeOutCubic(fxAge) * 1.1));
          eatFx.model.rotation.y += 0.08;
        }
      }
    }

    function layoutObstacles(state) {
      for (let i = 0; i < obstaclePool.length; i += 1) {
        if (obstaclePool[i]) obstaclePool[i].visible = false;
      }
      for (let i = 0; i < state.obstacles.length && i < MAX_OBSTACLES; i += 1) {
        const mesh = getObstacle(i);
        if (!mesh) break;
        const block = state.obstacles[i];
        mesh.visible = true;
        mesh.scale.set(0.78, 1.05, 0.78);
        mesh.position.set(worldX(block.x), 0.52, worldZ(block.y));
      }
    }

    function updateCamera(headPosition, deltaMs, state) {
      // A gentle follow: the camera drifts toward the noodle without ever
      // losing the whole arena. Deliberately subtle — no motion sickness.
      // Kept small on purpose: at a lower camera angle the drift reads much
      // more strongly, and it has to stay inside the framing margin.
      const follow = reduced ? 0 : 0.15;
      desiredTarget.set(headPosition.x * follow, 0, headPosition.z * follow);
      desiredPosition.copy(CAMERA_HOME);
      desiredPosition.x += headPosition.x * follow * 0.6;
      desiredPosition.z += headPosition.z * follow * 0.4;

      const ease = Math.min(1, deltaMs / 260);
      cameraTarget.lerp(desiredTarget, ease);
      camera.position.lerp(desiredPosition, ease);

      if (shake > 0) {
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake * 0.6;
      }

      camera.lookAt(cameraTarget);

      // On death the whole arena tips very slightly, like a dropped tray
      arena.rotation.z = deathTilt * 0.035;
      snakeGroup.rotation.z = deathTilt * 0.035;
    }

    /* ================================================================== *
     * Public interface
     * ================================================================== */

    return {
      id: '3d',
      label: '3D',

      mount() {
        if (built) return;
        buildArena(theme);
        applyTheme(theme);
        built = true;
      },

      setTheme(next) {
        applyTheme(next);
      },

      resize(size, ratio) {
        const px = Math.max(1, Math.round(size));
        renderer.setPixelRatio(Math.min(ratio || 1, 2));
        renderer.setSize(px, px, false);
        camera.aspect = 1;
        camera.updateProjectionMatrix();
      },

      update(deltaMs) {
        updateParticles(deltaMs);
        if (shake > 0) shake = Math.max(0, shake - deltaMs / 420);
        if (deathTilt > 0) deathTilt = Math.max(0, deathTilt - deltaMs / 2600);
      },

      render(engine, now, deltaMs) {
        const state = engine.state;
        const face = NS.noodleFace(state, now, reduced);

        layoutGhost();
        const headPosition = layoutSnake(state, engine.alpha(), now, face);
        layoutFace(face, now);
        layoutFood(state, now);
        layoutObstacles(state);
        updateCamera(headPosition, deltaMs || 16, state);

        renderer.render(scene, camera);
      },

      /* ------------------------------------------------------------ juice */

      /** @param {object|null} view positions only; never an engine */
      setGhost(view) {
        ghostView = view;
      },

      onEat(payload) {
        const catalogue = NS.FOOD_CATALOGUE[payload.type] || NS.FOOD_CATALOGUE[0];
        const x = worldX(payload.at.x);
        const z = worldZ(payload.at.y);

        // Reuse the model that was just eaten as its own pop ghost
        const model = foodModels[payload.type];
        if (model) eatFx = { model, x, z, at: payload.now };

        emitParticles(14, x, 0.8, z, catalogue.crumb, 4.2, 2.4);
        shake = reduced ? 0 : 0.06;
      },

      onLevel(payload) {
        const head = payload.head;
        emitParticles(16, worldX(head.x), 1, worldZ(head.y), theme.accent2, 5, 3.4);
      },

      onDeath(payload) {
        shake = reduced ? 0 : 0.55;
        deathTilt = reduced ? 0 : 1;
        if (payload.cause === 'win') return;
        const head = payload.head;
        emitParticles(26, worldX(head.x), 0.8, worldZ(head.y), theme.body, 6.5, 3.2);
      },

      onRecord() {
        for (let i = 0; i < 4; i += 1) {
          emitParticles(10, (Math.random() - 0.5) * grid * 0.6, grid * 0.35,
            (Math.random() - 0.5) * grid * 0.6,
            ['#FFD23F', '#FF8A3D', '#5BD1C4', '#B388FF'][i], 3, 1.2);
        }
      },

      onReset() {
        ghostView = null;
        liveParticles = 0;
        particleGeometry.setDrawRange(0, 0);
        shake = 0;
        deathTilt = 0;
        eatFx = null;
        foodKey = '';
        camera.position.copy(CAMERA_HOME);
        cameraTarget.set(0, 0, 0);
        arena.rotation.z = 0;
        snakeGroup.rotation.z = 0;
      },

      dispose() {
        scene.traverse((object) => {
          if (object.isMesh || object.isPoints) {
            if (object.geometry && object.geometry.dispose) object.geometry.dispose();
          }
        });
        for (const key of Object.keys(geo)) geo[key].dispose();
        materialCache.forEach((material) => material.dispose());
        materialCache.clear();
        if (tilesLight) tilesLight.dispose();
        if (tilesDark) tilesDark.dispose();
        ghostMaterial.dispose();
        particleGeometry.dispose();
        particleMaterial.dispose();
        renderer.dispose();
      },
    };
  };
}(window.HungryNoodle));
