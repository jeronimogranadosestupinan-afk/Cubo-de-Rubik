const cubeEl = document.getElementById('cube');
const moveButtons = document.querySelectorAll('[data-move]');
const shuffleBtn = document.getElementById('shuffle');

const CUBIE_SIZE = 78;
const STEP = CUBIE_SIZE + 2;
const ANIM_MS = 260;

const MOVE_MAP = {
  U: { axis: 'y', layer: 1, turns: -1 },
  D: { axis: 'y', layer: -1, turns: 1 },
  L: { axis: 'x', layer: -1, turns: 1 },
  R: { axis: 'x', layer: 1, turns: -1 },
  F: { axis: 'z', layer: 1, turns: -1 },
  B: { axis: 'z', layer: -1, turns: 1 }
};

const axisIndex = { x: 0, y: 1, z: 2 };
const cubies = [];
const moveQueue = [];
let isTurning = false;

let yaw = -34;
let pitch = -26;
let isDragging = false;
let pointerId = null;
let lastX = 0;
let lastY = 0;

function identityMatrix() {
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ];
}

function rotationMatrix(axis, turns = 1) {
  const t = ((turns % 4) + 4) % 4;
  let m = identityMatrix();
  for (let i = 0; i < t; i += 1) {
    if (axis === 'x') {
      m = multiply3(
        [
          [1, 0, 0],
          [0, 0, -1],
          [0, 1, 0]
        ],
        m
      );
    } else if (axis === 'y') {
      m = multiply3(
        [
          [0, 0, 1],
          [0, 1, 0],
          [-1, 0, 0]
        ],
        m
      );
    } else {
      m = multiply3(
        [
          [0, -1, 0],
          [1, 0, 0],
          [0, 0, 1]
        ],
        m
      );
    }
  }
  return m;
}

function multiply3(a, b) {
  const out = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      out[r][c] = a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c];
    }
  }
  return out;
}

function rotateCoord(coord, axis, turns) {
  let [x, y, z] = coord;
  const t = ((turns % 4) + 4) % 4;
  for (let i = 0; i < t; i += 1) {
    if (axis === 'x') {
      [x, y, z] = [x, -z, y];
    } else if (axis === 'y') {
      [x, y, z] = [z, y, -x];
    } else {
      [x, y, z] = [-y, x, z];
    }
  }
  return [x, y, z];
}

function matrix3ToCss(m) {
  return `matrix3d(${m[0][0]}, ${m[1][0]}, ${m[2][0]}, 0, ${m[0][1]}, ${m[1][1]}, ${m[2][1]}, 0, ${m[0][2]}, ${m[1][2]}, ${m[2][2]}, 0, 0, 0, 0, 1)`;
}

function cubieTransform(cubie) {
  const [x, y, z] = cubie.pos;
  return `translate3d(${x * STEP}px, ${-y * STEP}px, ${z * STEP}px) ${matrix3ToCss(cubie.orient)}`;
}

function createCubie(x, y, z) {
  const el = document.createElement('div');
  el.className = 'cubie';

  const faceByAxis = [
    ['U', y === 1],
    ['D', y === -1],
    ['F', z === 1],
    ['B', z === -1],
    ['R', x === 1],
    ['L', x === -1]
  ];

  faceByAxis.forEach(([face, visible]) => {
    if (!visible) return;
    const sticker = document.createElement('div');
    sticker.className = `sticker face-${face}`;
    el.appendChild(sticker);
  });

  const cubie = {
    el,
    pos: [x, y, z],
    orient: identityMatrix()
  };

  el.style.transform = cubieTransform(cubie);
  cubeEl.appendChild(el);
  cubies.push(cubie);
}

function buildCube() {
  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        createCubie(x, y, z);
      }
    }
  }
  updateCubeRotation();
}

function updateCubeRotation() {
  cubeEl.style.transform = `rotateX(${pitch}deg) rotateY(${yaw}deg)`;
}

function setControlsDisabled(disabled) {
  moveButtons.forEach((btn) => {
    btn.disabled = disabled;
  });
  shuffleBtn.disabled = disabled;
}

async function performMove(move) {
  const moveDef = MOVE_MAP[move];
  if (!moveDef) return;

  const selected = cubies.filter((c) => c.pos[axisIndex[moveDef.axis]] === moveDef.layer);
  const rotator = document.createElement('div');
  rotator.className = 'layer-rotator';
  cubeEl.appendChild(rotator);

  selected.forEach((cubie) => rotator.appendChild(cubie.el));

  const axisCss = moveDef.axis.toUpperCase();

  await new Promise((resolve) => {
    requestAnimationFrame(() => {
      rotator.style.transition = `transform ${ANIM_MS}ms ease-in-out`;
      rotator.style.transform = `rotate${axisCss}(${moveDef.turns * 90}deg)`;
    });

    rotator.addEventListener(
      'transitionend',
      () => {
        resolve();
      },
      { once: true }
    );
  });

  const rotM = rotationMatrix(moveDef.axis, moveDef.turns);
  selected.forEach((cubie) => {
    cubie.pos = rotateCoord(cubie.pos, moveDef.axis, moveDef.turns);
    cubie.orient = multiply3(rotM, cubie.orient);
    cubeEl.appendChild(cubie.el);
    cubie.el.style.transform = cubieTransform(cubie);
  });

  rotator.remove();
}

async function processQueue() {
  if (isTurning || moveQueue.length === 0) return;
  isTurning = true;
  setControlsDisabled(true);

  while (moveQueue.length) {
    const move = moveQueue.shift();
    await performMove(move);
  }

  setControlsDisabled(false);
  isTurning = false;
}

function enqueueMove(move) {
  moveQueue.push(move);
  processQueue();
}

async function shuffleCube() {
  if (isTurning) return;
  const moves = Object.keys(MOVE_MAP);
  const sequenceLength = 22;
  for (let i = 0; i < sequenceLength; i += 1) {
    const pick = moves[Math.floor(Math.random() * moves.length)];
    moveQueue.push(pick);
  }
  processQueue();
}

moveButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    enqueueMove(btn.dataset.move);
  });
});

shuffleBtn.addEventListener('click', shuffleCube);

cubeEl.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  if (isTurning) return;

  isDragging = true;
  pointerId = event.pointerId;
  lastX = event.clientX;
  lastY = event.clientY;
  cubeEl.classList.add('dragging');
  cubeEl.setPointerCapture(pointerId);
});

cubeEl.addEventListener('pointermove', (event) => {
  if (!isDragging || event.pointerId !== pointerId) return;

  const dx = event.clientX - lastX;
  const dy = event.clientY - lastY;
  lastX = event.clientX;
  lastY = event.clientY;

  yaw += dx * 0.35;
  pitch -= dy * 0.35;
  pitch = Math.max(-85, Math.min(85, pitch));
  updateCubeRotation();
});

function stopDrag(event) {
  if (!isDragging || event.pointerId !== pointerId) return;
  isDragging = false;
  cubeEl.classList.remove('dragging');
  cubeEl.releasePointerCapture(pointerId);
  pointerId = null;
}

cubeEl.addEventListener('pointerup', stopDrag);
cubeEl.addEventListener('pointercancel', stopDrag);

window.addEventListener('keydown', (event) => {
  const key = event.key.toUpperCase();
  if (!MOVE_MAP[key]) return;
  event.preventDefault();
  enqueueMove(key);
});

buildCube();
