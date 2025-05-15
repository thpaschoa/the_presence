// ghost.js

let ghost, ghostVisible = false, ghostTexture, flashlight, flashlightIntensity;
let sceneRef;

export function initGhost(scene, textureLoader, lightRef) {
  ghostTexture = textureLoader.load('ghost.png');
  const material = new THREE.SpriteMaterial({ map: ghostTexture, color: 0xffffff });

  ghost = new THREE.Sprite(material);
  ghost.scale.set(3, 3, 1);
  ghost.visible = false;

  flashlight = lightRef;
  flashlightIntensity = flashlight.intensity;

  sceneRef = scene;
  scene.add(ghost);

  setInterval(() => {
    if (!ghostVisible && Math.random() < 0.1) {
      spawnGhost();
    }
  }, 20000);
}

function spawnGhost() {
  const angle = Math.random() * 2 * Math.PI;
  const distance = 15 + Math.random() * 10;
  const offsetX = Math.cos(angle) * distance;
  const offsetZ = Math.sin(angle) * distance;

  const playerPos = sceneRef.userData.playerPos || new THREE.Vector3();
  ghost.position.set(playerPos.x + offsetX, 1.5, playerPos.z + offsetZ);

  ghost.visible = true;
  ghostVisible = true;
  ghost.flickered = false;
}

export function updateGhost(cameraHolder, camera) {
  if (!ghostVisible) return;

  const toPlayer = cameraHolder.position.clone().sub(ghost.position);
  const distance = toPlayer.length();

  const cameraDir = new THREE.Vector3();
  camera.getWorldDirection(cameraDir);
  const angle = cameraDir.angleTo(toPlayer.clone().normalize());

  if (angle > Math.PI / 2) {
    spawnGhost(); // teleporta se não está visível
  }

  if (distance < 10 && !ghost.flickered) {
    ghost.flickered = true;
    flickerLantern(3);
  }

  if (distance < 2) {
    ghost.visible = false;
    ghostVisible = false;
    ghost.flickered = false;
  }
}

function flickerLantern(times) {
  let count = 0;
  const flicker = setInterval(() => {
    flashlight.intensity = flashlight.intensity > 0 ? 0 : flashlightIntensity;
    count++;
    if (count >= times * 2) {
      clearInterval(flicker);
      flashlight.intensity = flashlightIntensity;
    }
  }, 200);
}
