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
const groundTexture = textureLoader.load('chao.jpg');
groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
groundTexture.repeat.set(40, 40);

const trunkTexture = textureLoader.load('tronco.jpg');
trunkTexture.wrapS = trunkTexture.wrapT = THREE.RepeatWrapping;
trunkTexture.repeat.set(1, 2);

const fenceTexture = textureLoader.load('cerca.png');
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
        const tree = createTreeObject(x + rng() * 0.5, z + rng() * 0.5);
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

function loadEntityModel(path, offsetX = 0) {
  gltfLoader.load(path, (gltf) => {
    const model = gltf.scene;
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
    wrapper.position.set(
      cameraHolder.position.x + offsetX,
      0,
      cameraHolder.position.z - 10
    );

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

createForest();
createBorderFences();
distributeBatteries();

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
    resetControls();
    document.getElementById("main-menu").style.display = "block";
    clearInterval(batteryInterval);
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
    startAutoCycle();
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

function showBatteryPopup(message = "🔋 Bateria Coletada!") {
  const popup = document.getElementById("battery-popup");
  popup.textContent = message;
  popup.style.display = "block";

  setTimeout(() => {
    popup.style.display = "none";
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
  warning.style.display = (battery < 25 && battery > 0) ? "block" : "none";

  if (battery >= 25 && flashlightMode !== 2) {
    updateFlashlightIntensity();
  } else if (battery < 25 && battery > 0 && flashlightMode !== 2 && !flickerActive) {
    startFlicker();
  }

  if (battery === 0) {
    flashlight.intensity = 0;
    updateHUD();
  }
}

function startFlicker() {
  flickerActive = true;
  const flickerTime = Math.random() * 2000 + 1000;
  const flickerIntervalMs = Math.max(50, 500 * (battery / 25));
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

function animate() {
  if (gamePaused) return;
  pauseAnimationFrame = requestAnimationFrame(animate);

  updateVisibleChunks(); // ← ESSA LINHA É ESSENCIAL

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
      }
    }
  });

  const t = Date.now() * 0.001;
  collectibleBatteries.forEach((battery) => {
  battery.rotation.y += 0.01; // gira
  battery.position.y = battery.userData.baseY + Math.sin(t * 2) * 0.1; // flutua
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
  if (dot > 0.75) { // ângulo dentro do campo de visão (~41°)
    battery.userData.seen = true;
    }
  });

  // Atualiza a posição do fantasma
  if (ghostWrapper) {
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
  }

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

    // 👻 Carregar entidade aqui
    loadEntityModel('models/ghost_daughter.glb', 0);
  }
}

document.getElementById("note-overlay").addEventListener("click", hideNoteAndStart);
document.addEventListener("keydown", () => {
  if (document.getElementById("note-overlay").style.display === "flex") {
    hideNoteAndStart();
  }
});

document.getElementById("minimap").style.display = "block";