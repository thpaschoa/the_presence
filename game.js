// ========== CENÁRIO E RENDER ==========
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x111111, 5, 30);
scene.background = new THREE.Color(0x111111);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.style.display = "none";
document.body.appendChild(renderer.domElement);

// ========== VARIÁVEIS ==========
let gameStarted = false;
let gamePaused = false;
let pauseAnimationFrame = null;
let batteryInterval = null;
let firstStart = true;
let walkTime = 0;
const visitedCells = new Set();
const collectibleBatteries = [];
let ghostWrapper = null;
let ghostLight = null;
let ghostMixer = null;
let ghostWaypoints = [];
let ghostTargetIndex = 0;
const clock = new THREE.Clock(); // ← Para animações
let globalVolume = 1;
let difficultyLevel = 0;
const BATTERY_LOW_THRESHOLD = 10; // ← Limite de bateria para aviso
let lowBatterySoundPlayed = false;
let dangerStartTime = null;
let gameOverTriggered = false;
let waitingForSafeDistance = false;


// ========== SOM ==========
const ambientSound = new Audio('sounds/owlandtheharvestmoon.wav');
ambientSound.loop = true;
ambientSound.volume = globalVolume * 0.25;

const batterySound = new Audio('sounds/collect_battery.wav');
batterySound.volume = globalVolume * 0.5;

const radioSound = new Audio('sounds/collect_radio2.wav');
radioSound.volume = globalVolume * 0.5;

const footstepsSound = new Audio('sounds/grass_footsteps.wav');
footstepsSound.loop = true; // contínuo enquanto anda
footstepsSound.volume = globalVolume * 0.7;
footstepsSound.playbackRate = 1.3; // 👈 Acelerado

const lowBatterySound = new Audio('sounds/low_battery.m4a');
lowBatterySound.volume = globalVolume * 0.5;

const ghostSound = new Audio('sounds/ghost.wav');
ghostSound.loop = true;
ghostSound.volume = 0; // começa sem som

const endingSound1 = new Audio('sounds/sos.wav');
const endingSound2 = new Audio('sounds/voices.wav');
// ajuste o volume se quiser
endingSound1.volume = globalVolume * 0.1;
endingSound2.volume = globalVolume * 0.25;

// 🎚️ Controle de volume
document.getElementById("volume-slider").addEventListener("input", (e) => {
  globalVolume = e.target.value / 100;
  ambientSound.volume = globalVolume * 0.25;
  batterySound.volume = globalVolume * 0.5;
  radioSound.volume = globalVolume * 0.5;
  footstepsSound.volume = globalVolume * 0.7;
  lowBatterySound.volume = globalVolume * 0.5;
  ghostSound.volume = 0; // Fantasma começa sem som
  endingSound1.volume = globalVolume * 0.1;
  endingSound2.volume = globalVolume * 0.25;
});


// [GRID] Colisão otimizada
const CELL_SIZE = 3; // valor padrão = 10
const QUADRANT_SIZE = 25;
const MAX_QUAD_INDEX = 19;
const obstacleGrid = new Map();

function getCellKey(x, z) {
  const cellX = Math.floor(x / CELL_SIZE);
  const cellZ = Math.floor(z / CELL_SIZE);
  return `${cellX},${cellZ}`;
}

function isInHouseZone(x, z) {
  const dx = x + 180;
  const dz = z + 180;
  return Math.sqrt(dx * dx + dz * dz) < 15;
}


function addObstacle(obj, x, z) {
  const key = getCellKey(x, z);
  if (!obstacleGrid.has(key)) {
    obstacleGrid.set(key, []);
  }
  obstacleGrid.get(key).push(obj);
}

function removeObstacle(obj, x, z) {
  const key = getCellKey(x, z);
  if (obstacleGrid.has(key)) {
    const cell = obstacleGrid.get(key);
    const index = cell.indexOf(obj);
    if (index !== -1) {
      cell.splice(index, 1);
      if (cell.length === 0) {
        obstacleGrid.delete(key);
      }
    }
  }
}

// ========== CÂMERA ==========
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.y = 3;

const cameraHolder = new THREE.Object3D();
cameraHolder.add(camera);
scene.add(cameraHolder);

// ========== LUZES ==========
const ambientLight = new THREE.AmbientLight(0x222222, 0.2);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0x444488, 0.3);
directionalLight.position.set(5, 10, 5);
scene.add(directionalLight);

const flashlight = new THREE.SpotLight(0xF5DEB3, 10, 75, Math.PI / 5, 1, 1);
flashlight.castShadow = true;
scene.add(flashlight);

// const flashlightHelper = new THREE.SpotLightHelper(flashlight);
// scene.add(flashlightHelper); // ← Apenas para desenvolvimento

// ========== TEXTURAS ==========
const textureLoader = new THREE.TextureLoader();
const groundTexture = textureLoader.load('images/chao.jpg');
groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
groundTexture.repeat.set(40, 40);

const trunkTexture = textureLoader.load('images/tronco.jpg');
trunkTexture.wrapS = trunkTexture.wrapT = THREE.RepeatWrapping;
trunkTexture.repeat.set(1, 2);

const fenceTexture = textureLoader.load('images/cerca.png');
fenceTexture.wrapS = THREE.RepeatWrapping;
fenceTexture.wrapT = THREE.ClampToEdgeWrapping;
fenceTexture.repeat.set(1, 1);

const fenceMaterial = new THREE.MeshStandardMaterial({
  map: fenceTexture,
  transparent: true,
  side: THREE.DoubleSide,
  color: 0xbbbbbb,
  metalness: 0,
  roughness: 0.9
});

// ========== CHÃO ==========
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(500, 500),
  new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 0.9 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// ========== PEÇAS ESPECIAIS ==========
const specialParts = [
  { name: "Speaker", model: "models/generic_speaker.glb", scale: [0.02, 0.02, 0.02] },
  { name: "Headset", model: "models/headset.glb", scale: [0.5, 0.5, 0.5] },
  { name: "Board", model: "models/line_follower_robot_control_board.glb", scale: [0.15, 0.15, 0.15] },
  { name: "BatteryPSX", model: "models/battery_psx_style.glb", scale: [1.25, 1.25, 1.25] },
  { name: "Antenna", model: "models/antenadehielo_cable_2.glb", scale: [0.01, 0.01, 0.01] }
];

const specialItems = [];
const specialItemPositions = []; // ← usado para impedir árvores próximas

// ========== FLORESTA ==========
function createSeededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return function () {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

const leavesMaterial = new THREE.MeshLambertMaterial({ color: 0x226622 });

/*function createTree(x, z) {
  const trunkMaterial = new THREE.MeshLambertMaterial({ map: trunkTexture });
  const trunkHeight = Math.random() * 10 + 10;
  const trunkRadius = Math.random() * 0.4 + 0.4;

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(trunkRadius, trunkRadius, trunkHeight, 8),
    trunkMaterial
  );
  trunk.position.set(x, trunkHeight / 2, z);

  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(1.5, 3, 6),
    leavesMaterial
  );
  leaves.position.set(x, trunkHeight + 1, z);

  scene.add(trunk);
  scene.add(leaves);
  addObstacle(trunk, x, z);
}*/

const seed_floresta = Date.now();  // Gera uma floresta nova toda vez
const rng = createSeededRandom(seed_floresta);

const forestChunks = new Map();

function getQuadrantKey(x, z) {
  const qx = Math.floor((x + 250) / QUADRANT_SIZE); // +250 para transformar -250~250 em 0~500
  const qz = Math.floor((z + 250) / QUADRANT_SIZE);
  return `${qx},${qz}`; // exemplo: "2,3"
}

function getSurroundingQuadrants(x, z) {
  const centerX = Math.floor((x + 250) / QUADRANT_SIZE);
  const centerZ = Math.floor((z + 250) / QUADRANT_SIZE);
  const keys = [];

  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const qx = centerX + dx;
      const qz = centerZ + dz;
      if (qx >= 0 && qx <= MAX_QUAD_INDEX && qz >= 0 && qz <= MAX_QUAD_INDEX) {
        keys.push(`${qx},${qz}`);
      }
    }
  }

  return keys;
}

function createTreeObject(x, z) {
  const trunkMaterial = new THREE.MeshLambertMaterial({ map: trunkTexture });
  const trunkHeight = Math.random() * 10 + 10;
  const trunkRadius = Math.random() * 0.4 + 0.4;

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(trunkRadius, trunkRadius, trunkHeight, 8),
    trunkMaterial
  );
  trunk.position.y = trunkHeight / 2;

  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(1.5, 3, 6),
    leavesMaterial
  );
  leaves.position.y = trunkHeight + 1;

  const treeGroup = new THREE.Group();
  treeGroup.add(trunk);
  treeGroup.add(leaves);
  treeGroup.position.set(x, 0, z);
  treeGroup.userData.isTree = true;

  return treeGroup;
}

function createForest() {
  const spacing = 5;
  const size = 250;

  for (let x = -size; x < size; x += spacing) {
    for (let z = -size; z < size; z += spacing) {
      const distanceFromCenter = Math.sqrt(x * x + z * z);
      const isPath = distanceFromCenter < 12;

      if (!isPath && rng() > 0.3) {
        const posX = x + rng() * 0.5;
        const posZ = z + rng() * 0.5;

        if (isInHouseZone(posX, posZ)) continue;

      // Verifica se está longe o suficiente de cada peça especial
      let tooCloseToPart = specialItemPositions.some(p => {
        const dx = p.x - posX;
        const dz = p.z - posZ;
        return Math.sqrt(dx * dx + dz * dz) < 5;
      });

      if (tooCloseToPart) continue;

      const tree = createTreeObject(posX, posZ);
      const quadrant = getQuadrantKey(tree.position.x, tree.position.z);
      if (!forestChunks.has(quadrant)) forestChunks.set(quadrant, []);
      forestChunks.get(quadrant).push(tree);
      }
    }
  }
}

function distributeBatteries(probability = 0.1) {
  const batteryQuadrants = new Set();

  forestChunks.forEach((trees, quadrantKey) => {
    if (Math.random() < probability) {
      const [qx, qz] = quadrantKey.split(',').map(Number);

      // Verificar se algum vizinho já tem bateria
      let tooClose = false;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const neighborKey = `${qx + dx},${qz + dz}`;
          if (batteryQuadrants.has(neighborKey)) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) break;
      }

      if (tooClose) return; // pula esse quadrante

      // Tenta posicionar a bateria
      const centerX = qx * QUADRANT_SIZE - 250 + QUADRANT_SIZE / 2;
      const centerZ = qz * QUADRANT_SIZE - 250 + QUADRANT_SIZE / 2;
      const attempts = 5;
      let placed = false;

      for (let i = 0; i < attempts && !placed; i++) {
        const offsetX = (Math.random() - 0.5) * QUADRANT_SIZE;
        const offsetZ = (Math.random() - 0.5) * QUADRANT_SIZE;
        const posX = centerX + offsetX;
        const posZ = centerZ + offsetZ;
        if (isInHouseZone(posX, posZ)) continue;

        let isTooCloseToTree = false;
        for (const tree of trees) {
          const dx = tree.position.x - posX;
          const dz = tree.position.z - posZ;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < 5) {
            isTooCloseToTree = true;
            break;
          }
        }

        if (!isTooCloseToTree) {
          loadBatteryModel(posX, posZ);
          batteryQuadrants.add(quadrantKey); // registra esse quadrante
          placed = true;
        }
      }
    }
  });
}

function distributeSpecialParts(onFinish) {
  const regions = [
    { name: "NE", xMin: 0,     xMax: 250,  zMin: 0,     zMax: 250 },
    { name: "NW", xMin: -250,  xMax: 0,    zMin: 0,     zMax: 250 },
    { name: "SE", xMin: 0,     xMax: 250,  zMin: -250,  zMax: 0 },
    { name: "SW", xMin: -250,  xMax: 0,    zMin: -250,  zMax: 0 },
  ];

  const minPartDistance = 75;
  const minPlayerDistance = 75;

  const shuffledParts = [...specialParts].sort(() => Math.random() - 0.5);
  let loadedCount = 0;

  for (let i = 0; i < shuffledParts.length; i++) {
    const part = shuffledParts[i];

    // Escolher região: 1 por quadrante para os 4 primeiros
    const region = i < 4
      ? regions[i]
      : regions[Math.floor(Math.random() * regions.length)];

    let placed = false;

    while (!placed) {
      const posX = Math.random() * (region.xMax - region.xMin) + region.xMin;
      const posZ = Math.random() * (region.zMax - region.zMin) + region.zMin;
      if (isInHouseZone(posX, posZ)) continue; // evita a casa

      // Garante distância entre peças já colocadas
      const tooCloseToOtherPart = specialItemPositions.some(p => {
        const dx = p.x - posX;
        const dz = p.z - posZ;
        return Math.sqrt(dx * dx + dz * dz) < minPartDistance;
      });

      // Garante distância do jogador inicial
      const distToPlayer = Math.sqrt(posX * posX + posZ * posZ);
      const tooCloseToPlayer = distToPlayer < minPlayerDistance;

      if (tooCloseToOtherPart || tooCloseToPlayer) continue;

      placed = true;

      loadSpecialPart(part.model, part.name, posX, posZ, () => {
        loadedCount++;
        if (loadedCount === specialParts.length && typeof onFinish === "function") {
          onFinish();
        }
      });
    }
  }
}

function createFence(x, z, rotation = 0) {
  const fenceGeometry = new THREE.PlaneGeometry(4, 4);
  const fence = new THREE.Mesh(fenceGeometry, fenceMaterial);
  fence.position.set(x, 1, z);
  fence.rotation.y = rotation;
  scene.add(fence);
  addObstacle(fence, x, z);
}

function createBorderFences() {
  const spacing = 3.75;
  const borderMin = -250;
  const borderMax = 250;

  for (let x = borderMin; x <= borderMax; x += spacing) {
    createFence(x, borderMin, 0);
    createFence(x, borderMax, Math.PI);
  }

  for (let z = borderMin; z <= borderMax; z += spacing) {
    createFence(borderMin, z, Math.PI / 2);
    createFence(borderMax, z, -Math.PI / 2);
  }
}

// ========== OBJETOS COLETÁVEIS ==========
const gltfLoader = new THREE.GLTFLoader();

function loadBatteryModel(x, z) {
  gltfLoader.load('models/battery_-_batarya.glb', (gltf) => {
    const battery = gltf.scene;
    battery.scale.set(0.03, 0.03, 0.03);
    battery.position.set(x, 0.5, z); // flutuando levemente
    battery.userData.isBattery = true;
    battery.userData.baseY = battery.position.y;
    battery.userData.seen = false; // vista ou não

    // Aplica brilho
    battery.traverse((child) => {
      if (child.isMesh) {
        child.material.emissive = new THREE.Color(0x00a8ff); // amarelo
        child.material.emissiveIntensity = 0.2;
        child.material.transparent = true;
        child.material.opacity = 1;
      }
    });

    scene.add(battery);
    //addObstacle(battery, x, z);  TIRAR COLISÃO
    collectibleBatteries.push(battery);
  }, undefined, (error) => {
    console.error('Erro ao carregar o modelo de bateria:', error);
  });
}

function loadOldHouse(x, z) {
  gltfLoader.load('models/old_house.glb', (gltf) => {
    const house = gltf.scene;
    house.scale.set(2, 2, 2); // ajuste de tamanho
    house.position.set(x, 0, z);

    house.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.material = new THREE.MeshStandardMaterial({
          map: child.material.map || null,
          color: child.material.color || new THREE.Color(0xffffff),
          metalness: 0.2,
          roughness: 0.8
        });
      }
    });

    scene.add(house);
    addObstacle(house, x, z); // para colisão
  }, undefined, (error) => {
    console.error('Erro ao carregar old_house.glb:', error);
  });
}


function loadSpecialPart(modelPath, name, x, z, onLoadComplete) {
  gltfLoader.load(modelPath, (gltf) => {
    const part = gltf.scene;
    const partData = specialParts.find(p => p.name === name);
    const scale = partData?.scale || [0.3, 0.3, 0.3];
    part.scale.set(...scale);
    part.position.set(x, 1.25, z);
    part.userData.isSpecial = true;
    part.userData.name = name;
    part.userData.collected = false;
    part.userData.baseY = part.position.y; // ← Adicionado

    specialItemPositions.push({ x, z });

    part.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: new THREE.Color(0x00ff66),
          emissiveIntensity: 0.15,
          metalness: 0.1,
          roughness: 0.7
        });
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    scene.add(part);
    specialItems.push(part);

    if (typeof onLoadComplete === 'function') {
      onLoadComplete();
    }
  }, undefined, (error) => {
    console.error(`Erro ao carregar modelo especial (${name}):`, error);
    if (typeof onLoadComplete === 'function') {
      onLoadComplete(); // mesmo com erro, avançamos
    }
  });
}

function loadEntityModel(path, offsetX = 0) {
  gltfLoader.load(path, (gltf) => {
    const model = gltf.scene;

    if (gltf.animations && gltf.animations.length > 0) {
      ghostMixer = new THREE.AnimationMixer(model);
      const action = ghostMixer.clipAction(gltf.animations[0]); // ← primeira animação
      action.timeScale = 2; // velocidade da animação
      action.play();
    }

    model.scale.set(3, 3, 3);
    model.rotation.y = -Math.PI / 2 - 0.1;

    // 💡 Luz que acompanha a entidade
    const light = new THREE.PointLight(0xffffff, 0.25, 12.5);
    light.position.set(0, 3, 0);
    model.add(light);

    model.traverse((child) => {
    if (child.isMesh) {
      // Converte o material para MeshStandardMaterial se necessário
      const oldMat = child.material;
      child.material = new THREE.MeshStandardMaterial({
        map: oldMat.map || null,
        color: oldMat.color || new THREE.Color(0xffffff),
        metalness: 0.2,
        roughness: 0.6,
        emissive: new THREE.Color(0x000000), // sem brilho extra
        side: THREE.FrontSide,
        skinning: true,  // ← ESSENCIAL!
      });

      child.castShadow = true;
      child.receiveShadow = true;
      }
    });

    // ✨ Efeito emissivo no material (opcional)
    model.traverse(child => {
      if (child.isMesh) {
        child.material.emissive = new THREE.Color(0xffffff);
        child.material.emissiveIntensity = 0.1;
      }
    });

    const wrapper = new THREE.Group();
    wrapper.add(model);
    wrapper.position.set(100, 0, 100); // Longe do centro

    scene.add(wrapper);

    // Criar a luz que ilumina a entidade de frente
    ghostLight = new THREE.SpotLight(0xff6666, 1.5, 20, Math.PI / 6, 0.5, 1);
    ghostLight.castShadow = true;
    scene.add(ghostLight);
    scene.add(ghostLight.target); // necessário para SpotLight funcionar corretamente


    if (path.includes('ghost_daughter')) {
      ghostWrapper = wrapper;
    }
  }, undefined, (error) => {
    console.error(`Erro ao carregar modelo ${path}:`, error);
  });
}

createBorderFences();
loadOldHouse(-180, -180); // ← casa no canto sudoeste
specialItemPositions.push({ x: -180, z: -180 }); // ← evita árvores em cima da casa

distributeSpecialParts(() => {
  createForest();
  distributeBatteries();
  updatePartsHUD();
  updateGhostWaypoints();
});

function updateGhostWaypoints() {
  ghostWaypoints = specialItems
    .filter(part => !part.userData.collected)
    .map(part => part.position.clone());
}



// ========== CONTROLES ==========
const controls = { forward: false, backward: false, left: false, right: false };

function resetControls() {
  controls.forward = false;
  controls.backward = false;
  controls.left = false;
  controls.right = false;
}

document.addEventListener('keydown', (e) => {
  if (!gameStarted) return;

  if (e.code === 'KeyW') controls.forward = true;
  if (e.code === 'KeyS') controls.backward = true;
  if (e.code === 'KeyA') controls.left = true;
  if (e.code === 'KeyD') controls.right = true;
  if (e.code === 'KeyP') toggleDayNight(true);

  if (e.code === 'KeyM') { // ← Alternar minimapa (apenas para desenvolvimento)
    const minimap = document.getElementById("minimap");
    minimap.style.display = minimap.style.display === "none" ? "block" : "none";
  }

  if (e.code === 'KeyJ') {
    triggerVictory();
  }

});

document.addEventListener('keyup', (e) => {
  if (!gameStarted) return;
  if (e.code === 'KeyW') controls.forward = false;
  if (e.code === 'KeyS') controls.backward = false;
  if (e.code === 'KeyA') controls.left = false;
  if (e.code === 'KeyD') controls.right = false;
});

document.addEventListener("click", () => {
  if (!gameStarted || gamePaused) return;
  document.body.requestPointerLock();
});

document.addEventListener("mousemove", (event) => {
  if (!gameStarted || gamePaused) return;
  if (document.pointerLockElement === document.body) {
    cameraHolder.rotation.y -= event.movementX * 0.002;
    camera.rotation.x -= event.movementY * 0.002;
    camera.rotation.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, camera.rotation.x));
  }
});

document.addEventListener("pointerlockchange", () => {
  if (!gameStarted) return;
  const isLocked = document.pointerLockElement === document.body;
  if (!isLocked && !gamePaused) {
    gamePaused = true;
    footstepsSound.pause();
    footstepsSound.playing = false;
    resetControls();
    document.getElementById("main-menu").style.display = "block";
    clearInterval(batteryInterval);
  }
  if (!ghostSound.paused) {
    ghostSound.pause();
    ghostSound.currentTime = 0;
  }
});

// ========== DIA / NOITE ==========
let isDay = false;
let autoCycleInterval;

function toggleDayNight(manual = false) {
  isDay = !isDay;

  const duration = 2000;
  const steps = 60;
  let step = 0;

  const fogStart = new THREE.Color(scene.fog.color);
  const fogTarget = new THREE.Color(isDay ? 0xccccff : 0x111111);

  const bgStart = new THREE.Color(scene.background);
  const bgTarget = new THREE.Color(isDay ? 0xccccff : 0x111111);

  const ambStart = ambientLight.intensity;
  const ambTarget = isDay ? 0.4 : 0.2;

  const dirStart = directionalLight.intensity;
  const dirTarget = isDay ? 0.6 : 0.3;

  const dirColorStart = new THREE.Color(directionalLight.color);
  const dirColorTarget = new THREE.Color(isDay ? 0xffffff : 0x444488);

  const interval = setInterval(() => {
    step++;
    const t = step / steps;

    scene.fog.color.lerpColors(fogStart, fogTarget, t);
    scene.background.lerpColors(bgStart, bgTarget, t);
    ambientLight.intensity = ambStart + (ambTarget - ambStart) * t;
    directionalLight.intensity = dirStart + (dirTarget - dirStart) * t;
    directionalLight.color.lerpColors(dirColorStart, dirColorTarget, t);

    if (step >= steps) clearInterval(interval);
  }, duration / steps);

  if (manual) {
    clearInterval(autoCycleInterval);
    //startAutoCycle();
  }
}

// ========== LANTERNA ==========
let flashlightMode = 0;
document.addEventListener("mousedown", (event) => {
  if (!gameStarted || gamePaused) return;
  if (event.button === 0) {
    flashlightMode = (flashlightMode + 1) % 4;
    updateFlashlightIntensity();
  }
});

function updateFlashlightIntensity() {
  if (battery === 0 || flashlightMode === 2) {
    flashlight.intensity = 0;
    updateHUD();
    return;
  }

  const intensities = [6.66, 10, 0, 3.33];
  flashlight.intensity = intensities[flashlightMode];
  updateHUD();
}

function updateHUD() {
  const modeNames = ["Médio", "Alto", "Desligado", "Baixo"];
  document.getElementById("flashlight-hud").textContent = "Modo da Lanterna: " + modeNames[flashlightMode];
}

function updatePartsHUD() {
  const collected = specialItems.filter(part => part.userData.collected).length;
  document.getElementById("parts-hud").textContent = `Peças Coletadas: ${collected} / ${specialParts.length}`;
}

function showBatteryPopup(message = "🔋 Bateria Coletada!") {
  batterySound.currentTime = 0;
  batterySound.play();
  const popup = document.getElementById("battery-popup");
  popup.textContent = message;
  popup.style.display = "block";

  setTimeout(() => {
    popup.style.display = "none";
  }, 1500);
}

function showSpecialPartPopup(name = "Peça Coletada!") {
  radioSound.currentTime = 0.3;
  radioSound.play();
  const popup = document.getElementById("battery-popup");
  popup.textContent = "🎯 " + name + " coletada!";
  popup.style.display = "block";
  popup.style.color = "lime";

  popup.style.boxShadow = "0 0 10px lime";

  setTimeout(() => {
    popup.style.display = "none";
    popup.style.color = "limegreen";
    popup.style.boxShadow = "0 0 10px limegreen";
  }, 1500);
}

// ========== BATERIA ==========
let battery = 100;
const batteryDrainRate = 1.00;
let flickerActive = false;

function updateBattery() {
  if (flashlightMode !== 2) { // não gasta bateria quando lanterna ta desligada
    battery = Math.max(0, battery - batteryDrainRate);
  }

  //battery = Math.max(0, battery - batteryDrainRate);
  document.getElementById("battery-level").style.width = battery + "%";
  document.getElementById("battery-text").textContent = "Bateria: " + battery + "%";

  const warning = document.getElementById("battery-warning");
  warning.style.display = (battery < BATTERY_LOW_THRESHOLD && battery > 0) ? "block" : "none";

  if (battery < BATTERY_LOW_THRESHOLD && battery > 0 && flashlightMode !== 2 && !flickerActive) {
    startFlicker();

    if (!lowBatterySoundPlayed) {
      lowBatterySound.currentTime = 3.3;
      lowBatterySound.play();
      lowBatterySoundPlayed = true;
    }
  } else if (battery >= BATTERY_LOW_THRESHOLD) {
    // Se a bateria subir de novo, reseta a flag
    lowBatterySoundPlayed = false;
  }

  if (battery === 0) {
    flashlight.intensity = 0;
    updateHUD();
  }
}

function startFlicker() {
  flickerActive = true;
  const flickerTime = Math.random() * 2000 + 1000;
  const flickerIntervalMs = Math.max(50, 500 * (battery / BATTERY_LOW_THRESHOLD));
  const flickerChance = (100 - battery) / 100;

  const interval = setInterval(() => {
    if (flashlightMode !== 2 && battery > 0) {
      flashlight.intensity = Math.random() < flickerChance
        ? 0
        : Math.random() * 10 + 5;
    }
  }, flickerIntervalMs);

  setTimeout(() => {
    clearInterval(interval);
    flickerActive = false;
    updateFlashlightIntensity();
  }, flickerTime);
}

function checkVictoryConditionLoop() {
  if (!waitingForSafeDistance) return;

  const ghostObj = ghostWrapper ?? ghost;
  if (!ghostObj || !ghostObj.position) return;

  const dist = cameraHolder.position.distanceTo(ghostObj.position);

  if (dist < 30) {
      showTooCloseWarning();
    } else {
      hideTooCloseWarning();
      waitingForSafeDistance = false;
      triggerVictory();
    }
}

function triggerVictory() {
  if (gameOverTriggered) return;

  const ghostObj = ghostWrapper;
  if (!ghostObj || !ghostObj.position) return;

  const playerPos = cameraHolder.position.clone();
  const ghostPos = ghostObj.position.clone();
  const dist = playerPos.distanceTo(ghostPos);

  if (dist < 30) return;

  clearInterval(batteryInterval);
  footstepsSound.pause();
  ghostSound.pause();
  ambientSound.pause();

  // 1. Desliga a lanterna
  flashlightMode = 2;
  updateFlashlightIntensity();

  // 2. Espera 2s antes de iniciar o dia
  setTimeout(() => {
    if (!isDay) {
      toggleDayNight(true);
    }

    // 3. Espera +2s para imagem e sons (4s desde início)
    setTimeout(() => {
      gamePaused = true;
      document.getElementById("ending-image").style.display = "block";
      endingSound1.play();
      setTimeout(() => endingSound2.play(), 1000);

      // ⏱️ Parar os sons após 10s
      setTimeout(() => {
        endingSound1.pause();
        endingSound1.currentTime = 0;
        endingSound2.pause();
        endingSound2.currentTime = 0;
      }, 20000);
    }, 3000);

    // 4. Espera +5s após imagem (9s total) para mostrar mensagem e botão
    setTimeout(() => {
      const popup = document.getElementById("ending-popup");
      popup.style.display = "block";
      typeText(
        "Communication with the outside world has been established.\nYou are finally free.",
        "typing-text",
        30
      );
      document.exitPointerLock();

      const playAgainBtn = document.getElementById("play-again-button");
      playAgainBtn.style.display = "inline-block";
      playAgainBtn.onclick = () => {
        window.location.reload();
      };
    }, 8000);
  }, 2000);
}

function showTooCloseWarning(duration = 3000) {
  const warning = document.getElementById("tooCloseWarning");
  warning.style.display = "block";
}

function hideTooCloseWarning() {
  const warning = document.getElementById("tooCloseWarning");
  warning.style.display = "none";
}


function typeText(text, elementId, delay = 30) {
  const element = document.getElementById(elementId);
  element.textContent = "";
  let i = 0;

  function type() {
    if (i < text.length) {
      element.textContent += text.charAt(i);
      i++;
      setTimeout(type, delay);
    }
  }

  type();
}


function triggerGameOver() {
  if (gameOverTriggered) return;

  gameOverTriggered = true;
  gamePaused = true;
  footstepsSound.pause();
  ghostSound.pause();
  clearInterval(batteryInterval);

  // Mostra tela de Game Over
  const popup = document.getElementById("game-over-popup");
  popup.style.display = "block";

  // Sai do pointer lock
  document.exitPointerLock();
}

// ========== ANIMAÇÃO ==========

let currentQuadrants = new Set();

function updateVisibleChunks() {
  const newQuadrants = new Set(getSurroundingQuadrants(cameraHolder.position.x, cameraHolder.position.z));

  // Remover quadrantes que não estão mais ao redor
  currentQuadrants.forEach(key => {
    if (!newQuadrants.has(key)) {
      const trees = forestChunks.get(key);
      if (trees) {
        trees.forEach(tree => {
          scene.remove(tree);
          removeObstacle(tree, tree.position.x, tree.position.z);
        });
      }
    }
  });

  // Adicionar novos quadrantes
  newQuadrants.forEach(key => {
    if (!currentQuadrants.has(key)) {
      const trees = forestChunks.get(key);
      if (trees) {
        trees.forEach(tree => {
          scene.add(tree);
          addObstacle(tree, tree.position.x, tree.position.z);
        });
      }
    }
  });

  currentQuadrants = newQuadrants;
}

function getGhostConfig() {
  if (difficultyLevel <= 1) {
    return {
      target: "waypoints",
      speed: 0.01 + difficultyLevel * 0.005,
      detectRange: 0,
      alwaysChase: false,
      intenseEffects: false
    };
  } else if (difficultyLevel <= 3) {
    return {
      target: "hybrid",
      speed: 0.002,            // Moderado, mas ainda mais lento que o player
      detectRange: 30,
      alwaysChase: false,
      intenseEffects: false
    };
  } else {
    return {
      target: "player",
      speed: 0.0035,            // Ainda controlado, mesmo em nível alto
      detectRange: Infinity,
      alwaysChase: true,
      intenseEffects: false
    };
  }
}

function updateGhostBehavior(delta) {
  if (!ghostWrapper) return;

  const config = getGhostConfig();
  const playerPos = cameraHolder.position.clone();
  let targetPos = null;

  const distanceToPlayer = ghostWrapper.position.distanceTo(playerPos);

  const dangerRange = 5;
  if (distanceToPlayer <= dangerRange) {
    if (dangerStartTime === null) {
      dangerStartTime = performance.now(); // inicia contagem
    } else {
      const timeInside = performance.now() - dangerStartTime;
      if (timeInside >= 2000 && !gameOverTriggered) {
        triggerGameOver();
        return; // interrompe update se game over
      }
    }
  } else {
    dangerStartTime = null; // saiu do range → zera o timer
  }

  const vignette = document.getElementById("danger-vignette");
  const minDistance = 5;
  const visualEffectRange = 30; // efeito visual começa a partir dessa distância

  if (distanceToPlayer <= visualEffectRange) {
    const clampedDist = Math.max(minDistance, Math.min(visualEffectRange, distanceToPlayer));
    let intensity = 1 - (clampedDist - minDistance) / (visualEffectRange - minDistance);
    intensity = Math.pow(intensity, 1.5); // curva mais dramática

    vignette.style.opacity = intensity.toFixed(2);

    // 🎧 Controle de volume com distância + volume global
    const targetVolume = globalVolume * 0.8 * intensity;
    ghostSound.volume = targetVolume;

    if (ghostSound.paused) {
      ghostSound.currentTime = 0;
      ghostSound.play();
    }

  } else {
    vignette.style.opacity = "0";

    if (!ghostSound.paused) {
      ghostSound.pause();
    }

    ghostSound.volume = 0;
  }

  // 🎯 Escolha do destino com base no nível
  if (config.target === "player") {
    targetPos = playerPos;
    ghostWrapper.userData.ghostSpeed = config.speed;
  } else if (config.target === "hybrid") {
    const chasing = distanceToPlayer <= config.detectRange;

    if (chasing) {
      // Jogador detectado → perseguir
      targetPos = playerPos;
      ghostWrapper.userData.ghostMode = "chasing";
      ghostWrapper.userData.ghostSpeed = 0.002;
    } else {
      // Jogador fora do alcance → voltar a patrulhar
      ghostWrapper.userData.ghostMode = "patrolling";
      if (ghostWaypoints.length > 0) {
        targetPos = ghostWaypoints[ghostTargetIndex];
        ghostWrapper.userData.ghostSpeed = 0.01 + difficultyLevel * 0.005;
        if (ghostWrapper.position.distanceTo(targetPos) < 2) {
          ghostTargetIndex = (ghostTargetIndex + 1) % ghostWaypoints.length;
        }
      }
    }
  } else if (ghostWaypoints.length > 0) {
    targetPos = ghostWaypoints[ghostTargetIndex];
    if (ghostWrapper.position.distanceTo(targetPos) < 2) {
      ghostTargetIndex = (ghostTargetIndex + 1) % ghostWaypoints.length;
    }
  }

  // Movimento em direção ao destino
  if (targetPos) {
    const moveSpeed = ghostWrapper.userData.ghostSpeed || config.speed;
    const newPos = ghostWrapper.position.clone().lerp(targetPos, moveSpeed);
    newPos.y = 1;
    ghostWrapper.position.copy(newPos);
    ghostWrapper.lookAt(playerPos.clone().setY(1));
  }

  // 🎵 Efeitos visuais e sonoros
  if (config.intenseEffects && distanceToPlayer < 15) {
    if (ghostLight) ghostLight.intensity = 2.5;
    if (!flickerActive && Math.random() < 0.01) {
      startFlicker();
    }
    // Adicione efeitos sonoros aqui, se quiser
  } else {
    if (ghostLight) ghostLight.intensity = 1.5;
  }
}

function animate() {
  if (gamePaused) return;
  pauseAnimationFrame = requestAnimationFrame(animate);

  updateVisibleChunks(); // ← ESSA LINHA É ESSENCIAL

  checkVictoryConditionLoop();

  const delta = clock.getDelta();
  if (ghostMixer) ghostMixer.update(delta);
  updateGhostBehavior(delta);

  const cellKey = getCellKey(cameraHolder.position.x, cameraHolder.position.z);
  visitedCells.add(cellKey);


  const speed = 0.15;
  const rotY = cameraHolder.rotation.y;
  const nextPosition = cameraHolder.position.clone();

  if (controls.forward) {
    nextPosition.z -= speed * Math.cos(rotY);
    nextPosition.x -= speed * Math.sin(rotY);
  }
  if (controls.backward) {
    nextPosition.z += speed * Math.cos(rotY);
    nextPosition.x += speed * Math.sin(rotY);
  }
  if (controls.left) {
    nextPosition.x -= speed * Math.cos(rotY);
    nextPosition.z += speed * Math.sin(rotY);
  }
  if (controls.right) {
    nextPosition.x += speed * Math.cos(rotY);
    nextPosition.z -= speed * Math.sin(rotY);
  }

  const playerBox = new THREE.Box3().setFromCenterAndSize(
    nextPosition.clone().add(new THREE.Vector3(0, 1.5, 0)),
    new THREE.Vector3(1, 3, 1)
  );

  let collision = false;
  const cellX = Math.floor(nextPosition.x / CELL_SIZE);
  const cellZ = Math.floor(nextPosition.z / CELL_SIZE);
  const nearbyObstacles = [];

  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const key = `${cellX + dx},${cellZ + dz}`;
      const cell = obstacleGrid.get(key);
      if (cell) nearbyObstacles.push(...cell);
    }
  }

  for (const obj of nearbyObstacles) {
    const objBox = new THREE.Box3().setFromObject(obj);
    if (playerBox.intersectsBox(objBox)) {
      collision = true;
      break;
    }
  }

  if (!collision) {
  cameraHolder.position.copy(nextPosition);
} else {
  // Testa movimento apenas no eixo X
  const testX = new THREE.Vector3(nextPosition.x, cameraHolder.position.y, cameraHolder.position.z);
  const boxX = new THREE.Box3().setFromCenterAndSize(
    testX.clone().add(new THREE.Vector3(0, 1.5, 0)),
    new THREE.Vector3(1, 3, 1)
  );

  let collidesX = false;
  for (const obj of nearbyObstacles) {
    const objBox = new THREE.Box3().setFromObject(obj);
    if (boxX.intersectsBox(objBox)) {
      collidesX = true;
      break;
    }
  }

  // Testa movimento apenas no eixo Z
  const testZ = new THREE.Vector3(cameraHolder.position.x, cameraHolder.position.y, nextPosition.z);
  const boxZ = new THREE.Box3().setFromCenterAndSize(
    testZ.clone().add(new THREE.Vector3(0, 1.5, 0)),
    new THREE.Vector3(1, 3, 1)
  );

  let collidesZ = false;
  for (const obj of nearbyObstacles) {
    const objBox = new THREE.Box3().setFromObject(obj);
    if (boxZ.intersectsBox(objBox)) {
      collidesZ = true;
      break;
    }
  }

  if (!collidesX) {
    cameraHolder.position.x = nextPosition.x;
  }
  if (!collidesZ) {
    cameraHolder.position.z = nextPosition.z;
    }
  }

  const isMoving = controls.forward || controls.backward || controls.left || controls.right;
  camera.position.y = isMoving ? 3 + Math.sin(walkTime * 2) * 0.1 : 3;
  walkTime = isMoving ? walkTime + 0.1 : 0;

  // 🎵 Som de passos
  if (isMoving && !footstepsSound.playing) {
    footstepsSound.currentTime = 0;
    footstepsSound.play();
    footstepsSound.playing = true;
  } else if (!isMoving && footstepsSound.playing) {
    footstepsSound.pause();
    footstepsSound.playing = false;
  }

  flashlight.position.copy(cameraHolder.position.clone().add(new THREE.Vector3(0, 2.2, 0)));
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  direction.y -= 0.1;
  flashlight.target.position.copy(flashlight.position.clone().add(direction.normalize()));
  flashlight.target.updateMatrixWorld();

  scene.traverse((obj) => {
  if (obj.userData.isBattery && obj.visible) {
    const batteryBox = new THREE.Box3().setFromObject(obj);
    if (playerBox.intersectsBox(batteryBox)) {
      obj.visible = false;
      obj.userData.seen = false; // ← Remove do minimapa
      battery = Math.min(100, battery + 25); // Recarrega 25%
      showBatteryPopup(); // ← AQUI É ADICIONADO
      updateHUD();
      //updateGhostWaypoints(); // ← Atualiza os waypoints do fantasma (MAS NÃO É NECESSÁRIO AQUI)
      }
    }
  });

  scene.traverse((obj) => {
  if (obj.userData.isSpecial && obj.visible) {
    const specialBox = new THREE.Box3().setFromObject(obj);
    if (playerBox.intersectsBox(specialBox)) {
      obj.visible = false;
      obj.userData.collected = true; // ← marca como coletada
      difficultyLevel = Math.min(specialItems.filter(p => p.userData.collected).length, 5);
      showSpecialPartPopup(obj.userData.name);
      updatePartsHUD();
      const collectedCount = specialItems.filter(p => p.userData.collected).length;
      if (collectedCount === specialParts.length) {
        const ghostObj = ghostWrapper ?? ghost;
        if (!ghostObj || !ghostObj.position) return;

        const dist = cameraHolder.position.distanceTo(ghostObj.position);
        if (dist < 30) {
          waitingForSafeDistance = true;
          showTooCloseWarning();
        } else {
          triggerVictory();
          }
        }
      }
    }
  });

  const t = Date.now() * 0.001;
  collectibleBatteries.forEach((battery) => {
  battery.rotation.y += 0.01; // gira
  battery.position.y = battery.userData.baseY + Math.sin(t * 2) * 0.1; // flutua
  });

  specialItems.forEach((item) => {
  if (!item.visible) return;
  item.rotation.y += 0.01; // gira
  item.position.y = item.userData.baseY + Math.sin(t * 2) * 0.1; // flutua
  });

  collectibleBatteries.forEach(battery => {
  if (!battery.visible || battery.userData.seen) return;

  const toBattery = battery.position.clone().sub(cameraHolder.position);
  const distance = toBattery.length();
  if (distance > 20) return; // muito longe para ver

  toBattery.normalize();
  const cameraDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraDirection);

  const dot = toBattery.dot(cameraDirection);
  if (dot > 0.7) { // ângulo dentro do campo de visão
    battery.userData.seen = true;
    }
  });

  // Atualiza a posição do fantasma
/*  if (ghostWrapper) {
    const playerPos = cameraHolder.position.clone();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.normalize();

    // Distância atrás do jogador
    const followDistance = -10;

    // Posição desejada da entidade
    const desiredPos = playerPos.clone().sub(dir.multiplyScalar(followDistance));
    desiredPos.y = 1; // manter no chão

    ghostWrapper.position.lerp(desiredPos, 0.05); // suaviza o movimento
    ghostWrapper.lookAt(playerPos.clone().setY(0)); // sempre olhando pro jogador
  } */

  if (ghostWrapper && ghostLight) {
    const playerPos = cameraHolder.position.clone();
    const ghostPos = ghostWrapper.position.clone();

    const dirToPlayer = playerPos.clone().sub(ghostPos).normalize();
    const offsetDistance = 10; // ← distância fixa desejada

    const lightPos = ghostPos.clone().add(dirToPlayer.multiplyScalar(offsetDistance));
    lightPos.y += 2; // altura da luz

    ghostLight.position.copy(lightPos);

    // Luz sempre apontando para a entidade
    ghostLight.target.position.copy(ghostPos.clone().setY(3.5));
    ghostLight.target.updateMatrixWorld();
  }

  renderer.render(scene, camera);
  drawMinimap();
  }

// ========== MINIMAPA ==========
function drawMinimap() {
  const canvas = document.getElementById("minimap");
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, canvas.width, canvas.height);

  const mapSize = 500;
  const scale = canvas.width / mapSize;

  // Desenhar células visitadas
  ctx.fillStyle = "rgba(200, 200, 200, 0.3)"; // cinza translúcido

  visitedCells.forEach(key => {
    const [cellX, cellZ] = key.split(',').map(Number);
    const x = cellX * CELL_SIZE;
    const z = cellZ * CELL_SIZE;
    const px = (x + mapSize / 2) * scale;
    const py = (z + mapSize / 2) * scale;

    const cellSizePx = CELL_SIZE * scale;
    ctx.fillRect(px, py, cellSizePx, cellSizePx);
  });

  // Desenhar o jogador
  const x = cameraHolder.position.x;
  const z = cameraHolder.position.z;
  const px = (x + mapSize / 2) * scale;
  const py = (z + mapSize / 2) * scale;

  // Obter direção da câmera
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const angle = Math.atan2(dir.x, dir.z);

  // Desenhar triângulo no minimapa
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(-angle + Math.PI); // ← corrige a rotação

  ctx.beginPath();
  ctx.moveTo(0, -6);  // ponta
  ctx.lineTo(4, 4);   // base direita
  ctx.lineTo(-4, 4);  // base esquerda
  ctx.closePath();

  ctx.fillStyle = "red";
  ctx.fill();
  ctx.restore();

  collectibleBatteries.forEach(battery => {
  if (!battery.userData.seen) return;

  const mapSize = 500;
  const scale = canvas.width / mapSize;
  const px = (battery.position.x + mapSize / 2) * scale;
  const py = (battery.position.z + mapSize / 2) * scale;

  ctx.fillStyle = "blue";
  ctx.beginPath();
  ctx.arc(px, py, 3, 0, Math.PI * 2);
  ctx.fill();
});

specialItems.forEach(part => {
  if (part.userData.collected) return; // não mostra se já foi coletada

  const px = (part.position.x + mapSize / 2) * scale;
  const py = (part.position.z + mapSize / 2) * scale;
  ctx.fillStyle = "lime";
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fill();
  });
  
    // 👻 Desenhar o fantasma em roxo no minimapa
  if (ghostWrapper) {
    const ghostX = ghostWrapper.position.x;
    const ghostZ = ghostWrapper.position.z;
    const gpx = (ghostX + mapSize / 2) * scale;
    const gpy = (ghostZ + mapSize / 2) * scale;

    ctx.fillStyle = "purple";
    ctx.beginPath();
    ctx.arc(gpx, gpy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

}

// ========== MENU ==========
function showTab(tabName) {
  document.getElementById("instructions").style.display = tabName === "instructions" ? "block" : "none";
  document.getElementById("audio").style.display = tabName === "audio" ? "block" : "none";
}

function startGame() {
  document.getElementById("main-menu").style.display = "none";
  resetControls();

  if (firstStart) {
    document.getElementById("note-overlay").style.display = "flex";
    firstStart = false;
    return;
  }

  renderer.domElement.style.display = "block";
  gameStarted = true;
  gamePaused = false;
  animate();
  batteryInterval = setInterval(updateBattery, 1000);
}

function hideNoteAndStart() {
  if (!gameStarted) {
    document.getElementById("note-overlay").style.display = "none";
    renderer.domElement.style.display = "block";
    resetControls();
    gameStarted = true;
    gamePaused = false;
    animate();
    batteryInterval = setInterval(updateBattery, 1000);

    ambientSound.play(); // ← TOCAR AQUI

    // 👻 Carregar entidade aqui
    loadEntityModel('models/ghost_daughter.glb', 0);

    // Mostrar aviso de início
    const startWarning = document.getElementById("start-warning");
    startWarning.style.display = "block";
    setTimeout(() => {
      startWarning.style.display = "none";
    }, 4000); // esconde após 4 segundos

  }
}

document.getElementById("note-overlay").addEventListener("click", hideNoteAndStart);
document.addEventListener("keydown", () => {
  if (document.getElementById("note-overlay").style.display === "flex") {
    hideNoteAndStart();
  }
});

document.getElementById("minimap").style.display = "block";

window.addEventListener("DOMContentLoaded", () => {
  const restartBtn = document.getElementById("restart-button");
  if (restartBtn) {
    restartBtn.addEventListener("click", () => {
      window.location.reload();
    });
  }
});