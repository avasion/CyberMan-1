(function(){

"use strict";
if (typeof THREE === 'undefined') {
  const err = document.createElement('div');
  err.style.position = 'fixed';
  err.style.inset = '0';
  err.style.display = 'flex';
  err.style.alignItems = 'center';
  err.style.justifyContent = 'center';
  err.style.background = '#05010a';
  err.style.color = '#ff6bcb';
  err.style.fontFamily = 'Courier New, monospace';
  err.style.fontSize = '16px';
  err.style.textAlign = 'center';
  err.style.padding = '30px';
  err.innerHTML = 'ERROR: three.min.js failed to load.<br>Please open the file in a browser or ensure the preview can load local scripts.';
  document.body.innerHTML = '';
  document.body.appendChild(err);
  throw new Error('THREE is not defined. three.min.js did not load.');
}

// ---------------------------------------------------------------------------
// BASIC SETUP
// ---------------------------------------------------------------------------
let scene, camera, renderer;
let clock = new THREE.Clock();

const CITY_HALF = 260; // half extent of the city
const BLOCK = 26;      // block spacing
const CHARACTER_HEIGHT = 1.9; // every humanoid is normalized to this height

scene = new THREE.Scene();
scene.background = new THREE.Color(0x05010a);
scene.fog = new THREE.FogExp2(0x0a0416, 0.011);

camera = new THREE.PerspectiveCamera(62, window.innerWidth/window.innerHeight, 0.1, 900);

renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// LIGHTING — moody cyberpunk night
// ---------------------------------------------------------------------------
const ambient = new THREE.AmbientLight(0x554a70, 1.35);
scene.add(ambient);

const hemi = new THREE.HemisphereLight(0x8fa4ff, 0x1a1424, 1.1);
scene.add(hemi);

const moon = new THREE.DirectionalLight(0x9fb0ff, 0.75);
moon.position.set(-80, 140, -60);
moon.castShadow = true;
moon.shadow.mapSize.set(2048,2048);
moon.shadow.camera.left = -200;
moon.shadow.camera.right = 200;
moon.shadow.camera.top = 200;
moon.shadow.camera.bottom = -200;
moon.shadow.camera.far = 400;
scene.add(moon);

// soft fill light that follows the player so nearby buildings and the
// character itself are never lost in the dark, cyberpunk-neon-lit streets
const playerFill = new THREE.PointLight(0xbfd0ff, 0.9, 26);
playerFill.position.set(0, 6, 0);
scene.add(playerFill);

// ---------------------------------------------------------------------------
// GROUND / ROADS
// ---------------------------------------------------------------------------
const groundMat = new THREE.MeshStandardMaterial({ color:0x1a1624, roughness:0.95, metalness:0.1 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF*2.4, CITY_HALF*2.4), groundMat);
ground.rotation.x = -Math.PI/2;
ground.receiveShadow = true;
scene.add(ground);

// road grid lines (emissive strips)
function addRoadGrid() {
  const roadMat = new THREE.MeshBasicMaterial({ color:0x1a1030 });
  const lineMat = new THREE.MeshBasicMaterial({ color:0x38f4ff, transparent:true, opacity:0.55 });
  for (let x = -CITY_HALF; x <= CITY_HALF; x += BLOCK) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(6, CITY_HALF*2), roadMat);
    road.rotation.x = -Math.PI/2; road.position.set(x, 0.01, 0);
    scene.add(road);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.25, CITY_HALF*2), lineMat);
    line.rotation.x = -Math.PI/2; line.position.set(x, 0.02, 0);
    scene.add(line);
  }
  for (let z = -CITY_HALF; z <= CITY_HALF; z += BLOCK) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF*2, 6), roadMat);
    road.rotation.x = -Math.PI/2; road.position.set(0, 0.01, z);
    scene.add(road);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF*2, 0.25), lineMat);
    line.rotation.x = -Math.PI/2; line.position.set(0, 0.02, z);
    scene.add(line);
  }
}
addRoadGrid();

// ---------------------------------------------------------------------------
// DISTRICTS — inspired by Night City's mix of glittering corpo towers
// and crumbling slum sprawl
// ---------------------------------------------------------------------------
// District determined by distance from center & angle -> gives radial corpo
// core, mixed mid-ring, and poor outer sprawl (like Watson / Pacifica vibes)
function districtAt(x, z) {
  const d = Math.sqrt(x*x + z*z);
  if (d < 70) return 'CORPO PLAZA';
  if (d < 140) return 'MIDTOWN SPRAWL';
  return 'THE SLUMS';
}

const neonPalette = [0xff2fd0, 0x38f4ff, 0xffd23f, 0x7fffd4, 0xff5252, 0xb14dff, 0x00ff9c];

function rand(min, max) { return min + Math.random()*(max-min); }
function choice(arr) { return arr[Math.floor(Math.random()*arr.length)]; }

// ---------------------------------------------------------------------------
// CHARACTER RIG — shared articulated humanoid builder used for the player
// and every pedestrian, with animated arm/leg swing while walking
// ---------------------------------------------------------------------------
function buildCharacterRig(scale, colors) {
  const jacketMat = new THREE.MeshStandardMaterial({ color: colors.jacket, roughness:0.55, metalness:0.35 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: colors.pants, roughness:0.85 });
  const skinMat = new THREE.MeshStandardMaterial({ color: colors.skin, roughness:0.85 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness:0.6, metalness:0.4 });
  const hairMat = new THREE.MeshStandardMaterial({ color: colors.hair, roughness:0.7 });
  const accentMat = new THREE.MeshBasicMaterial({ color: colors.accent });

  const rig = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.92 * scale;
  rig.add(hips);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.30*scale, 0.40*scale, 0.85*scale, 10), jacketMat);
  torso.position.y = 0.5*scale;
  torso.castShadow = true;
  hips.add(torso);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.36*scale, 10, 8), jacketMat);
  chest.position.y = 0.92*scale;
  chest.scale.y = 0.75;
  chest.castShadow = true;
  hips.add(chest);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.2*scale, 0.045*scale, 6, 12), jacketMat);
  collar.position.y = 1.1*scale;
  collar.rotation.x = Math.PI/2;
  hips.add(collar);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23*scale, 12, 12), skinMat);
  head.position.y = 1.4*scale;
  head.castShadow = true;
  hips.add(head);

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.24*scale, 10, 8, 0, Math.PI*2, 0, Math.PI*0.55), hairMat);
  hair.position.y = 1.45*scale;
  hips.add(hair);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32*scale, 0.06*scale, 0.05*scale), accentMat);
  visor.position.set(0, 1.42*scale, 0.2*scale);
  hips.add(visor);

  function buildArm(sign) {
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(sign*0.36*scale, 0.92*scale, 0);
    const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.075*scale,0.09*scale,0.4*scale,8), jacketMat);
    upperArm.position.y = -0.2*scale;
    upperArm.castShadow = true;
    shoulderPivot.add(upperArm);

    const lowerArmPivot = new THREE.Group();
    lowerArmPivot.position.y = -0.4*scale;
    const lowerArm = new THREE.Mesh(new THREE.CylinderGeometry(0.065*scale,0.075*scale,0.36*scale,8), skinMat);
    lowerArm.position.y = -0.18*scale;
    lowerArm.castShadow = true;
    lowerArmPivot.add(lowerArm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075*scale,8,8), skinMat);
    hand.position.y = -0.38*scale;
    lowerArmPivot.add(hand);
    shoulderPivot.add(lowerArmPivot);

    hips.add(shoulderPivot);
    return shoulderPivot;
  }
  const leftShoulder = buildArm(-1);
  const rightShoulder = buildArm(1);

  function buildLeg(sign) {
    const hipPivot = new THREE.Group();
    hipPivot.position.set(sign*0.15*scale, 0, 0);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.105*scale,0.12*scale,0.46*scale,8), pantsMat);
    thigh.position.y = -0.23*scale;
    thigh.castShadow = true;
    hipPivot.add(thigh);

    const shinPivot = new THREE.Group();
    shinPivot.position.y = -0.46*scale;
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.085*scale,0.1*scale,0.44*scale,8), pantsMat);
    shin.position.y = -0.22*scale;
    shin.castShadow = true;
    shinPivot.add(shin);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.15*scale,0.11*scale,0.25*scale), bootMat);
    boot.position.set(0, -0.44*scale, 0.05*scale);
    shinPivot.add(boot);
    hipPivot.add(shinPivot);

    hips.add(hipPivot);
    return hipPivot;
  }
  const leftHip = buildLeg(-1);
  const rightHip = buildLeg(1);

  return {
    group: rig,
    hips,
    walkTime: Math.random()*10,
    parts: { leftShoulder, rightShoulder, leftHip, rightHip }
  };
}

function animateRig(rig, dt, moving, speedFactor) {
  const p = rig.parts;
  if (moving) {
    rig.walkTime += dt * speedFactor;
    const swing = Math.sin(rig.walkTime) * 0.55;
    p.leftHip.rotation.x = swing;
    p.rightHip.rotation.x = -swing;
    p.leftShoulder.rotation.x = -swing * 0.9;
    p.rightShoulder.rotation.x = swing * 0.9;
  } else {
    p.leftHip.rotation.x *= 0.8;
    p.rightHip.rotation.x *= 0.8;
    p.leftShoulder.rotation.x *= 0.8;
    p.rightShoulder.rotation.x *= 0.8;
  }
}

// ---------------------------------------------------------------------------
// BUILDINGS
// ---------------------------------------------------------------------------
const buildingBoxes = []; // for simple collision {minX,maxX,minZ,maxZ}
const buildingsGroup = new THREE.Group();
scene.add(buildingsGroup);

// Canvas-generated window-grid textures, pooled and reused across many
// buildings so we get real lit facades without per-building texture cost
function makeWindowTexture(cols, rows, poor) {
  const cell = 16;
  const canvas = document.createElement('canvas');
  canvas.width = cols*cell; canvas.height = rows*cell;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = poor ? '#241f28' : '#1c1a2c';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  for (let r=0;r<rows;r++) {
    for (let c=0;c<cols;c++) {
      const x = c*cell+2, y = r*cell+2, s = cell-4;
      const litChance = poor ? 0.22 : 0.48;
      if (Math.random() < litChance) {
        const col = choice(neonPalette);
        ctx.globalAlpha = poor ? rand(0.35,0.65) : rand(0.7,1);
        ctx.fillStyle = '#' + col.toString(16).padStart(6,'0');
        ctx.fillRect(x,y,s,s);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = poor ? 'rgba(120,110,98,0.55)' : 'rgba(130,138,168,0.4)';
        ctx.fillRect(x,y,s,s);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  return tex;
}
const richWindowTexPool = [makeWindowTexture(8,16,false), makeWindowTexture(6,20,false), makeWindowTexture(10,14,false), makeWindowTexture(8,10,false)];
const poorWindowTexPool = [makeWindowTexture(6,8,true), makeWindowTexture(5,6,true), makeWindowTexture(7,9,true)];

function makeFacadeMaterial(poor) {
  const tex = choice(poor ? poorWindowTexPool : richWindowTexPool);
  const baseColor = poor ? choice([0x453d4a, 0x3d3542, 0x4a4030, 0x323a3e]) : choice([0x2a2840, 0x2f2a45, 0x252038, 0x2c2440]);
  return new THREE.MeshStandardMaterial({
    color: baseColor, map: tex, emissive: 0xffffff, emissiveMap: tex,
    emissiveIntensity: poor ? 0.5 : 0.85, roughness: poor ? 0.92 : 0.55, metalness: poor ? 0.05 : 0.35
  });
}
function makeRoofMaterial(poor) {
  return new THREE.MeshStandardMaterial({ color: poor ? 0x2c2630 : 0x211d34, roughness:0.9, metalness:0.15 });
}

function addTier(parent, baseY, w, h, d, poor) {
  const sideMat = makeFacadeMaterial(poor);
  const roofMat = makeRoofMaterial(poor);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat]);
  mesh.position.set(0, baseY + h/2, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function createBuilding(cx, cz, poor) {
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);

  const w = poor ? rand(4,8) : rand(6,14);
  const d = poor ? rand(4,8) : rand(6,14);
  let totalH;

  if (!poor && Math.random() < 0.55) {
    // stepped corpo tower — three tiers narrowing toward the top
    const h1 = rand(10,22), h2 = rand(8,18), h3 = rand(6,26);
    addTier(group, 0, w, h1, d, poor);
    addTier(group, h1, w*0.68, h2, d*0.68, poor);
    addTier(group, h1+h2, w*0.4, h3, d*0.4, poor);
    totalH = h1+h2+h3;
  } else {
    totalH = poor ? rand(4,12) : rand(10,32);
    addTier(group, 0, w, totalH, d, poor);
  }

  // lit entrance at street level
  const doorColor = choice(neonPalette);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w*0.4,2.4), 2.1), new THREE.MeshBasicMaterial({ color: doorColor }));
  door.position.set(0, 1.05, d/2+0.03);
  group.add(door);

  if (!poor && totalH > 24 && Math.random() < 0.6) {
    const signColor = choice(neonPalette);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(w*0.5, 1.6, 0.4), new THREE.MeshBasicMaterial({ color: signColor }));
    sign.position.set(0, totalH + 1.0, d*0.2);
    group.add(sign);

    const antennaH = rand(2,5);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.08,antennaH,6), new THREE.MeshStandardMaterial({ color:0x222222 }));
    antenna.position.set(w*0.15, totalH + antennaH/2, -d*0.1);
    group.add(antenna);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12,6,6), new THREE.MeshBasicMaterial({ color:0xff2f2f }));
    beacon.position.set(w*0.15, totalH + antennaH, -d*0.1);
    group.add(beacon);
  }

  if (poor) {
    if (Math.random() < 0.5) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9,0.9,1.4,8), new THREE.MeshStandardMaterial({ color:0x3a3228, roughness:0.9 }));
      tank.position.set(rand(-w*0.2,w*0.2), totalH+0.7, rand(-d*0.2,d*0.2));
      group.add(tank);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.0,0.5,8), new THREE.MeshStandardMaterial({ color:0x2b241c, roughness:0.9 }));
      roof.position.set(tank.position.x, totalH+1.4+0.25, tank.position.z);
      group.add(roof);
    }
    if (Math.random() < 0.5) {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(0.8,0.5,0.8), new THREE.MeshStandardMaterial({ color:0x22221f, roughness:0.8 }));
      ac.position.set(rand(-w*0.25,w*0.25), totalH+0.25, rand(-d*0.25,d*0.25));
      group.add(ac);
    }
    if (Math.random() < 0.5 && totalH > 5) {
      const escapeMat = new THREE.MeshStandardMaterial({ color:0x1a1a1a, metalness:0.6, roughness:0.5 });
      const steps = Math.floor(totalH/2.5);
      for (let i=0;i<steps;i++) {
        const plat = new THREE.Mesh(new THREE.BoxGeometry(1.4,0.08,0.5), escapeMat);
        plat.position.set(w/2+0.7, 1+i*2.5, (i%2===0 ? -0.6 : 0.6));
        group.add(plat);
      }
    }
  }

  buildingsGroup.add(group);
  buildingBoxes.push({
    minX: cx - w/2 - 0.6, maxX: cx + w/2 + 0.6,
    minZ: cz - d/2 - 0.6, maxZ: cz + d/2 + 0.6
  });
}

// place buildings on a grid of blocks, leaving roads clear, skipping a
// starting plaza area near the origin so the player has room to move
function generateCity() {
  for (let x = -CITY_HALF + BLOCK/2; x < CITY_HALF; x += BLOCK) {
    for (let z = -CITY_HALF + BLOCK/2; z < CITY_HALF; z += BLOCK) {
      const dCenter = Math.sqrt(x*x + z*z);
      if (dCenter < 14) continue; // keep spawn plaza clear

      const poor = dCenter > 140 ? Math.random() < 0.85 :
                   dCenter > 70 ? Math.random() < 0.4 : Math.random() < 0.05;

      // 1-3 buildings clustered per block cell, offset randomly
      const count = poor ? (Math.random()<0.5?2:3) : (Math.random()<0.6?1:2);
      for (let i=0;i<count;i++) {
        const ox = rand(-BLOCK*0.32, BLOCK*0.32);
        const oz = rand(-BLOCK*0.32, BLOCK*0.32);
        createBuilding(x+ox, z+oz, poor);
      }
    }
  }
}
generateCity();

// scattered street clutter: neon holo-billboards near the plaza core
function addBillboards() {
  for (let i=0;i<10;i++) {
    const angle = (i/10) * Math.PI * 2;
    const r = rand(30,55);
    const x = Math.cos(angle)*r, z = Math.sin(angle)*r;
    const color = choice(neonPalette);
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(rand(3,6), rand(2,4)), mat);
    board.position.set(x, rand(4,10), z);
    board.lookAt(0, board.position.y, 0);
    scene.add(board);
    const light = new THREE.PointLight(color, 1.0, 16);
    light.position.copy(board.position);
    scene.add(light);
  }
}
addBillboards();

// ---------------------------------------------------------------------------
// STREET LAMPS (line the roads with dim flickering cyan lamps)
// ---------------------------------------------------------------------------
function addStreetLamps() {
  const poleMat = new THREE.MeshStandardMaterial({ color:0x111015, metalness:0.7, roughness:0.4 });
  for (let x = -CITY_HALF+BLOCK; x < CITY_HALF; x += BLOCK*2) {
    for (let z = -CITY_HALF+BLOCK; z < CITY_HALF; z += BLOCK*2) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,4.5,6), poleMat);
      pole.position.set(x+3, 2.25, z+3);
      scene.add(pole);
      const bulbColor = choice([0x38f4ff, 0xff2fd0, 0xffd23f]);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.25,8,8), new THREE.MeshBasicMaterial({color:bulbColor}));
      bulb.position.set(x+3, 4.6, z+3);
      scene.add(bulb);
    }
  }
}
addStreetLamps();

// ---------------------------------------------------------------------------
// STREET DETAIL — crosswalks, traffic lights and outer-district slum props
// ---------------------------------------------------------------------------
const campfires = [];
const trafficSignals = [];

function addCrosswalksAndTrafficLights() {
  const stripeMat = new THREE.MeshBasicMaterial({ color:0xd6deef, transparent:true, opacity:.7 });
  const poleMat = new THREE.MeshStandardMaterial({ color:0x16151b, metalness:.8, roughness:.38 });
  for (let x = -CITY_HALF + BLOCK; x < CITY_HALF; x += BLOCK*2) {
    for (let z = -CITY_HALF + BLOCK; z < CITY_HALF; z += BLOCK*2) {
      // Zebra stripes across both halves of the intersection.
      for (let i=-2; i<=2; i++) {
        const acrossX = new THREE.Mesh(new THREE.PlaneGeometry(1.1,.52), stripeMat);
        acrossX.rotation.x = -Math.PI/2; acrossX.position.set(x+i*1.25,.035,z-4.1); scene.add(acrossX);
        const acrossZ = new THREE.Mesh(new THREE.PlaneGeometry(.52,1.1), stripeMat);
        acrossZ.rotation.x = -Math.PI/2; acrossZ.position.set(x-4.1,.036,z+i*1.25); scene.add(acrossZ);
      }
      // A single paired signal is enough to visually read as an intersection
      // without filling the whole city with hundreds of expensive lights.
      if ((Math.abs(x / BLOCK) + Math.abs(z / BLOCK)) % 2 !== 0) continue;
      for (const corner of [[4.4,4.4],[-4.4,-4.4]]) {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(.09,.11,4.2,8), poleMat);
        pole.position.y = 2.1; g.add(pole);
        const housing = new THREE.Mesh(new THREE.BoxGeometry(.48,1.25,.4), poleMat);
        housing.position.y = 3.5; g.add(housing);
        const lamps = [];
        for (const [index, color] of [[0,0xff3030],[1,0xffbb28],[2,0x35ff80]]) {
          const material = new THREE.MeshStandardMaterial({ color, emissive:color, emissiveIntensity:index === 0 ? 1.8 : .12 });
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(.12,8,8), material);
          lamp.position.set(0,3.85-index*.36,.215); g.add(lamp); lamps.push(material);
        }
        g.position.set(x+corner[0],0,z+corner[1]); scene.add(g);
        trafficSignals.push({ lamps, phase:Math.random()*9 });
      }
    }
  }
}

function addSlumProps() {
  const dumpsterMat = new THREE.MeshStandardMaterial({ color:0x30484a, roughness:.78, metalness:.45 });
  const lidMat = new THREE.MeshStandardMaterial({ color:0x223638, roughness:.7, metalness:.55 });
  const wheelMat = new THREE.MeshStandardMaterial({ color:0x111217, roughness:.9 });
  const graffitiMat = new THREE.MeshBasicMaterial({ color:0xff2fd0 });
  for (let i=0; i<105; i++) {
    let x=0, z=0, tries=0;
    do { x=rand(-CITY_HALF+12,CITY_HALF-12); z=rand(-CITY_HALF+12,CITY_HALF-12); tries++; }
    while ((Math.hypot(x,z) < 142 || isInsideBuilding(x,z)) && tries < 24);
    const g = new THREE.Group();
    const bin = new THREE.Mesh(new THREE.BoxGeometry(1.7,1.15,.82), dumpsterMat);
    bin.position.y=.62; bin.castShadow=bin.receiveShadow=true; g.add(bin);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.78,.12,.88), lidMat);
    lid.position.set(0,1.23,-.03); lid.rotation.x=rand(-.16,.13); g.add(lid);
    for (const wheelX of [-.63,.63]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.12,8), wheelMat);
      wheel.rotation.z=Math.PI/2; wheel.position.set(wheelX,.13,.3); g.add(wheel);
    }
    if (Math.random() < .62) {
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(.75,.24), graffitiMat);
      tag.position.set(0,.72,.421); g.add(tag);
    }
    g.position.set(x,0,z); g.rotation.y=rand(0,Math.PI*2); scene.add(g);
  }
  for (let i=0; i<42; i++) {
    let x=0, z=0, tries=0;
    do {
      const angle=rand(0,Math.PI*2), radius=rand(148,CITY_HALF-18);
      x=Math.cos(angle)*radius; z=Math.sin(angle)*radius; tries++;
    } while (isInsideBuilding(x,z) && tries < 20);
    const g = new THREE.Group();
    const logMat = new THREE.MeshStandardMaterial({ color:0x2b1710, roughness:.95 });
    for (const rot of [0,Math.PI/2]) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(.11,.14,1.35,7), logMat);
      log.rotation.z=Math.PI/2; log.rotation.y=rot; log.position.y=.14; g.add(log);
    }
    const flameMat = new THREE.MeshBasicMaterial({ color:0xff6b25, transparent:true, opacity:.9 });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.44,1.35,7), flameMat);
    flame.position.y=.78; g.add(flame);
    const glow = new THREE.PointLight(0xff6125,2.2,12); glow.position.y=.8; g.add(glow);
    g.position.set(x,0,z); scene.add(g);
    campfires.push({ flame, glow, phase:Math.random()*Math.PI*2 });
  }
}

function updateStreetProps(elapsed) {
  for (const fire of campfires) {
    const flicker=.82+Math.sin(elapsed*11+fire.phase)*.18+Math.sin(elapsed*17+fire.phase)*.08;
    fire.flame.scale.set(.9*flicker, flicker, .9*flicker);
    fire.glow.intensity=2.1*flicker;
  }
  for (const signal of trafficSignals) {
    const phase=(elapsed+signal.phase)%9;
    const active=phase<4 ? 0 : phase<5 ? 1 : 2;
    signal.lamps.forEach((lamp,index) => lamp.emissiveIntensity=index===active ? 1.9 : .1);
  }
}

addCrosswalksAndTrafficLights();
addSlumProps();

// ---------------------------------------------------------------------------
// PEDESTRIANS — simple capsule NPCs wandering the sectors, denser in slums
// ---------------------------------------------------------------------------
const pedestrians = [];
const PLAYER_COLLISION_RADIUS = 0.52;
const PEDESTRIAN_COLLISION_RADIUS = 0.42;
// Level-of-simulation radii (measured from the player):
//  - within ACTIVE: full AI + skeletal animation
//  - ACTIVE..VISIBLE: still rendered, but frozen (no mixer/AI cost)
//  - beyond VISIBLE: hidden entirely (skips draw, skinning and shadow work)
// This is what keeps the frame budget flat as the crowd grows.
const PED_ACTIVE_RADIUS = 80;
const PED_VISIBLE_RADIUS = 155;
const PED_ACTIVE_R2 = PED_ACTIVE_RADIUS * PED_ACTIVE_RADIUS;
const PED_VISIBLE_R2 = PED_VISIBLE_RADIUS * PED_VISIBLE_RADIUS;
const pedestrianJackets = [0x524f68, 0x5c4a4a, 0x435068, 0x604a5c, 0x4a6050, 0x484556, 0x6e3d5c, 0x3d5c6e];
const maleJackets = [0x253b5c, 0x3d4658, 0x4d3047, 0x303845, 0x344d48];
const femaleJackets = [0x8a285c, 0x553d88, 0x117078, 0x7a3d58, 0x9a5a28];
const pedestrianSkins = [0xc9a889, 0xd9b48f, 0x9c7a5c, 0x5c4736, 0xe0c4a0];
const pedestrianHair = [0x1a1620, 0x2a2340, 0x4a1030, 0x104a3a, 0x3a2010, 0x101010];

function createPedestrian(x, z, gender) {
  gender = gender || (Math.random() < 0.46 ? 'woman' : 'man');
  const scale = 1.0; // built at unit scale, then normalized to CHARACTER_HEIGHT below
  const colors = {
    jacket: choice(gender === 'woman' ? femaleJackets : maleJackets),
    pants: choice([0x14131a, 0x1c1a22, 0x201c1c]),
    skin: choice(pedestrianSkins),
    hair: choice(pedestrianHair),
    accent: choice(neonPalette)
  };
  const rig = buildCharacterRig(scale, colors);
  const group = rig.group;

  // occasional neon cybernetic implant glow on the head
  if (Math.random() < 0.35) {
    const accent = new THREE.Mesh(new THREE.SphereGeometry(0.06*scale,6,6), new THREE.MeshBasicMaterial({ color: colors.accent }));
    accent.position.set(0.18*scale, 1.4*scale, 0.16*scale);
    rig.parts.leftShoulder.parent.add(accent); // attach to hips group (head's parent)
  }

  // Normalize every rig to one uniform height so all NPCs (and the FBX models,
  // which use the same CHARACTER_HEIGHT) read as the same size.
  group.updateMatrixWorld(true);
  const rigBox = new THREE.Box3().setFromObject(group);
  const rigH = Math.max(0.01, rigBox.max.y - rigBox.min.y);
  group.scale.setScalar(CHARACTER_HEIGHT / rigH);

  group.position.set(x, 0, z);
  group.userData = {
    angle: Math.random()*Math.PI*2,
    speed: rand(0.6, 1.4),
    changeTimer: rand(1,4),
    home: new THREE.Vector3(x,0,z),
    roam: rand(45, 120), // wide territory so they walk real distances, not in place
    collisionRadius: PEDESTRIAN_COLLISION_RADIUS,
    gender: gender,
    rig: rig,
    isCriminal: Math.random() < 0.22,
    shootTimer: rand(2,5)
  };
  scene.add(group);
  pedestrians.push(group);
  return group;
}

const bullets = [];
let playerAlive = true;
let playerDeathHeld = false;   // true once the collapsed death pose is frozen
let deathScreenShown = false;  // guards the game-over overlay against double-show

// Builds the "YOU WERE TAKEN DOWN" overlay. Called after the death animation
// has played and the body has been hidden (or on a timer if there's no model).
function showDeathScreen() {
  if (deathScreenShown) return;
  deathScreenShown = true;
  const ov = document.createElement('div');
  ov.style.position = 'fixed';
  ov.style.inset = '0';
  ov.style.display = 'flex';
  ov.style.alignItems = 'center';
  ov.style.justifyContent = 'center';
  ov.style.background = 'rgba(0, 0, 0, 0.95)';
  ov.style.color = '#ff4f7a';
  ov.style.fontFamily = 'Courier New, monospace';
  ov.style.fontSize = '26px';
  ov.style.textAlign = 'center';
  ov.style.padding = '32px';
  ov.style.lineHeight = '1.6';
  ov.style.zIndex = '9999';
  ov.innerHTML = '<div style="max-width:680px;"><div style="font-size:34px; font-weight:700; margin-bottom:24px; letter-spacing:0.18em; color:#ff2f66;">YOU WERE TAKEN DOWN</div><div style="font-size:22px; color:#f0e6ff;">The streets of Neo-Vanguard are hostile.<br>Try again and survive longer.</div><button id="restartBtn" style="margin-top:30px; padding:14px 28px; border:none; border-radius:999px; font-size:16px; cursor:pointer; background:#38f4ff; color:#05010a; font-weight:700; transition:transform .15s ease;">RESTART</button></div>';
  document.body.appendChild(ov);
  const btn = document.getElementById('restartBtn');
  if (btn) btn.addEventListener('click', () => window.location.reload());
}

function handlePlayerDamage(amount) {
  if (!playerAlive) return;
  playerHealth = Math.max(0, playerHealth - amount);
  showHudMessage('HIT BY CRIMINAL FIRE');
  if (healthFillEl) {
    const pct = Math.max(0, Math.min(1, playerHealth / playerMaxHealth));
    healthFillEl.style.transform = `scaleX(${pct})`;
  }
  if (playerHealth <= 0) {
    playerAlive = false;
    // With the animated model, updatePlayerAnimation plays the death clip,
    // freezes the collapsed pose, hides the body, then calls showDeathScreen().
    // The procedural fallback has no death clip, so show it on a short timer.
    if (!playerMixer) setTimeout(showDeathScreen, 1200);
  }
}

function shootAtPlayer(shooter) {
  if (!playerAlive) return;
  const origin = shooter.position.clone();
  origin.y = 1.5;
  const direction = player.position.clone().sub(origin).normalize();
  const bullet = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd847 })
  );
  bullet.position.copy(origin);
  scene.add(bullet);
  bullets.push({ mesh: bullet, vel: direction.multiplyScalar(26), life: 2.2 });
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.mesh.position.addScaledVector(b.vel, dt);
    b.life -= dt;
    if (b.life <= 0) {
      scene.remove(b.mesh);
      bullets.splice(i, 1);
      continue;
    }
    const hitDist = b.mesh.position.distanceTo(player.position);
    if (hitDist < 1.0 && playerAlive) {
      scene.remove(b.mesh);
      bullets.splice(i, 1);
      handlePlayerDamage(damagePerShot);
    }
  }
}

const playerShots = [];
let playerShotCooldown = 0;

// Gunshot hit effect: a 3-frame burst (the B100_nyknck sprite sheet) that flares
// on a struck NPC to sell the impact.
const gunshotFrames = ['B100', 'B101', 'B102'].map(n => new THREE.TextureLoader().load(`B100_nyknck/${n}.png`));
const gunshots = [];
function spawnGunshot(x, y, z) {
  const mat = new THREE.SpriteMaterial({ map: gunshotFrames[0], transparent: true, depthTest: false, blending: THREE.AdditiveBlending });
  const spr = new THREE.Sprite(mat);
  spr.position.set(x, y, z);
  spr.scale.setScalar(1.1);
  scene.add(spr);
  gunshots.push({ sprite: spr, mat, t: 0, frame: 0 });
}
function updateGunshots(dt) {
  for (let i = gunshots.length - 1; i >= 0; i--) {
    const g = gunshots[i];
    g.t += dt;
    const frame = Math.min(2, Math.floor(g.t / 0.05));
    if (frame !== g.frame) { g.frame = frame; g.mat.map = gunshotFrames[frame]; g.mat.needsUpdate = true; }
    g.mat.opacity = Math.max(0, 1 - g.t / 0.22);
    g.sprite.scale.setScalar(1.1 + g.t * 2.4); // expanding burst
    if (g.t > 0.22) { scene.remove(g.sprite); g.mat.dispose(); gunshots.splice(i, 1); }
  }
}

function knockDownPedestrian(pedestrian) {
  const ud = pedestrian.userData;
  if (ud.dead) return;
  ud.dead = true;
  ud.isCriminal = false;
  // Pitch (x) is applied relative to heading (y) so the body topples backward,
  // not sideways — landing flat on its back like a downed/sleeping figure.
  pedestrian.rotation.order = 'YXZ';
  if (ud.mixer) ud.mixer.stopAllAction();
  if (ud.isQuestTarget) {
    pedestrian.visible = false;
    advanceQuest();
  } else {
    showHudMessage('TARGET DOWN');
  }
}

function firePlayerWeapon(event) {
  if (controlLocked || !playerAlive || playerShotCooldown > 0 || endgameTriggered) return;
  playerShotCooldown = .24;
  const origin = new THREE.Vector3();
  playerGun.muzzle.getWorldPosition(origin);
  playerGun.flash.visible = true;
  playerGun.flashTime = .055;
  const pointer = new THREE.Vector2(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );
  const cursorRay = new THREE.Raycaster();
  cursorRay.setFromCamera(pointer, camera);
  const aimPoint = new THREE.Vector3();
  const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.15);
  if (!cursorRay.ray.intersectPlane(aimPlane, aimPoint)) aimPoint.copy(origin).add(cursorRay.ray.direction.multiplyScalar(40));
  const aim = aimPoint.sub(origin).normalize();
  // Aim-assist targeting: test the shot ray against each NPC's vertical body
  // capsule instead of raycasting the mesh. Three.js raycasts a SkinnedMesh in
  // its BIND pose, not the animated pose, so mesh hits land where the character
  // visibly ISN'T — which made them very hard to click. A generous capsule makes
  // shooting reliable regardless of the walk animation.
  const HIT_RADIUS = 1.15;   // horizontal forgiveness around the NPC centre line
  const torsoY = 1.0;
  let hitRoot = null, hitT = 24, bestT = Infinity;
  const proj = new THREE.Vector3();
  for (const p of pedestrians) {
    if (!p.visible || p.userData.dead) continue;
    const cx = p.position.x, cz = p.position.z;
    const t = (cx - origin.x) * aim.x + (torsoY - origin.y) * aim.y + (cz - origin.z) * aim.z;
    if (t < 0.4 || t > 55) continue;              // behind the muzzle or out of range
    proj.copy(origin).addScaledVector(aim, t);     // closest point on the ray
    const d = Math.hypot(proj.x - cx, proj.z - cz);
    if (d < HIT_RADIUS && Math.abs(proj.y - torsoY) < 1.3 && t < bestT) {
      bestT = t; hitRoot = p; hitT = t;
    }
  }
  const tracerLen = hitRoot ? hitT : 24;
  const tracer = new THREE.Mesh(new THREE.BoxGeometry(.06,.06, tracerLen), new THREE.MeshBasicMaterial({ color:0xffd23f }));
  tracer.position.copy(origin).addScaledVector(aim, tracerLen / 2);
  tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), aim);
  scene.add(tracer);
  playerShots.push({ mesh: tracer, life: .07 });
  if (!hitRoot) return;
  spawnGunshot(hitRoot.position.x, 1.15, hitRoot.position.z); // impact flash on every hit
  hitRoot.userData.health = (hitRoot.userData.health || (hitRoot.userData.isQuestTarget ? 4 : 1)) - 1;
  if (hitRoot.userData.isQuestTarget && hitRoot.userData.health > 0) {
    showHudMessage(`RAZOR HIT — ${hitRoot.userData.health} ARMOR`);
  } else knockDownPedestrian(hitRoot);
}

function updatePlayerShots(dt) {
  playerShotCooldown = Math.max(0, playerShotCooldown - dt);
  playerGun.flashTime = Math.max(0, playerGun.flashTime - dt);
  playerGun.flash.visible = playerGun.flashTime > 0;
  for (let i=playerShots.length-1; i>=0; i--) {
    playerShots[i].life -= dt;
    if (playerShots[i].life <= 0) { scene.remove(playerShots[i].mesh); playerShots.splice(i,1); }
  }
}

function generatePedestrians() {
  // Safe to raise now that distance culling bounds per-frame cost to the NPCs
  // actually near the player rather than the whole population.
  const total = 200;
  for (let i=0;i<total;i++) {
    let x,z,tries=0;
    do {
      x = rand(-CITY_HALF+10, CITY_HALF-10);
      z = rand(-CITY_HALF+10, CITY_HALF-10);
      tries++;
    } while ((isInsideBuilding(x,z) || pedestrians.some(p => Math.hypot(x - p.position.x, z - p.position.z) < PEDESTRIAN_COLLISION_RADIUS * 2)) && tries < 20);
    createPedestrian(x,z, Math.random() < 0.46 ? 'woman' : 'man');
  }
}

function isInsideBuilding(x,z) {
  for (const b of buildingBoxes) {
    if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
  }
  return false;
}

generatePedestrians();

// ---------------------------------------------------------------------------
// FBX PEDESTRIAN MODELS
// ---------------------------------------------------------------------------
// The source files are used as animated templates.  Only a limited number of
// high-detail clones are placed in the city: rendering every 25 MB FBX 140
// times would make the game unplayable, while the light rigs remain a reliable
// fallback during loading or if a model cannot be fetched.
const MODELLED_PEDESTRIANS_PER_GENDER = 16;

function tintModelMaterials(model, tint) {
  model.traverse(child => {
    if (!child.isMesh || !child.material) return;
    const isMaterialArray = Array.isArray(child.material);
    const materials = isMaterialArray ? child.material : [child.material];
    const tintedMaterials = materials.map(mat => {
      const clone = mat.clone();
      if (clone.color) clone.color.multiply(tint);
      if (clone.emissive) clone.emissive.multiplyScalar(0.35);
      return clone;
    });
    child.material = isMaterialArray ? tintedMaterials : tintedMaterials[0];
    // Skinned pedestrians do NOT cast shadows: the shadow pass re-skins every
    // character and is one of the heaviest costs when there are many NPCs. The
    // hero player model still casts a shadow, so the scene keeps grounding.
    child.castShadow = false;
    child.receiveShadow = true;
  });
}

// If a rig is authored Z-up (e.g. the CyberWoman Character-Creator model) it
// imports lying flat; stand it upright before any measurement.
function correctUpAxis(model) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  if ((box.max.z - box.min.z) > (box.max.y - box.min.y) * 1.4) {
    model.rotation.x = -Math.PI / 2; // Z-up -> Y-up, head to +Y
    model.updateMatrixWorld(true);
  }
}

// Scale a humanoid so its HEAD JOINT sits at a fixed world height, then drop its
// feet to the ground. Normalizing by the head bone (not the raw bounding box)
// means hair, headgear or a held prop above the crown can't shrink the visible
// body — that inflated box is exactly what made the CyberWoman rig import short.
// Returns the grounded local Y so an animated bob can be layered on top.
const HEAD_TARGET_Y = 1.65; // world height of the head joint for every character
function fitCharacterHeight(model, heightScale) {
  heightScale = heightScale || 1;
  correctUpAxis(model);
  let box = new THREE.Box3().setFromObject(model);
  let headBone = null;
  model.traverse(o => {
    if (o.isBone && !headBone && /head/i.test(o.name) && !/(end|top|nub)/i.test(o.name)) headBone = o;
  });
  let scale;
  if (headBone) {
    const wp = new THREE.Vector3();
    headBone.getWorldPosition(wp);
    scale = (HEAD_TARGET_Y * heightScale) / Math.max(0.01, wp.y - box.min.y);
  } else {
    scale = (CHARACTER_HEIGHT * heightScale) / Math.max(0.01, box.max.y - box.min.y);
  }
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);
  const grounded = new THREE.Box3().setFromObject(model);
  model.position.y -= grounded.min.y; // feet on the ground plane
  model.updateMatrixWorld(true);
  return model.position.y;
}

// Remove every translation track so a locomotion clip animates strictly in
// place (limbs still swing via rotation). Baked-in root motion is what made
// Nathan's walk visibly snap back to the start each loop.
function makeClipInPlace(clip) {
  if (!clip) return clip;
  clip.tracks = clip.tracks.filter(t => !/\.position$/.test(t.name));
  return clip;
}

// Different Mixamo exports prefix bones as "mixamorig" or "mixamorig2"; a clip
// only binds when its track prefix matches the model's bones. Rewrite the clip's
// prefix to the target model's so e.g. Sleeping Idle drives the Ch22 skeleton.
function retargetMixamoClip(clip, model) {
  if (!clip) return clip;
  let prefix = null;
  model.traverse(o => { if (o.isBone && !prefix) { const m = o.name.match(/^(mixamorig\d*)/); if (m) prefix = m[1]; } });
  if (prefix) clip.tracks.forEach(t => { t.name = t.name.replace(/^mixamorig\d*/, prefix); });
  return clip;
}

function replaceWithFBXPedestrian(pedestrian, template, gender, index) {
  const clone = THREE.SkeletonUtils && THREE.SkeletonUtils.clone ? THREE.SkeletonUtils.clone(template) : template.clone(true);
  // CyberWoman (women) render 20% larger than everyone else, per design.
  const groundY = fitCharacterHeight(clone, gender === 'woman' ? 1.2 : 1.0);
  tintModelMaterials(clone, new THREE.Color(gender === 'woman' ? choice([0xff72b8, 0xa985ff, 0x4eeaff]) : choice([0x77a8ff, 0x76d9bb, 0xffb15e])));

  pedestrian.clear();
  // The group carried a scale that normalized the *procedural* rig's height.
  // fitCharacterHeight already sized the clone, so reset the group to identity —
  // otherwise the leftover scale shrinks the model (was ~1.36 vs 1.9).
  pedestrian.scale.setScalar(1);
  pedestrian.add(clone);
  pedestrian.userData.modelled = true;
  pedestrian.userData.rig = null;
  pedestrian.userData.groundY = groundY;   // feet-on-ground offset the bob adds to
  pedestrian.userData.modelWalkPhase = index * 0.8;

  if (template.animations && template.animations.length) {
    const mixer = new THREE.AnimationMixer(clone);
    mixer.clipAction(template.animations[0]).setEffectiveWeight(1).play();
    pedestrian.userData.mixer = mixer;
  }
}

function loadPedestrianModel(url, gender) {
  if (!THREE.FBXLoader) {
    console.warn('FBXLoader was unavailable; using procedural pedestrian fallback.');
    return;
  }
  const loader = new THREE.FBXLoader();
  loader.load(url, template => {
    template.updateMatrixWorld(true);
    // Strip baked root motion so the shared walk clip loops seamlessly in place;
    // the pedestrian's world position is driven by the wander code instead.
    if (template.animations && template.animations[0]) makeClipInPlace(template.animations[0]);
    // Two named showcase walkers are placed on the clear spawn plaza so the
    // imported assets are visible immediately in every run.
    const showcasePos = gender === 'woman' ? new THREE.Vector3(5, 0, 4) : new THREE.Vector3(-5, 0, 4);
    const showcase = createPedestrian(showcasePos.x, showcasePos.z, gender);
    showcase.userData.home.copy(showcasePos);
    showcase.userData.roam = 30; // roam the plaza instead of circling one spot
    replaceWithFBXPedestrian(showcase, template, gender, 0);
    const candidates = pedestrians.filter(p => p.userData.gender === gender && !p.userData.isQuestTarget)
      .filter(p => p !== showcase)
      .sort((a, b) => a.position.lengthSq() - b.position.lengthSq())
      .slice(0, MODELLED_PEDESTRIANS_PER_GENDER);
    candidates.forEach((pedestrian, index) => replaceWithFBXPedestrian(pedestrian, template, gender, index));
  }, undefined, error => console.warn(`Unable to load ${gender} pedestrian FBX.`, error));
}

loadPedestrianModel('./CyberWoman/source/WOMAN%20CYBER%20BY%20Oscar%20creativo.fbx', 'woman');
loadPedestrianModel('./rp-nathan-animated-003-walking/source/rp_nathan_animated_003_walking.fbx', 'man');

const vehicles = [];
let currentVehicle = null;

function createVehicle(x, z, direction, speed, color) {
  const car = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness:.28, metalness:.65 });
  const trim = new THREE.MeshStandardMaterial({ color:0x10121a, roughness:.35, metalness:.8 });
  const glass = new THREE.MeshStandardMaterial({ color:0x152b45, roughness:.12, metalness:.7, transparent:true, opacity:.78 });
  const rubber = new THREE.MeshStandardMaterial({ color:0x090a0e, roughness:.82 });
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.82,.46,3.65), paint);
  chassis.position.y = .55; chassis.castShadow = chassis.receiveShadow = true; car.add(chassis);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.72,.2,1.05), paint);
  hood.position.set(0,.88,1.08); hood.castShadow = true; car.add(hood);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5,.67,1.72), glass);
  cabin.position.set(0,1.14,-.28); cabin.castShadow = true; car.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.55,.1,1.28), paint);
  roof.position.set(0,1.49,-.3); car.add(roof);
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.86,.18,.14), trim);
  bumper.position.set(0,.42,1.87); car.add(bumper);
  const rearBumper = bumper.clone(); rearBumper.position.z = -1.87; car.add(rearBumper);
  for (const wheelX of [-.98,.98]) for (const wheelZ of [-1.18,1.18]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.22,12), rubber);
    wheel.rotation.z = Math.PI/2; wheel.position.set(wheelX,.36,wheelZ); wheel.castShadow = true; car.add(wheel);
  }
  for (const xPos of [-.58,.58]) {
    const headlight = new THREE.Mesh(new THREE.BoxGeometry(.28,.13,.06), new THREE.MeshBasicMaterial({ color:0xfff5c0 }));
    headlight.position.set(xPos,.7,1.84); car.add(headlight);
    const taillight = new THREE.Mesh(new THREE.BoxGeometry(.28,.13,.06), new THREE.MeshBasicMaterial({ color:0xff3344 }));
    taillight.position.set(xPos,.7,-1.84); car.add(taillight);
  }
  car.position.set(x,.0,z);
  if (direction === 'x') car.rotation.y = Math.PI/2;
  scene.add(car);
  const vehicle = { mesh:car, direction, speed, driveable:true, occupied:false };
  vehicles.push(vehicle);
  return vehicle;
}

function generateVehicles() {
  const colors = [0xff2fd0, 0x38f4ff, 0xffd23f, 0x7fffd4, 0xff5252];
  // The road grid sits exactly at multiples of BLOCK, so a car only stays on a
  // road if its fixed (cross-traffic) coordinate is a multiple of BLOCK. Each
  // car rides one lane off the 6-wide road centre so opposing traffic doesn't
  // overlap. A car's fixed coordinate never changes as it drives + wraps, so it
  // remains on that road for its whole run instead of cutting through blocks.
  const LANE = 1.5;
  const roads = [-3, -2, -1, 1, 2, 3].map(n => n * BLOCK); // road centre-lines (skip spawn road at 0)
  for (const c of roads) {
    // horizontal road at z = c  -> traffic travels along X, one lane each way
    createVehicle(-CITY_HALF - 18 - Math.random()*14, c - LANE, 'x',  rand(4.2, 6.2), choice(colors));
    createVehicle( CITY_HALF + 18 + Math.random()*14, c + LANE, 'x', -rand(4.2, 6.2), choice(colors));
    // vertical road at x = c  -> traffic travels along Z
    createVehicle(c + LANE, -CITY_HALF - 18 - Math.random()*14, 'z',  rand(4.2, 6.2), choice(colors));
    createVehicle(c - LANE,  CITY_HALF + 18 + Math.random()*14, 'z', -rand(4.2, 6.2), choice(colors));
  }
}

generateVehicles();
// A parked vehicle guarantees that the driving mechanic can be found right
// after the opening sequence.
createVehicle(2, -2, 'z', 0, 0xff2fd0);

// ---------------------------------------------------------------------------
// WAREHOUSE (endgame target in world)
// ---------------------------------------------------------------------------
// Warehouse target (endgame)
const warehousePos = new THREE.Vector3(CITY_HALF - 30, 0, -CITY_HALF + 20);

function createWarehouseAt(pos) {
  const group = new THREE.Group();
  group.position.copy(pos);

  const baseMat = new THREE.MeshStandardMaterial({ color: 0x1b1620, roughness: 0.85, metalness: 0.2 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xff5252, emissive: 0xff5252, emissiveIntensity: 0.75 });

  const w = 14, d = 20, h = 10;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), baseMat);
  body.position.set(0, h/2, 0);
  body.castShadow = true; body.receiveShadow = true;
  group.add(body);

  // loading bay door
  const door = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 0.5), accentMat);
  door.position.set(0, 3, d/2 + 0.26);
  group.add(door);

  // rooftop antenna
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3, 6), new THREE.MeshStandardMaterial({ color:0x222222 }));
  antenna.position.set(w/4, h + 1.5, -d/6);
  group.add(antenna);

  // subtle beacon
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  beacon.position.set(-w/4, h + 2.1, -d/6);
  group.add(beacon);

  scene.add(group);
  buildingsGroup.add(group);

  // mark warehouse as an obstacle but leave the front doorway open
  const doorHalfWidth = 4.4;
  const doorOpenDepth = 6.5;
  // left side of the warehouse
  buildingBoxes.push({
    minX: pos.x - w/2 - 0.6,
    maxX: pos.x - doorHalfWidth,
    minZ: pos.z - d/2 - 0.6,
    maxZ: pos.z + d/2 + 0.6
  });
  // right side of the warehouse
  buildingBoxes.push({
    minX: pos.x + doorHalfWidth,
    maxX: pos.x + w/2 + 0.6,
    minZ: pos.z - d/2 - 0.6,
    maxZ: pos.z + d/2 + 0.6
  });
  // rear half behind the entrance, leaving a wider front corridor open
  buildingBoxes.push({
    minX: pos.x - doorHalfWidth,
    maxX: pos.x + doorHalfWidth,
    minZ: pos.z - d/2 - 0.6,
    maxZ: pos.z + d/2 - doorOpenDepth
  });
}

// ensure warehousePos isn't inside another building
if (isInsideBuilding(warehousePos.x, warehousePos.z)) {
  // nudge outwards along diagonal until free
  let tries = 0;
  while (isInsideBuilding(warehousePos.x, warehousePos.z) && tries < 40) {
    warehousePos.x -= 6; warehousePos.z += 6; tries++;
  }
}
createWarehouseAt(warehousePos);
const warehouseDoorPos = warehousePos.clone().add(new THREE.Vector3(0, 0, 10.5));

// ---------------------------------------------------------------------------
// PLAYER CHARACTER
// ---------------------------------------------------------------------------
const playerColors = { jacket:0x36324a, pants:0x252235, skin:0xd9b48f, hair:0x3a3050, accent:0xff2fd0 };
const playerRig = buildCharacterRig(1.05, playerColors);
const player = playerRig.group;
const playerVisorGlow = new THREE.PointLight(0xff2fd0, 0.8, 5);
playerVisorGlow.position.set(0, 2.3, 0.2);
player.add(playerVisorGlow);

function createPlayerGun() {
  const gun = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color:0x151721, metalness:.85, roughness:.22 });
  const accentMat = new THREE.MeshStandardMaterial({ color:0xff2fd0, emissive:0xff2fd0, emissiveIntensity:1.1, metalness:.5, roughness:.25 });
  const gripMat = new THREE.MeshStandardMaterial({ color:0x202333, roughness:.65, metalness:.2 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(.22,.22,.72), frameMat);
  body.position.z = .22; gun.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,.38,10), frameMat);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0,.035,.73); gun.add(barrel);
  const slide = new THREE.Mesh(new THREE.BoxGeometry(.18,.1,.5), accentMat);
  slide.position.set(0,.15,.27); gun.add(slide);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(.16,.38,.2), gripMat);
  grip.position.set(0,-.25,.05); grip.rotation.x = -.24; gun.add(grip);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(.05,.06,.12), accentMat);
  sight.position.set(0,.18,.48); gun.add(sight);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0,.035,.94); gun.add(muzzle);
  const flash = new THREE.Mesh(new THREE.ConeGeometry(.13,.4,8), new THREE.MeshBasicMaterial({ color:0xffdc75 }));
  flash.rotation.x = Math.PI / 2; flash.position.z = .17; flash.visible = false; muzzle.add(flash);
  gun.position.set(.48,1.23,.34);
  gun.rotation.set(.08,-.2,.04);
  player.add(gun);
  return { muzzle, flash, flashTime:0 };
}

const playerGun = createPlayerGun();
player.position.set(0, 0, 0);
scene.add(player);
let playerMoving = false;

// ---------------------------------------------------------------------------
// PLAYER MODEL + MIXAMO ANIMATION SYSTEM
// ---------------------------------------------------------------------------
// The visible player body is the Ch22_nonPBR Mixamo character. Every Mixamo
// asset here (the character, Walking, Falling Back Death) shares the identical
// `mixamorig` skeleton, so animation clips retarget onto the character simply
// by binding an AnimationMixer to it — no manual bone remapping required.
// The procedural rig built above stays as a fallback: it is shown until the
// FBX finishes downloading and remains the body if the model fails to load.
const PLAYER_MODEL_HEIGHT = CHARACTER_HEIGHT; // match every other character
let playerModel = null;
let playerMixer = null;
const playerActions = {};   // idle | walk | death
let playerAnimState = null;

// Remove the root-bone translation so a locomotion clip animates "in place":
// the character's world position is driven by the movement code, not the clip.
function stripRootMotion(clip) {
  if (!clip) return clip;
  clip.tracks = clip.tracks.filter(t => !/Hips\.(position)$/i.test(t.name));
  return clip;
}

// Cross-fade helper — the single entry point for changing the player's pose.
function setPlayerAction(name, fade = 0.25) {
  if (!playerMixer || !playerActions[name] || playerAnimState === name) return;
  const next = playerActions[name];
  const prev = playerAnimState ? playerActions[playerAnimState] : null;
  next.reset();
  next.enabled = true;
  next.play();
  if (prev && prev !== next) {
    next.fadeIn(fade);
    prev.fadeOut(fade);
  } else {
    next.setEffectiveWeight(1);
  }
  playerAnimState = name;
}

// Chooses and advances the correct clip every frame. Falls back to the
// procedural limb swing while the model is still loading.
function updatePlayerAnimation(dt, moving, sprinting) {
  if (!playerMixer) { animateRig(playerRig, dt, moving, sprinting ? 12 : 9); return; }
  if (!playerAlive) {
    setPlayerAction('death', 0.3); // slightly slower blend so the collapse reads
    // Freeze the settled dead pose, then hide the body a beat later — it
    // "disappears" before the looping idle can reveal it's still breathing.
    // Sleeping Idle is a long loop, so cap the hold to ~1.4s.
    const d = playerActions.death;
    if (d && !playerDeathHeld) {
      const dur = d.getClip().duration;
      if (d.time >= Math.min(1.4, Math.max(0.01, dur - 0.12))) {
        d.paused = true;
        playerDeathHeld = true;
        setTimeout(() => {
          player.visible = false; // hide body + gun together, before any bind-pose flash
          showDeathScreen();
        }, 700);
      }
    }
    playerMixer.update(dt);
    return;
  } else if (moving) {
    setPlayerAction('walk', 0.2);
    if (playerActions.walk) playerActions.walk.setEffectiveTimeScale(sprinting ? 1.7 : 1.05);
  } else {
    setPlayerAction('idle', 0.25);
    // When there is no dedicated idle clip we hold frame 0 of the walk clone.
    if (playerAnimState === 'idle' && playerActions.idle &&
        playerActions.idle.getClip().name === 'idle-fallback') {
      playerActions.idle.setEffectiveTimeScale(0);
    }
  }
  playerMixer.update(dt);
}

function setupPlayerModel(model, walkClip, deathClip, idleClip) {
  // Head-bone height fit (same as pedestrians) so the player matches every NPC,
  // grounded with feet on the floor. Handles Z-up rigs and prop/hair inflation.
  fitCharacterHeight(model);
  model.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false; // skinned bounds change every frame
    }
  });

  player.add(model);
  playerModel = model;
  playerRig.hips.visible = false; // hide the procedural stand-in body

  playerMixer = new THREE.AnimationMixer(model);
  if (walkClip) {
    walkClip.name = 'walk';
    playerActions.walk = playerMixer.clipAction(walkClip);
  }
  if (deathClip) {
    deathClip.name = 'death';
    const death = playerMixer.clipAction(deathClip);
    death.setLoop(THREE.LoopOnce);
    death.clampWhenFinished = true; // stay collapsed on the last frame
    playerActions.death = death;
  }
  if (idleClip) {
    playerActions.idle = playerMixer.clipAction(idleClip);
  }
  setPlayerAction(playerActions.idle ? 'idle' : (playerActions.walk ? 'walk' : 'idle'), 0);
}

(function loadPlayerModel() {
  if (!THREE.FBXLoader) {
    console.warn('FBXLoader unavailable; player keeps the procedural rig.');
    return;
  }
  const loader = new THREE.FBXLoader();
  const loaded = {};
  let pending = 3;
  const done = () => {
    if (--pending > 0) return;
    if (!loaded.model) {
      console.error('[player] Ch22_nonPBR.fbx did not load — keeping the procedural rig. ' +
        'Check the FBXLoader <script> tag and the file path.');
      return;
    }
    const walkClip = loaded.walk && loaded.walk.animations[0]
      ? stripRootMotion(loaded.walk.animations[0]) : null;
    // Sleeping Idle uses "mixamorig" bones; Ch22 uses "mixamorig2" — rewrite the
    // prefix so the clip binds. Keep its position tracks: they lower the body to
    // the floor for the lying-down pose.
    const deathClip = loaded.death && loaded.death.animations[0]
      ? retargetMixamoClip(loaded.death.animations[0], loaded.model) : null;
    // Prefer an idle baked into the character; otherwise hold a neutral frame
    // of the walk clip so the player stands naturally instead of in a T-pose.
    let idleClip = loaded.model.animations && loaded.model.animations[0] &&
      loaded.model.animations[0].duration > 0.1 ? loaded.model.animations[0] : null;
    if (!idleClip && walkClip) {
      idleClip = walkClip.clone();
      idleClip.name = 'idle-fallback';
    } else if (idleClip) {
      idleClip.name = 'idle';
    }
    console.log('[player] Ch22 loaded. Clips —',
      'walk:', walkClip ? `${walkClip.duration.toFixed(2)}s` : 'MISSING',
      '| death:', deathClip ? `${deathClip.duration.toFixed(2)}s` : 'MISSING',
      '| idle:', idleClip ? `${idleClip.name} ${idleClip.duration.toFixed(2)}s` : 'none');
    setupPlayerModel(loaded.model, walkClip, deathClip, idleClip);
  };
  loader.load('./Ch22_nonPBR.fbx', m => { loaded.model = m; done(); },
    undefined, e => { console.error('[player] Ch22_nonPBR.fbx load error', e); done(); });
  loader.load('./Walking.fbx', m => { loaded.walk = m; done(); },
    undefined, e => { console.error('[player] Walking.fbx load error', e); done(); });
  loader.load('./Sleeping%20Idle.fbx', m => { loaded.death = m; done(); },
    undefined, e => { console.error('[player] Sleeping Idle.fbx load error', e); done(); });
})();

// ---------------------------------------------------------------------------
// OPENING CRASH + CONTRACTS
// ---------------------------------------------------------------------------
// These are gameplay objects, not just text: each contract changes the active
// world marker and advances only when the player performs its objective.
// Positions sit on the road grid, so each marker remains reachable even as
// the procedural buildings change from run to run.
const deliveryPickupPos = new THREE.Vector3(-52, 0, 26);
const deliveryDropPos = new THREE.Vector3(52, 0, 52);
const bountyPos = new THREE.Vector3(-52, 0, -52);
let questStage = 0; // 0 collect, 1 deliver, 2 eliminate, 3 warehouse finale
let packageCollected = false;
let bountyTarget = null;
let controlLocked = true;
let cutsceneActive = false;
let cutsceneElapsed = 0;
let crashPlane;
let crashFire;
const questMarkers = [];

function makeQuestMarker(pos, color, label) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.08, 6, 18), new THREE.MeshBasicMaterial({ color }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.16;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 5, 6), new THREE.MeshBasicMaterial({ color, transparent:true, opacity:.65 }));
  beam.position.y = 2.5;
  group.add(ring, beam);
  group.position.copy(pos);
  group.userData.label = label;
  scene.add(group);
  questMarkers.push(group);
  return group;
}
const pickupMarker = makeQuestMarker(deliveryPickupPos, 0x38f4ff, 'SUPPLY CACHE');
const dropMarker = makeQuestMarker(deliveryDropPos, 0x7fffd4, 'SAFEHOUSE');
const bountyMarker = makeQuestMarker(bountyPos, 0xff5252, 'RAZOR');
dropMarker.visible = false;
bountyMarker.visible = false;

// A small, clearly visible cargo case makes pickup feel like an action in the world.
const cargoCase = new THREE.Mesh(new THREE.BoxGeometry(1.0, .65, .7), new THREE.MeshStandardMaterial({ color:0x27354a, emissive:0x38f4ff, emissiveIntensity:.55 }));
cargoCase.position.copy(deliveryPickupPos).add(new THREE.Vector3(0,.38,0));
scene.add(cargoCase);

function createCrashPlane() {
  const g = new THREE.Group();
  // A compact airliner silhouette: white fuselage, swept wings, tailplane,
  // engines and a dark cockpit.  Its long axis is the local Z axis.
  const white = new THREE.MeshStandardMaterial({ color:0xf4f7ff, metalness:.48, roughness:.3 });
  const wingMat = new THREE.MeshStandardMaterial({ color:0xe1e7f2, metalness:.55, roughness:.28 });
  const cockpit = new THREE.MeshStandardMaterial({ color:0x15263d, metalness:.7, roughness:.15, emissive:0x07101f, emissiveIntensity:.45 });
  const engineMat = new THREE.MeshStandardMaterial({ color:0xb8c1cf, metalness:.8, roughness:.24 });
  const glow = new THREE.MeshBasicMaterial({ color:0xff5252 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.58,.82,7.8,16), white);
  body.rotation.x = Math.PI / 2; body.castShadow = true; g.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.6,16,12), white);
  nose.scale.set(1, .92, 1.35); nose.position.z = 4.0; nose.castShadow = true; g.add(nose);
  const windows = new THREE.Mesh(new THREE.SphereGeometry(.46,12,8), cockpit);
  windows.scale.set(1, .68, .8); windows.position.set(0, .18, 4.38); g.add(windows);
  const wings = new THREE.Mesh(new THREE.BoxGeometry(8.8,.16,2.1), wingMat); wings.position.set(0,-.05,.25); wings.castShadow = true; g.add(wings);
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(3.2,.1,.9), wingMat); tailplane.position.set(0,.5,-3.25); g.add(tailplane);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(.14,1.45,1.25), white); fin.position.set(0,1.0,-3.25); fin.rotation.z = -.12; g.add(fin);
  for (const x of [-2.55, 2.55]) {
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(.34,.42,1.45,12), engineMat);
    nacelle.rotation.x = Math.PI / 2; nacelle.position.set(x,-.42,.15); nacelle.castShadow = true; g.add(nacelle);
  }
  const engine = new THREE.PointLight(0xff5b2f, 3, 20); engine.position.set(-2.55,-.25,.15); g.add(engine);
  const fire = new THREE.Mesh(new THREE.SphereGeometry(.35,8,8), glow); fire.position.set(-2.55,-.25,.15); g.add(fire);
  g.userData.collisionRadius = 4.45;
  g.visible = false; scene.add(g); return g;
}
crashPlane = createCrashPlane();
function createCrashFire() {
  const g = new THREE.Group();
  const flame = new THREE.Mesh(new THREE.ConeGeometry(1.35, 4.2, 8), new THREE.MeshBasicMaterial({ color:0xff542f, transparent:true, opacity:.9 }));
  flame.position.y = 2.1; g.add(flame);
  const glow = new THREE.PointLight(0xff3b1f, 4, 26); glow.position.y = 2.5; g.add(glow);
  g.position.set(-2, 0, -2); g.visible = false; scene.add(g); return g;
}
crashFire = createCrashFire();

function activeQuestTarget() {
  if (questStage === 0) return deliveryPickupPos;
  if (questStage === 1) return deliveryDropPos;
  if (questStage === 2) return bountyPos;
  if (questStage === 3) return warehouseDoorPos;
  return null;
}

function updateQuestUI() {
  const title = document.getElementById('questTitle');
  const objective = document.getElementById('questObjective');
  if (!title || !objective) return;
  const data = [
    ['FIRST RUN: RECOVER THE CASE', 'Reach the cyan supply cache and collect the emergency package.'],
    ['FIRST RUN: DELIVERY', 'Carry the package to the green safehouse.'],
    ['CLEANUP: ELIMINATE RAZOR', 'Find the marked gang enforcer and left-click to fire.'],
    ['FINAL SIGNAL: THE WAREHOUSE', 'The contracts exposed the source. Reach the warehouse entrance.'],
    ['CITY BREATHES', 'All contracts complete.']
  ][questStage];
  title.textContent = data[0]; objective.textContent = data[1];
}

function beginBounty() {
  if (!bountyTarget) {
    bountyTarget = createPedestrian(bountyPos.x, bountyPos.z);
    bountyTarget.userData.isCriminal = true;
    bountyTarget.userData.isQuestTarget = true;
    bountyTarget.userData.health = 4;
    bountyTarget.userData.home.copy(bountyPos);
    bountyTarget.userData.roam = 3;
    const redLight = new THREE.PointLight(0xff3030, 1.7, 9); redLight.position.y = 2; bountyTarget.add(redLight);
  }
  bountyMarker.visible = true;
}

function advanceQuest() {
  questStage++;
  if (questStage === 1) { pickupMarker.visible = false; cargoCase.visible = false; dropMarker.visible = true; showHudMessage('PACKAGE SECURED — DELIVER IT'); }
  else if (questStage === 2) { dropMarker.visible = false; beginBounty(); showHudMessage('NEW CONTRACT: ELIMINATE RAZOR'); }
  else if (questStage === 3) { bountyMarker.visible = false; showHudMessage('RAZOR ELIMINATED — WAREHOUSE LOCATION UNLOCKED'); }
  updateQuestUI();
}

// ---------------------------------------------------------------------------
// INPUT
// ---------------------------------------------------------------------------
const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; });
window.addEventListener('keyup', e => { keys[e.code] = false; });

let rightMouseDown = false;
let lastMouseX = 0, lastMouseY = 0;
let camYaw = Math.PI * 0.15;   // horizontal orbit angle
let camPitch = 0.42;           // vertical orbit angle
let camDistance = 9;

renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
renderer.domElement.addEventListener('mousedown', e => {
  if (e.button === 2) { rightMouseDown = true; lastMouseX = e.clientX; lastMouseY = e.clientY; }
  if (e.button === 0) firePlayerWeapon(e);
});
window.addEventListener('mouseup', e => { if (e.button === 2) rightMouseDown = false; });
window.addEventListener('mousemove', e => {
  if (rightMouseDown) {
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    lastMouseX = e.clientX; lastMouseY = e.clientY;
    camYaw -= dx * 0.0045;
    camPitch += dy * 0.003;
    camPitch = Math.max(0.12, Math.min(1.3, camPitch));
  }
});
renderer.domElement.addEventListener('wheel', e => {
  camDistance += e.deltaY * 0.01;
  camDistance = Math.max(3.5, Math.min(24, camDistance));
}, { passive:true });

function toggleVehicle() {
  if (controlLocked || !playerAlive) return;
  if (currentVehicle) {
    const exitOffset = new THREE.Vector3(1.6, 0, 0).applyAxisAngle(new THREE.Vector3(0,1,0), currentVehicle.mesh.rotation.y);
    player.position.copy(currentVehicle.mesh.position).add(exitOffset);
    player.visible = true;
    currentVehicle.occupied = false;
    currentVehicle.speed = 0;
    currentVehicle = null;
    showHudMessage('EXITED VEHICLE');
    return;
  }
  let closest = null, closestDistance = 3.2;
  for (const vehicle of vehicles) {
    const distance = vehicle.mesh.position.distanceTo(player.position);
    if (!vehicle.occupied && distance < closestDistance) { closest = vehicle; closestDistance = distance; }
  }
  if (closest) {
    currentVehicle = closest;
    currentVehicle.occupied = true;
    currentVehicle.speed = 0;
    player.visible = false;
    showHudMessage('VEHICLE ACQUIRED — WASD TO DRIVE, E TO EXIT');
  } else showHudMessage('NO VEHICLE IN RANGE');
}

window.addEventListener('keydown', e => {
  if (e.code === 'KeyE' && !e.repeat) toggleVehicle();
});

// ---------------------------------------------------------------------------
// COLLISION HELPER
// ---------------------------------------------------------------------------
function collidesBuilding(x, z, r) {
  for (const b of buildingBoxes) {
    if (x+r > b.minX && x-r < b.maxX && z+r > b.minZ && z-r < b.maxZ) return true;
  }
  return false;
}

function collidesCharacter(x, z, r, ignored) {
  for (const p of pedestrians) {
    if (p === ignored || !p.visible) continue;
    const otherRadius = p.userData.collisionRadius || PEDESTRIAN_COLLISION_RADIUS;
    if (Math.hypot(x - p.position.x, z - p.position.z) < r + otherRadius) return true;
  }
  if (player !== ignored && Math.hypot(x - player.position.x, z - player.position.z) < r + PLAYER_COLLISION_RADIUS) return true;
  return false;
}

function collidesPlane(x, z, r) {
  return crashPlane && crashPlane.visible && Math.hypot(x - crashPlane.position.x, z - crashPlane.position.z) < r + crashPlane.userData.collisionRadius;
}

function collides(x, z, r, ignored) {
  return collidesBuilding(x, z, r) || collidesCharacter(x, z, r, ignored) || collidesPlane(x, z, r);
}

// ---------------------------------------------------------------------------
// UI ELEMENTS
// ---------------------------------------------------------------------------
const districtNameEl = document.getElementById('districtName');
const hudMessageEl = document.getElementById('hudMessage');
let lastDistrict = '';
let messageTimeout = null;

function showHudMessage(text) {
  if (!hudMessageEl) return;
  hudMessageEl.textContent = text;
  hudMessageEl.classList.add('visible');
  clearTimeout(messageTimeout);
  messageTimeout = setTimeout(() => {
    hudMessageEl.classList.remove('visible');
  }, 2800);
}

// ---------------------------------------------------------------------------
// MAIN LOOP
// ---------------------------------------------------------------------------
const moveSpeed = 7.2;
const playerVelocity = new THREE.Vector3();
// Player stats
const sprintMultiplier = 1.9;
const playerMaxHealth = 100;
let playerHealth = playerMaxHealth;
const damagePerShot = 12;
const healthFillEl = document.getElementById('healthFill');
let mapVisible = false;
let endgameTriggered = false;

// Map canvas
const mapEl = document.getElementById('map');
const mapCanvas = document.getElementById('mapCanvas');
const mapCtx = mapCanvas ? mapCanvas.getContext('2d') : null;
// waypoint elements
const waypointEl = document.getElementById('waypoint');
const waypointArrowEl = document.getElementById('waypointArrow');
const waypointLabelEl = document.getElementById('waypointLabel');

// Soundtrack: this plays the supplied YouTube playlist through YouTube's
// embedded player. Playback begins only after an intentional game interaction
// so browsers do not block the audio autoplay.
const soundtrackToggleEl = document.getElementById('soundtrackToggle');
let soundtrackPlayer = null;
let soundtrackReady = false;
let soundtrackPlaying = false;
let soundtrackRequested = false;

function updateSoundtrackControl() {
  if (!soundtrackToggleEl) return;
  soundtrackToggleEl.textContent = soundtrackPlaying ? 'Ⅱ PAUSE SOUNDTRACK' : '▶ SOUNDTRACK';
  soundtrackToggleEl.setAttribute('aria-pressed', String(soundtrackPlaying));
}

function startSoundtrack() {
  soundtrackRequested = true;
  if (soundtrackReady && soundtrackPlayer) soundtrackPlayer.playVideo();
}

function toggleSoundtrack() {
  if (!soundtrackReady || !soundtrackPlayer) {
    soundtrackRequested = true;
    showHudMessage('SOUNDTRACK IS LOADING');
    return;
  }
  const state = soundtrackPlayer.getPlayerState ? soundtrackPlayer.getPlayerState() : -1;
  if (soundtrackPlaying || (window.YT && state === YT.PlayerState.PLAYING)) {
    soundtrackRequested = false;
    soundtrackPlayer.pauseVideo();
  } else {
    soundtrackRequested = true;
    soundtrackPlayer.playVideo();
  }
}

window.onYouTubeIframeAPIReady = function() {
  soundtrackPlayer = new YT.Player('soundtrackPlayer', {
    height: '200', width: '200',
    playerVars: {
      listType: 'playlist', list: 'PLDfKAXSi6kUbVydDFf2eIe5Xh0CPOBpAY',
      controls: 0, rel: 0, playsinline: 1
    },
    events: {
      onReady: function() {
        soundtrackReady = true;
        if (soundtrackRequested) soundtrackPlayer.playVideo();
      },
      onStateChange: function(event) {
        soundtrackPlaying = event.data === YT.PlayerState.PLAYING;
        updateSoundtrackControl();
      }
    }
  });
};

if (soundtrackToggleEl) soundtrackToggleEl.addEventListener('click', toggleSoundtrack);
updateSoundtrackControl();

function updateDriving(dt) {
  const car = currentVehicle;
  const throttle = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0);
  const steer = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);
  car.speed += throttle * 18 * dt;
  car.speed *= Math.pow(.13, dt);
  car.speed = Math.max(-8, Math.min(18, car.speed));
  if (Math.abs(car.speed) > .15) car.mesh.rotation.y -= steer * Math.sign(car.speed) * 1.8 * dt;
  const forward = new THREE.Vector3(Math.sin(car.mesh.rotation.y), 0, Math.cos(car.mesh.rotation.y));
  const next = car.mesh.position.clone().addScaledVector(forward, car.speed * dt);
  if (!collidesBuilding(next.x, next.z, 1.75)) car.mesh.position.copy(next);
  else car.speed *= -.18;
  car.mesh.position.x = Math.max(-CITY_HALF+4, Math.min(CITY_HALF-4, car.mesh.position.x));
  car.mesh.position.z = Math.max(-CITY_HALF+4, Math.min(CITY_HALF-4, car.mesh.position.z));
  player.position.copy(car.mesh.position);
  player.rotation.y = car.mesh.rotation.y;
  playerMoving = false;
  updatePlayerAnimation(dt, false, false);
  if (questStage === 0 && player.position.distanceTo(deliveryPickupPos) < 3) advanceQuest();
  if (questStage === 1 && player.position.distanceTo(deliveryDropPos) < 3) advanceQuest();
}

function updatePlayer(dt) {
  if (controlLocked) {
    playerMoving = false;
    updatePlayerAnimation(dt, false, false);
    return;
  }
  if (!playerAlive) {
    // Freeze locomotion so the Falling Back Death clip can play out in place.
    playerMoving = false;
    updatePlayerAnimation(dt, false, false);
    return;
  }
  if (currentVehicle) {
    updateDriving(dt);
    return;
  }
  let forward = 0, strafe = 0;
  if (keys['KeyW'] || keys['ArrowUp']) forward += 1;
  if (keys['KeyS'] || keys['ArrowDown']) forward -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) strafe += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) strafe -= 1;

  const dir = new THREE.Vector3(strafe, 0, -forward);
  playerMoving = dir.lengthSq() > 0;
  let speed = moveSpeed;
  const sprinting = (keys['ShiftLeft'] || keys['ShiftRight']);
  if (sprinting && dir.lengthSq() > 0 && !endgameTriggered) {
    speed = moveSpeed * sprintMultiplier;
  }

  if (dir.lengthSq() > 0) {
    dir.normalize();
    // movement relative to camera yaw so controls feel natural while orbiting
    const camForward = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    const camRight = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
    const moveDir = new THREE.Vector3();
    moveDir.addScaledVector(camRight, dir.x);
    moveDir.addScaledVector(camForward, dir.z);
    moveDir.normalize();

    const newX = player.position.x + moveDir.x * speed * dt;
    const newZ = player.position.z + moveDir.z * speed * dt;

    if (!collides(newX, player.position.z, PLAYER_COLLISION_RADIUS, player)) player.position.x = newX;
    if (!collides(player.position.x, newZ, PLAYER_COLLISION_RADIUS, player)) player.position.z = newZ;

    const targetAngle = Math.atan2(moveDir.x, moveDir.z);
    let angleDiff = targetAngle - player.rotation.y;
    while (angleDiff > Math.PI) angleDiff -= Math.PI*2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI*2;
    player.rotation.y += angleDiff * Math.min(1, dt*10);
  }

  // clamp to city bounds
  player.position.x = Math.max(-CITY_HALF+4, Math.min(CITY_HALF-4, player.position.x));
  player.position.z = Math.max(-CITY_HALF+4, Math.min(CITY_HALF-4, player.position.z));

  const d = districtAt(player.position.x, player.position.z);
  if (d !== lastDistrict) {
    lastDistrict = d;
    districtNameEl.textContent = d;
    showHudMessage(`ENTERING ${d}`);
  }

  updatePlayerAnimation(dt, playerMoving, sprinting);

  if (questStage === 0 && player.position.distanceTo(deliveryPickupPos) < 3) advanceQuest();
  if (questStage === 1 && player.position.distanceTo(deliveryDropPos) < 3) advanceQuest();

  // update health UI
  if (healthFillEl) {
    const pct = Math.max(0, Math.min(1, playerHealth / playerMaxHealth));
    healthFillEl.style.transform = `scaleX(${pct})`;
  }

  // check for endgame warehouse reach
  if (!endgameTriggered && questStage === 3 && player.position.distanceTo(warehouseDoorPos) < 5.5) {
    endgameTriggered = true;
    showHudMessage('WAREHOUSE REACHED — SYSTEM OVERRIDE');
    // reveal end screen overlay
    setTimeout(() => {
      const ov = document.createElement('div');
      ov.style.position = 'fixed';
      ov.style.inset = '0';
      ov.style.display = 'flex';
      ov.style.alignItems = 'center';
      ov.style.justifyContent = 'center';
      ov.style.background = 'rgba(2, 4, 18, 0.96)';
      ov.style.color = '#ffd23f';
      ov.style.fontFamily = 'Courier New, monospace';
      ov.style.fontSize = '24px';
      ov.style.textAlign = 'center';
      ov.style.padding = '32px';
      ov.style.lineHeight = '1.6';
      ov.style.zIndex = '9999';
      ov.style.pointerEvents = 'auto';
      ov.innerHTML = '<div style="max-width:680px;"><div style="font-size:32px; font-weight:700; margin-bottom:24px; letter-spacing:0.18em; color:#ff7ae8;">GAME COMPLETE — WAREHOUSE SECURED</div><div style="font-size:22px; color:#c9d6ff;">Thank You For Playing My Game<br><span style="display:block; margin-top:18px; font-size:20px; color:#ffd23f;">- Alexavier</span></div><button id="playAgainBtn" style="margin-top:30px; padding:14px 28px; border:none; border-radius:999px; font-size:16px; cursor:pointer; background:#ff2fd0; color:#05010a; font-weight:700; transition:transform .15s ease;">PLAY AGAIN</button></div>';
      document.body.appendChild(ov);
      const btn = document.getElementById('playAgainBtn');
      if (btn) {
        btn.addEventListener('click', () => window.location.reload());
      }
    }, 800);
  }
}

// Draw simple map
function drawMap() {
  if (!mapCtx) return;
  const size = mapCanvas.width;
  mapCtx.clearRect(0,0,size,size);
  // background
  mapCtx.fillStyle = '#07030a'; mapCtx.fillRect(0,0,size,size);
  // scale world to map
  const worldSize = CITY_HALF*2;
  const scale = size / worldSize;
  function worldToMap(v) {
    return {
      x: (v.x + CITY_HALF) * scale,
      y: (v.z + CITY_HALF) * scale
    };
  }
  const target = activeQuestTarget() || warehousePos;
  const wp = worldToMap(target);
  mapCtx.fillStyle = questStage === 2 ? '#ff5252' : '#ffd23f';
  mapCtx.beginPath(); mapCtx.arc(wp.x, wp.y, 6, 0, Math.PI*2); mapCtx.fill();
  mapCtx.fillStyle = '#ffd23f'; mapCtx.fillText(questStage === 3 ? 'WAREHOUSE' : 'CONTRACT', wp.x+8, wp.y+4);
  // draw player
  const pp = worldToMap(player.position);
  mapCtx.fillStyle = '#38f4ff';
  mapCtx.beginPath(); mapCtx.arc(pp.x, pp.y, 5, 0, Math.PI*2); mapCtx.fill();
  // draw route from player to the active contract objective
  mapCtx.strokeStyle = 'rgba(56,244,255,0.9)';
  mapCtx.lineWidth = 2;
  mapCtx.beginPath(); mapCtx.moveTo(pp.x, pp.y); mapCtx.lineTo(wp.x, wp.y); mapCtx.stroke();
  // draw arrowhead
  const ang = Math.atan2(wp.y - pp.y, wp.x - pp.x);
  mapCtx.fillStyle = '#38f4ff';
  mapCtx.beginPath();
  mapCtx.moveTo(wp.x, wp.y);
  mapCtx.lineTo(wp.x - 10*Math.cos(ang - 0.4), wp.y - 10*Math.sin(ang - 0.4));
  mapCtx.lineTo(wp.x - 10*Math.cos(ang + 0.4), wp.y - 10*Math.sin(ang + 0.4));
  mapCtx.closePath(); mapCtx.fill();

  // draw viewport indicator
  mapCtx.strokeStyle = 'rgba(255,255,255,0.08)';
  mapCtx.lineWidth = 1; mapCtx.strokeRect(0,0,size,size);

  // distance text
  const dist = Math.round(player.position.distanceTo(target));
  mapCtx.fillStyle = '#c9d6ff'; mapCtx.font = '12px Courier New';
  mapCtx.fillText(`DIST: ${dist}m`, 8, 14);
}

function updateWaypoint() {
  if (!waypointEl || !waypointArrowEl) return;
  if (mapVisible || endgameTriggered) { waypointEl.style.display = 'none'; return; }
  // compute horizontal yaw difference between camera forward and target
  const camF = new THREE.Vector3(); camera.getWorldDirection(camF);
  const camFflat = camF.clone(); camFflat.y = 0; if (camFflat.lengthSq() < 1e-6) camFflat.set(0,0,1);
  camFflat.normalize();
  const target = activeQuestTarget();
  if (!target) { waypointEl.style.display = 'none'; return; }
  const toTarget = target.clone().sub(camera.position); toTarget.y = 0; toTarget.normalize();
  // Screen rotation (CSS clockwise, 0 = up) toward the target: φ = atan2(T·R, T·F)
  // with the camera's right R = (-Fz, 0, Fx). The bearing difference below equals
  // -φ in this convention, so negate it — otherwise the arrow points the wrong
  // way left/right.
  const angle = -(Math.atan2(toTarget.x, toTarget.z) - Math.atan2(camFflat.x, camFflat.z));
  waypointArrowEl.style.transform = `rotate(${angle}rad)`;
  // show distance
  const dist = Math.round(player.position.distanceTo(target));
  const labels = ['SUPPLY CACHE', 'SAFEHOUSE', 'RAZOR', 'WAREHOUSE'];
  if (waypointLabelEl) waypointLabelEl.textContent = `${labels[questStage]} — ${dist}m`;
  waypointEl.style.display = 'flex';
}

function updateCamera() {
  if (cutsceneActive) {
    // The camera tracks the falling aircraft instead of the player during the prologue.
    const planeLook = crashPlane.position.clone().add(new THREE.Vector3(-4, -1, 0));
    camera.position.lerp(crashPlane.position.clone().add(new THREE.Vector3(15, 7, 19)), .08);
    camera.lookAt(planeLook);
    return;
  }
  playerFill.position.set(player.position.x, 6, player.position.z);
  const targetPos = new THREE.Vector3(
    player.position.x + Math.sin(camYaw) * Math.cos(camPitch) * camDistance,
    player.position.y + 2.4 + Math.sin(camPitch) * camDistance,
    player.position.z + Math.cos(camYaw) * Math.cos(camPitch) * camDistance
  );
  camera.position.lerp(targetPos, 1);
  const lookTarget = new THREE.Vector3(player.position.x, player.position.y + 1.5, player.position.z);
  camera.lookAt(lookTarget);
}

function updatePedestrians(dt) {
  const px = player.position.x, pz = player.position.z;
  for (const p of pedestrians) {
    const ud = p.userData;

    // Level-of-simulation culling: distance to the player decides how much work
    // this NPC costs this frame.
    const dx = p.position.x - px, dz = p.position.z - pz;
    const d2 = dx*dx + dz*dz;
    if (d2 > PED_VISIBLE_R2) { if (p.visible) p.visible = false; continue; }
    if (!p.visible) p.visible = true;

    if (ud.dead) {
      // Topple backward and settle flat on the ground — a downed body lying on
      // its back, mirroring the sleeping/dead pose (the mixamo clip can't bind
      // to these renderpeople / Character-Creator rigs, so this is procedural).
      p.rotation.x += (-Math.PI/2 - p.rotation.x) * Math.min(1, dt * 6);
      p.rotation.z += (0 - p.rotation.z) * Math.min(1, dt * 6);
      p.position.y += (0.12 - p.position.y) * Math.min(1, dt * 6); // lift so the back doesn't clip
      continue;
    }

    // Rendered but too far to matter: hold the current pose, skip AI + animation.
    if (d2 > PED_ACTIVE_R2) continue;

    // Wander: hold a heading and keep walking forward, only turning occasionally
    // or when blocked — so NPCs actually travel through the sector instead of
    // cycling in place. A soft leash steers them back if they stray too far.
    if (ud.targetAngle === undefined) ud.targetAngle = ud.angle;
    ud.changeTimer -= dt;
    if (ud.changeTimer <= 0) {
      // mostly gentle course corrections, occasionally a real turn
      const turn = Math.random() < 0.75 ? rand(-0.5, 0.5) : rand(-Math.PI*0.9, Math.PI*0.9);
      ud.targetAngle = ud.angle + turn;
      ud.changeTimer = rand(2.5, 6);
    }
    const homeDx = ud.home.x - p.position.x, homeDz = ud.home.z - p.position.z;
    if (Math.hypot(homeDx, homeDz) > ud.roam) {
      ud.targetAngle = Math.atan2(homeDx, homeDz); // steer home before straying off
    }

    // Ease the heading toward the target so turns look like walking, not snapping.
    let da = ud.targetAngle - ud.angle;
    while (da > Math.PI) da -= Math.PI*2;
    while (da < -Math.PI) da += Math.PI*2;
    ud.angle += da * Math.min(1, dt * 2.5);

    const nx = p.position.x + Math.sin(ud.angle)*ud.speed*dt;
    const nz = p.position.z + Math.cos(ud.angle)*ud.speed*dt;

    let moved = false;
    if (!collides(nx, nz, ud.collisionRadius || PEDESTRIAN_COLLISION_RADIUS, p) &&
        Math.abs(nx) < CITY_HALF - 4 && Math.abs(nz) < CITY_HALF - 4) {
      p.position.x = nx; p.position.z = nz;
      moved = true;
    } else {
      // Blocked by a building or the city edge: turn away and keep going.
      ud.targetAngle = ud.angle + rand(Math.PI*0.6, Math.PI*1.4);
      ud.changeTimer = rand(1.5, 3);
    }

    // Smoothly face the direction of travel.
    let dr = ud.angle - p.rotation.y;
    while (dr > Math.PI) dr -= Math.PI*2;
    while (dr < -Math.PI) dr += Math.PI*2;
    p.rotation.y += dr * Math.min(1, dt * 6);

    if (ud.isCriminal && playerAlive && !endgameTriggered) {
      ud.shootTimer -= dt;
      const toPlayer = player.position.clone().sub(p.position);
      const distToPlayer = toPlayer.length();
      if (ud.shootTimer <= 0) {
        ud.shootTimer = rand(2.8, 4.8);
        if (distToPlayer < 26) {
          shootAtPlayer(p);
          if (Math.random() < 0.6) {
            showHudMessage('CRIMINAL GUNFIRE');
          }
        }
      }
    }

    const groundY = ud.groundY || 0; // keep feet on the floor while bobbing
    if (ud.mixer) {
      // Nathan's FBX includes a walk clip; if the CyberWoman asset has no
      // clip, the gentle stride/bob still gives it a basic walk motion.
      ud.mixer.update(moved ? dt : 0);
      p.userData.modelWalkPhase += dt * ud.speed * 7;
      p.children[0].position.y = groundY + Math.abs(Math.sin(p.userData.modelWalkPhase)) * (moved ? 0.035 : 0);
    } else if (ud.modelled) {
      p.userData.modelWalkPhase += dt * ud.speed * 7;
      p.children[0].position.y = groundY + Math.abs(Math.sin(p.userData.modelWalkPhase)) * (moved ? 0.035 : 0);
    } else {
      animateRig(ud.rig, dt, moved, ud.speed*6);
    }
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  updatePlayer(dt);
  updateCamera();
  updatePedestrians(dt);
  updateVehicles(dt);
  updateBullets(dt);
  updatePlayerShots(dt);
  updateGunshots(dt);
  updateCrashCutscene(dt);
  updateStreetProps(clock.elapsedTime);
  updateWaypoint();
  if (mapVisible) drawMap();
  renderer.render(scene, camera);
}

function updateVehicles(dt) {
  for (const v of vehicles) {
    if (v.occupied) continue;
    const mv = v.mesh;
    if (v.direction === 'x') {
      mv.position.x += v.speed * dt;
      if (mv.position.x > CITY_HALF + 24) mv.position.x = -CITY_HALF - 24;
      if (mv.position.x < -CITY_HALF - 24) mv.position.x = CITY_HALF + 24;
    } else {
      mv.position.z += v.speed * dt;
      if (mv.position.z > CITY_HALF + 24) mv.position.z = -CITY_HALF - 24;
      if (mv.position.z < -CITY_HALF - 24) mv.position.z = CITY_HALF + 24;
    }
  }
}

function updateCrashCutscene(dt) {
  if (!cutsceneActive) return;
  cutsceneElapsed += dt;
  // A descending, corkscrewing aircraft crosses the city and impacts the spawn plaza.
  const t = Math.min(cutsceneElapsed / 6.2, 1);
  crashPlane.position.set(42 - 46*t, 60*(1-t)*(1-t) + 2, -50 + 48*t);
  crashPlane.rotation.set(.18 + t*1.2, t*1.8, -.22 - t*1.5);
  // The player ejects during the final approach, visibly falling beside the plane.
  if (cutsceneElapsed > 2.0) {
    const fall = Math.min((cutsceneElapsed - 2.0) / 3.5, 1);
    player.position.copy(crashPlane.position).add(new THREE.Vector3(2.2, -2.5 - 7*fall, 1.5));
    player.rotation.z = fall * .9;
  }
  if (cutsceneElapsed > 3.7) {
    const text = document.getElementById('cutsceneText');
    if (text) text.textContent = 'IMPACT IMMINENT — EJECT NOW';
  }
  if (cutsceneElapsed < 5.5) return;
  // Leave the wreck in the plaza so it remains a physical world object after
  // the opening sequence, instead of disappearing once the camera cuts away.
  crashPlane.position.set(-8, 0.7, -8);
  crashPlane.rotation.set(.12, .55, -.38);
  crashPlane.visible = true;
  crashFire.position.set(-8, 0, -8);
  crashFire.visible = true;
  player.position.set(0, 0, 0);
  player.rotation.set(0, 0, 0);
  cutsceneActive = false;
  controlLocked = false;
  const cutsceneEl = document.getElementById('cutscene');
  if (cutsceneEl) cutsceneEl.style.display = 'none';
  showHudMessage('CRASH SURVIVED — FIND THE SUPPLY CACHE');
  updateQuestUI();
}

// ---------------------------------------------------------------------------
// BOOT SEQUENCE
// ---------------------------------------------------------------------------
function showIntroScreen() {
  const loadingEl = document.getElementById('loading');
  const introEl = document.getElementById('intro');
  if (loadingEl) loadingEl.style.display = 'none';
  if (introEl) introEl.style.display = 'flex';
}

function showErrorOverlay(message) {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(5,5,10,0.95)';
  overlay.style.color = '#ff6bcb';
  overlay.style.fontFamily = 'Courier New, monospace';
  overlay.style.fontSize = '16px';
  overlay.style.padding = '24px';
  overlay.style.zIndex = '9999';
  overlay.style.whiteSpace = 'pre-wrap';
  overlay.textContent = 'ERROR: ' + message;
  document.body.appendChild(overlay);
}

window.onerror = function(message, source, lineno, colno, error) {
  showErrorOverlay(`${message}\n${source}:${lineno}:${colno}`);
};

window.addEventListener('unhandledrejection', event => {
  showErrorOverlay(`Unhandled promise rejection:\n${event.reason}`);
});

showIntroScreen();

window.addEventListener('DOMContentLoaded', showIntroScreen);
window.addEventListener('load', showIntroScreen);

setTimeout(() => {
  const loadingEl = document.getElementById('loading');
  const introEl = document.getElementById('intro');
  if (loadingEl && introEl && loadingEl.style.display !== 'none') {
    showIntroScreen();
  }
}, 1200);

// toggle map with M
window.addEventListener('keydown', e => {
  if (e.code === 'KeyM' && !e.repeat) {
    mapVisible = !mapVisible;
    if (mapEl) mapEl.style.display = mapVisible ? 'block' : 'none';
    if (mapVisible) drawMap();
  }
});

const introEl = document.getElementById('intro');
const playBtnEl = introEl ? introEl.querySelector('.go') : null;

function startGameFromMenu() {
  if (startGameFromMenu._started) return;
  startGameFromMenu._started = true;
  if (introEl) introEl.style.display = 'none';

  const hudEl = document.getElementById('hud');
  if (hudEl) hudEl.style.display = 'block';

  const cutsceneEl = document.getElementById('cutscene');
  if (cutsceneEl) cutsceneEl.style.display = 'block';

  const cutsceneText = document.getElementById('cutsceneText');
  if (cutsceneText) cutsceneText.textContent = 'AUTOPILOT FAILURE — ALTITUDE COLLAPSING';

  crashPlane.visible = true;
  cutsceneActive = true;
  cutsceneElapsed = 0;
  startSoundtrack();
  updateQuestUI();
  renderer.domElement.focus();
  animate();
}

if (playBtnEl) {
  playBtnEl.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    startGameFromMenu();
  });
}


})();
