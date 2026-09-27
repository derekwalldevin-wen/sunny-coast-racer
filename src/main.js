import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import './style.css';

const TAU = Math.PI * 2;
const FIXED_DT = 1 / 120;
const MAX_FRAME_DT = 0.25;
const ROAD_HALF_WIDTH = 9.2;
const TOTAL_LAPS = 3;
const CHECKPOINT_FRACTIONS = [0.16, 0.34, 0.52, 0.7, 0.87];
const RACER_COLORS = [0xff7048, 0x51d9e5, 0xffd166, 0xb887ff, 0x79e08f, 0xff8fb7];
const RACER_NAMES = ['你 / TIDE RUNNER', '蓝鸥 / BLUE HERON', '金鲨 / GOLD FIN', '紫帆 / VIOLET SAIL', '青柠 / LIME COMET', '珊瑚 / CORAL FOX'];
const AI_LANES = [-3.2, 3.2, -1.55, 1.55, -4.25, 4.25];
const CAMERA_LABELS = ['追尾镜头', '车头镜头', '电影镜头'];

const $ = (selector) => document.querySelector(selector);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, amount) => a + (b - a) * amount;
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const wrap01 = (value) => ((value % 1) + 1) % 1;
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const vec3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const colorToCss = (color) => `#${color.toString(16).padStart(6, '0')}`;

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--.---';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function makeCanvasTexture(width, height, painter, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  painter(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  return texture;
}

function createRoadTexture() {
  return makeCanvasTexture(512, 512, (ctx, width, height) => {
    ctx.fillStyle = '#30465a';
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 7200; i += 1) {
      const alpha = 0.018 + Math.random() * 0.07;
      ctx.fillStyle = `rgba(210, 232, 237, ${alpha})`;
      const size = Math.random() * 1.8 + 0.25;
      ctx.fillRect(Math.random() * width, Math.random() * height, size, size);
    }
    ctx.strokeStyle = 'rgba(9, 24, 39, .22)';
    ctx.lineWidth = 2;
    for (let i = -height; i < width; i += 58) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + height, height);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(234, 245, 239, .08)';
    ctx.lineWidth = 1;
    for (let i = -height; i < width; i += 58) {
      ctx.beginPath();
      ctx.moveTo(i + 2, 0);
      ctx.lineTo(i + height + 2, height);
      ctx.stroke();
    }
    for (let i = 0; i < 26; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      ctx.strokeStyle = `rgba(8, 20, 32, ${0.08 + Math.random() * 0.08})`;
      ctx.lineWidth = 0.6 + Math.random() * 1.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - .5) * 36, y + (Math.random() - .5) * 22);
      ctx.stroke();
    }
    const sheen = ctx.createLinearGradient(0, 0, width, height);
    sheen.addColorStop(0, 'rgba(255,255,255,.08)');
    sheen.addColorStop(.42, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(0,0,0,.14)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, width, height);
  }, 1, 1);
}

function createCheckerTexture() {
  return makeCanvasTexture(128, 64, (ctx, width, height) => {
    const cell = 16;
    for (let y = 0; y < height / cell; y += 1) {
      for (let x = 0; x < width / cell; x += 1) {
        ctx.fillStyle = (x + y) % 2 ? '#f7fcff' : '#10253e';
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  }, 5, 1);
}

function createSunTexture() {
  return makeCanvasTexture(128, 128, (ctx, width, height) => {
    const gradient = ctx.createRadialGradient(width / 2, height / 2, 5, width / 2, height / 2, width / 2);
    gradient.addColorStop(0, 'rgba(255,248,190,1)');
    gradient.addColorStop(.24, 'rgba(255,216,111,.8)');
    gradient.addColorStop(.58, 'rgba(255,175,78,.18)');
    gradient.addColorStop(1, 'rgba(255,175,78,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  });
}

function createParticleTexture() {
  const texture = makeCanvasTexture(64, 64, (ctx, width, height) => {
    const gradient = ctx.createRadialGradient(width / 2, height / 2, 1, width / 2, height / 2, width / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(.28, 'rgba(255,255,255,.9)');
    gradient.addColorStop(.7, 'rgba(255,255,255,.28)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createEnvironmentTexture() {
  const texture = makeCanvasTexture(512, 256, (ctx, width, height) => {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#176eaa');
    sky.addColorStop(.42, '#8bd7e1');
    sky.addColorStop(.56, '#f1d49c');
    sky.addColorStop(1, '#214e62');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    const sun = ctx.createRadialGradient(width * .22, height * .28, 2, width * .22, height * .28, 46);
    sun.addColorStop(0, 'rgba(255,250,210,1)');
    sun.addColorStop(.18, 'rgba(255,231,151,.75)');
    sun.addColorStop(1, 'rgba(255,214,116,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, width, height);
  });
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createCloudTexture() {
  const texture = makeCanvasTexture(256, 128, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);
    const puffs = [
      [.25, .62, .22], [.4, .48, .28], [.57, .55, .25], [.72, .63, .18], [.49, .7, .2]
    ];
    for (const [x, y, radius] of puffs) {
      const gradient = ctx.createRadialGradient(x * width, y * height, 2, x * width, y * height, radius * width);
      gradient.addColorStop(0, 'rgba(255,255,255,.9)');
      gradient.addColorStop(.58, 'rgba(255,255,255,.52)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
  });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createGlowTexture(color = 0xffffff) {
  const texture = makeCanvasTexture(128, 128, (ctx, width, height) => {
    const rgb = new THREE.Color(color);
    const channel = value => Math.round(value * 255);
    const center = `rgba(${channel(rgb.r)},${channel(rgb.g)},${channel(rgb.b)},1)`;
    ctx.clearRect(0, 0, width, height);
    const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
    gradient.addColorStop(0, center);
    gradient.addColorStop(.22, `rgba(${channel(rgb.r)},${channel(rgb.g)},${channel(rgb.b)},.62)`);
    gradient.addColorStop(.55, `rgba(${channel(rgb.r)},${channel(rgb.g)},${channel(rgb.b)},.16)`);
    gradient.addColorStop(1, `rgba(${channel(rgb.r)},${channel(rgb.g)},${channel(rgb.b)},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createBillboardTexture(text, color = '#8ff6ff', backdrop = '#06202e') {
  return makeCanvasTexture(1024, 128, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, width - 20, height - 20);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tracking = 14;
    let size = 74;
    for (; size > 20; size -= 2) {
      ctx.font = `900 ${size}px "Segoe UI", system-ui, sans-serif`;
      ctx.letterSpacing = `${tracking}px`;
      if (ctx.measureText(text).width <= width - 72) break;
    }
    ctx.fillText(text, width / 2, height / 2 + 4);
  });
}

function createIslandMesh(points, material, y, scale = 1) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], index) => {
    const px = x * scale;
    const py = -z * scale;
    if (index === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
  });
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

class CoastTrack {
  constructor() {
    this.count = 520;
    this.points = [
      vec3(-220, 0, -210), vec3(-70, 0, -235), vec3(95, 0, -225), vec3(210, 0, -175),
      vec3(260, 1, -90), vec3(245, 2, 0), vec3(170, 1, 38), vec3(95, 0, 10),
      vec3(20, 0, 35), vec3(-50, 0, 92), vec3(-155, 1, 120), vec3(-245, 0, 78),
      vec3(-260, 0, -8), vec3(-180, 2, -45), vec3(-80, 3, -35), vec3(25, 1, -82),
      vec3(110, 6, -108), vec3(190, 0, -150)
    ];
    this.curve = new THREE.CatmullRomCurve3(this.points, true, 'catmullrom', 0.42);
    this.samples = [];
    this.length = 0;
    for (let i = 0; i < this.count; i += 1) {
      const t = i / this.count;
      const point = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t).normalize();
      const right = vec3(tangent.z, 0, -tangent.x).normalize();
      const previous = this.curve.getPointAt(wrap01(t - 1 / this.count));
      this.length += point.distanceTo(previous);
      this.samples.push({ t, point, tangent, right });
    }
  }

  sampleAt(t, target = {}) {
    const normalized = wrap01(t);
    const scaled = normalized * this.count;
    const index = Math.floor(scaled) % this.count;
    const nextIndex = (index + 1) % this.count;
    const amount = scaled - Math.floor(scaled);
    const a = this.samples[index];
    const b = this.samples[nextIndex];
    target.point = target.point || vec3();
    target.tangent = target.tangent || vec3();
    target.right = target.right || vec3();
    target.point.copy(a.point).lerp(b.point, amount);
    target.tangent.copy(a.tangent).lerp(b.tangent, amount).normalize();
    target.right.copy(a.right).lerp(b.right, amount).normalize();
    target.t = normalized;
    return target;
  }

  nearest(position, target = {}) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < this.count; i += 1) {
      const sample = this.samples[i];
      const dx = position.x - sample.point.x;
      const dz = position.z - sample.point.z;
      const distance = dx * dx + dz * dz;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    const sample = this.samples[bestIndex];
    const previous = this.samples[(bestIndex - 1 + this.count) % this.count];
    const next = this.samples[(bestIndex + 1) % this.count];
    const segmentX = next.point.x - previous.point.x;
    const segmentZ = next.point.z - previous.point.z;
    const segmentLengthSq = segmentX * segmentX + segmentZ * segmentZ;
    const relativeX = position.x - previous.point.x;
    const relativeZ = position.z - previous.point.z;
    const amount = segmentLengthSq > 1e-6 ? clamp((relativeX * segmentX + relativeZ * segmentZ) / segmentLengthSq, 0, 1) : .5;
    const interpolatedT = wrap01((bestIndex - 1 + amount) / this.count);
    const interpolated = this.sampleAt(interpolatedT, target);
    interpolated.distance = Math.hypot(position.x - interpolated.point.x, position.z - interpolated.point.z);
    interpolated.index = bestIndex;
    interpolated.lateral = (position.x - interpolated.point.x) * interpolated.right.x + (position.z - interpolated.point.z) * interpolated.right.z;
    interpolated.y = interpolated.point.y;
    interpolated.t = interpolatedT;
    interpolated.amount = amount;
    return interpolated;
  }
}

class ParticlePool {
  constructor(max, color, size, opacity, additive = false) {
    this.max = max;
    this.items = Array.from({ length: max }, () => ({ active: false, life: 0, maxLife: 1, position: vec3(), velocity: vec3(), size: 1 }));
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.material = new THREE.PointsMaterial({
      size,
      color,
      map: createParticleTexture(),
      alphaTest: 0.025,
      vertexColors: true,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      sizeAttenuation: true
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    for (let i = 0; i < max; i += 1) {
      this.positions[i * 3 + 1] = -1000;
      this.colors[i * 3] = color.r;
      this.colors[i * 3 + 1] = color.g;
      this.colors[i * 3 + 2] = color.b;
    }
  }

  spawn(position, velocity, life, size = 1) {
    const item = this.items.find((candidate) => !candidate.active);
    if (!item) return;
    item.active = true;
    item.life = life;
    item.maxLife = life;
    item.position.copy(position);
    item.velocity.copy(velocity);
    item.size = size;
  }

  update(dt) {
    for (let i = 0; i < this.max; i += 1) {
      const item = this.items[i];
      const offset = i * 3;
      if (!item.active) {
        this.positions[offset] = 0;
        this.positions[offset + 1] = -1000;
        this.positions[offset + 2] = 0;
        continue;
      }
      item.life -= dt;
      if (item.life <= 0) {
        item.active = false;
        this.positions[offset + 1] = -1000;
        continue;
      }
      item.position.addScaledVector(item.velocity, dt);
      item.velocity.y += (this.material.blending === THREE.AdditiveBlending ? -1.4 : 0.8) * dt;
      item.velocity.multiplyScalar(0.985);
      this.positions[offset] = item.position.x;
      this.positions[offset + 1] = item.position.y;
      this.positions[offset + 2] = item.position.z;
      const lifeRatio = clamp(item.life / item.maxLife, 0, 1);
      this.colors[offset] = lifeRatio;
      this.colors[offset + 1] = lifeRatio;
      this.colors[offset + 2] = lifeRatio;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
}

class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.engine = null;
    this.engineGain = null;
    this.windGain = null;
    this.muted = false;
    this.started = false;
  }

  ensure() {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume();
      return true;
    }
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.16;
      this.master.connect(this.context.destination);
      this.engine = this.context.createOscillator();
      this.engine.type = 'sawtooth';
      this.engine.frequency.value = 70;
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 580;
      this.engineGain = this.context.createGain();
      this.engineGain.gain.value = 0.0;
      this.engine.connect(filter).connect(this.engineGain).connect(this.master);
      this.engine.start();
      const buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * 0.18;
      const wind = this.context.createBufferSource();
      wind.buffer = buffer;
      wind.loop = true;
      const windFilter = this.context.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 720;
      windFilter.Q.value = 0.5;
      this.windGain = this.context.createGain();
      this.windGain.gain.value = 0;
      wind.connect(windFilter).connect(this.windGain).connect(this.master);
      wind.start();
      this.started = true;
      return true;
    } catch (error) {
      this.context = null;
      return false;
    }
  }

  setMuted(value) {
    this.muted = value;
    if (this.master) this.master.gain.setTargetAtTime(value ? 0 : 0.16, this.context.currentTime, 0.03);
  }

  update(speed, nitroActive, driftActive) {
    if (!this.context || !this.engineGain) return;
    const now = this.context.currentTime;
    const normalized = clamp(Math.abs(speed) / 65, 0, 1);
    this.engine.frequency.setTargetAtTime(58 + normalized * 145 + (nitroActive ? 34 : 0), now, 0.045);
    this.engineGain.gain.setTargetAtTime(0.018 + normalized * 0.07, now, 0.06);
    if (this.windGain) this.windGain.gain.setTargetAtTime(normalized * 0.035 + (nitroActive ? 0.06 : 0), now, 0.08);
  }

  tone(frequency, duration, type = 'sine', volume = 0.12, slide = 0) {
    if (!this.ensure()) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  beep(frequency = 440, duration = 0.12, type = 'square') {
    this.tone(frequency, duration, type, 0.1);
  }

  boost(kind) {
    if (kind === 'break') this.tone(190, 0.34, 'sawtooth', 0.12, 720);
    else if (kind === 'double') this.tone(260, 0.28, 'square', 0.1, 500);
    else this.tone(180, 0.22, 'triangle', 0.09, 360);
  }

  collision() {
    this.tone(90, 0.16, 'sawtooth', 0.08, -35);
  }
}

class SunnyCoastRacer {
  constructor() {
    this.dom = {
      shell: $('#game-shell'),
      sceneRoot: $('#scene-root'),
      hud: $('#hud'),
      startOverlay: $('#start-overlay'),
      startButton: $('#start-button'),
      pauseOverlay: $('#pause-overlay'),
      pauseButton: $('#pause-button'),
      resumeButton: $('#resume-button'),
      pauseRestartButton: $('#pause-restart-button'),
      resultsOverlay: $('#results-overlay'),
      restartButton: $('#restart-button'),
      countdownOverlay: $('#countdown-overlay'),
      countdownValue: $('#countdown-value'),
      countdownCaption: $('#countdown-caption'),
      webglError: $('#webgl-error'),
      retryButton: $('#retry-button'),
      narrowNotice: $('#narrow-notice'),
      position: $('#position-value'),
      lap: $('#lap-value'),
      totalTime: $('#total-time'),
      bestTime: $('#best-time'),
      currentTime: $('#current-time'),
      speed: $('#speed-value'),
      gear: $('#gear-value'),
      speedDial: $('#speed-dial'),
      nitro: $('#nitro-value'),
      nitroFill: $('#nitro-fill'),
      nitroWrap: $('.nitro-wrap'),
      driftHud: $('#drift-hud'),
      driftLabel: $('#drift-label'),
      driftCharge: $('#drift-charge'),
      driftFill: $('#drift-fill'),
      boostMessage: $('#boost-message'),
      boostText: $('#boost-message .boost-cn'),
      boostSubText: $('#boost-message small'),
      driveState: $('#drive-state'),
      cameraLabel: $('#camera-label'),
      leaderboard: $('#leaderboard-list'),
      raceState: $('#race-state-label'),
      checkpoint: $('#checkpoint-value'),
      checkpointFill: $('#checkpoint-fill'),
      minimap: $('#minimap'),
      impactFlash: $('#impact-flash'),
      speedLines: $('#speed-lines'),
      muteButton: $('#mute-button'),
      muteLabel: $('#mute-label'),
      audioStatus: $('#audio-status'),
      resultTitle: $('#result-title'),
      resultPosition: $('#result-position'),
      resultSummary: $('#result-summary'),
      resultTotal: $('#result-total'),
      resultBest: $('#result-best'),
      resultList: $('#result-list')
    };
    this.keys = new Set();
    this.audio = new AudioEngine();
    this.clock = new THREE.Clock();
    this.accumulator = 0;
    this.elapsed = 0;
    this.raceTime = 0;
    this.raceState = 'menu';
    this.resumeState = 'racing';
    this.countdownRemaining = 0;
    this.goTimer = 0;
    this.lastCountdownNumber = null;
    this.cooldownRemaining = 0;
    this.pausedByBlur = false;
    this.cameraMode = 0;
    this.boostToastTimer = 0;
    this.shakeTimer = 0;
    this.lastFrameTime = performance.now() / 1000;
    this.track = new CoastTrack();
    this.racers = [];
    this.particles = {};
    this.impactRings = [];
    this.impactFlash = 0;
    this.clouds = [];
    this.seaWaves = [];
    this.swayFlags = [];
    this.gulls = [];
    this.boats = [];
    this.cranes = [];
    this.playerTrail = [];
    this.lastPlayerRank = 0;
    this.leaderboardFlash = '';
    this.tunnelLights = [];
    this.checkpointMeshes = [];
    this.isNarrow = false;
    this.isSoftwareRenderer = false;
    this.frameCounter = 0;
  }

  init() {
    this.initRenderer();
    this.initWorld();
    this.initParticles();
    this.initInput();
    this.resetRace();
    this.resize();
    window.addEventListener('resize', () => this.resize(), { passive: true });
    window.addEventListener('blur', () => this.handleBlur());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.handleBlur();
    });
    this.dom.retryButton.addEventListener('click', () => window.location.reload());
    this.dom.startButton.addEventListener('click', () => this.startRace());
    this.dom.resumeButton.addEventListener('click', () => this.togglePause(false));
    this.dom.pauseButton.addEventListener('click', () => this.togglePause());
    this.dom.pauseRestartButton.addEventListener('click', () => this.startRace());
    this.dom.restartButton.addEventListener('click', () => this.startRace());
    this.dom.muteButton.addEventListener('click', () => this.toggleMute());
    this.createSpeedLines();
    this.animate();
  }

  initRenderer() {
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      if (!this.renderer || !this.renderer.getContext()) throw new Error('WebGL context unavailable');
      const gl = this.renderer.getContext();
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const rendererName = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      this.isSoftwareRenderer = /swiftshader|llvmpipe|software/i.test(String(rendererName));
      this.renderer.setPixelRatio(this.isSoftwareRenderer ? 1 : Math.min(window.devicePixelRatio || 1, 1.6));
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.0;
      this.renderer.shadowMap.enabled = !this.isSoftwareRenderer;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.dom.sceneRoot.appendChild(this.renderer.domElement);
    } catch (error) {
      this.dom.webglError.hidden = false;
      this.dom.startOverlay.hidden = true;
      return;
    }
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7cc9db);
    this.scene.fog = new THREE.Fog(0x86cbd5, 310, 1150);
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1500);
    this.camera.position.set(0, 8, -20);
    this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.dom.webglError.hidden = false;
      this.pauseGame(true);
    });
  }

  initWorld() {
    this.scene.add(this.createSky());
    this.scene.environment = createEnvironmentTexture();
    this.scene.add(new THREE.HemisphereLight(0xc9f3ff, 0x274d5e, 1.25));
    const sunLight = new THREE.DirectionalLight(0xffe0ad, 2.75);
    sunLight.position.set(-220, 330, -240);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 900;
    sunLight.shadow.camera.left = -380;
    sunLight.shadow.camera.right = 380;
    sunLight.shadow.camera.top = 380;
    sunLight.shadow.camera.bottom = -380;
    this.scene.add(sunLight);
    const fillLight = new THREE.DirectionalLight(0x79c8e6, 0.48);
    fillLight.position.set(280, 140, 260);
    this.scene.add(fillLight);
    this.buildGround();
    this.buildTrack();
    this.buildScenery();
  }

  createSky() {
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x0f7cba) },
        horizonColor: { value: new THREE.Color(0x74cfdd) },
        lowerColor: { value: new THREE.Color(0xf0c583) }
      },
      vertexShader: `
        varying float vHeight;
        void main() {
          vHeight = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 lowerColor;
        varying float vHeight;
        void main() {
          float h = clamp(vHeight * 0.5 + 0.5, 0.0, 1.0);
          vec3 color = mix(lowerColor, horizonColor, smoothstep(0.02, 0.48, h));
          color = mix(color, topColor, smoothstep(0.42, 0.96, h));
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
    return new THREE.Mesh(new THREE.SphereGeometry(950, 32, 20), skyMaterial);
  }

  buildGround() {
    const islandOutline = [
      [-390, -300], [205, -315], [365, -220], [420, -55], [350, 115],
      [190, 270], [-95, 305], [-325, 225], [-430, 55], [-425, -165]
    ];
    const landMaterial = new THREE.MeshStandardMaterial({ color: 0x6f9d73, roughness: 0.98, metalness: 0.02, side: THREE.DoubleSide });
    const beachMaterial = new THREE.MeshStandardMaterial({ color: 0xd9bd82, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    const beach = createIslandMesh(islandOutline, beachMaterial, -1.08, 1.04);
    const land = createIslandMesh(islandOutline, landMaterial, -0.98, 0.98);
    this.islandOutline = islandOutline;
    this.scene.add(beach, land);

    const shoreline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(islandOutline.map(([x, z]) => vec3(x * 1.01, -0.93, z * 1.01))),
      new THREE.LineBasicMaterial({ color: 0xb8eee0, transparent: true, opacity: 0.62 })
    );
    this.scene.add(shoreline);
    const shallowWater = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(islandOutline.map(([x, z]) => vec3(x * 1.07, -1.3, z * 1.07))),
      new THREE.LineBasicMaterial({ color: 0x66d9d2, transparent: true, opacity: 0.34 })
    );
    this.scene.add(shallowWater);

    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(1900, 1900),
      new THREE.MeshPhysicalMaterial({ color: 0x0d7ba4, roughness: .46, metalness: .04, clearcoat: .5, clearcoatRoughness: .3, envMapIntensity: .35, transparent: true, opacity: .97 })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -1.36;
    this.scene.add(sea);
    this.sea = sea;

    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: createSunTexture(), transparent: true, depthWrite: false, opacity: 0.92 }));
    sun.position.set(-310, 255, -540);
    sun.scale.set(150, 150, 1);
    this.scene.add(sun);

    for (let i = 0; i < 18; i += 1) {
      const points = [];
      const z = -340 + i * 48;
      for (let x = -560; x <= 560; x += 24) {
        points.push(vec3(x, -1.23 + Math.sin(x * 0.025 + i * 1.7) * 0.1, z));
      }
      const wave = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: 0xcdfaf4, transparent: true, opacity: .38 })
      );
      this.seaWaves.push(wave);
      this.scene.add(wave);
    }
  }

  buildTrack() {
    this.roadMaterial = new THREE.MeshStandardMaterial({
      map: createRoadTexture(),
      color: 0xb7c9d0,
      roughness: 0.78,
      metalness: 0.1,
      side: THREE.DoubleSide
    });
    this.shoulderMaterial = new THREE.MeshStandardMaterial({ color: 0xd7a16c, roughness: 0.96, metalness: 0.02, side: THREE.DoubleSide });
    this.curbMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.58, metalness: 0.08, vertexColors: true });
    this.railMaterial = new THREE.MeshStandardMaterial({ color: 0x285269, roughness: 0.32, metalness: 0.72, side: THREE.DoubleSide });
    this.markerMaterial = new THREE.MeshStandardMaterial({ color: 0xffe9a2, emissive: 0x80501a, emissiveIntensity: 0.5, roughness: 0.52, metalness: 0.08 });
    this.laneLineMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f0cf, emissive: 0x6b633d, emissiveIntensity: 0.16, roughness: 0.7, metalness: 0.02, side: THREE.DoubleSide });
    this.checkerMaterial = new THREE.MeshStandardMaterial({ map: createCheckerTexture(), roughness: 0.72, side: THREE.DoubleSide });

    const road = this.makeRibbon(-ROAD_HALF_WIDTH, ROAD_HALF_WIDTH, this.roadMaterial, 0.03, 16);
    road.receiveShadow = true;
    this.scene.add(road);
    this.scene.add(this.makeRibbon(-ROAD_HALF_WIDTH - 1.25, -ROAD_HALF_WIDTH + 0.2, this.shoulderMaterial, 0.06, 16));
    this.scene.add(this.makeRibbon(ROAD_HALF_WIDTH - 0.2, ROAD_HALF_WIDTH + 1.25, this.shoulderMaterial, 0.06, 16));
    this.scene.add(this.makeRail(-ROAD_HALF_WIDTH - 1.8, 0.8));
    this.scene.add(this.makeRail(ROAD_HALF_WIDTH + 1.8, 0.8));
    this.scene.add(this.makeRibbon(-ROAD_HALF_WIDTH + 0.34, -ROAD_HALF_WIDTH + 0.48, this.laneLineMaterial, 0.075, 18));
    this.scene.add(this.makeRibbon(ROAD_HALF_WIDTH - 0.48, ROAD_HALF_WIDTH - 0.34, this.laneLineMaterial, 0.075, 18));

    const curbGeometry = new THREE.BoxGeometry(1.25, 0.18, 1.22);
    const curbCount = 172;
    const curbs = new THREE.InstancedMesh(curbGeometry, this.curbMaterial, curbCount);
    curbs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const dummy = new THREE.Object3D();
    const colorA = new THREE.Color(0xf9f1d0);
    const colorB = new THREE.Color(0xf05d4f);
    let curbIndex = 0;
    for (let i = 0; i < this.track.count; i += 6) {
      const sample = this.track.samples[i];
      for (const side of [-1, 1]) {
        if (curbIndex >= curbCount) break;
        dummy.position.copy(sample.point).addScaledVector(sample.right, side * (ROAD_HALF_WIDTH + 0.55));
        dummy.position.y += 0.12;
        dummy.rotation.set(0, Math.atan2(sample.tangent.x, sample.tangent.z), 0);
        dummy.updateMatrix();
        curbs.setMatrixAt(curbIndex, dummy.matrix);
        curbs.setColorAt(curbIndex, (i / 6) % 2 ? colorA : colorB);
        curbIndex += 1;
      }
    }
    curbs.castShadow = true;
    curbs.receiveShadow = true;
    this.scene.add(curbs);

    const markerGeometry = new THREE.BoxGeometry(0.28, 0.035, 3.2);
    const markerCount = 98;
    const markers = new THREE.InstancedMesh(markerGeometry, this.markerMaterial, markerCount);
    for (let i = 0; i < markerCount; i += 1) {
      const sample = this.track.samples[Math.floor(i * this.track.count / markerCount) % this.track.count];
      dummy.position.copy(sample.point);
      dummy.position.y += 0.085;
      dummy.rotation.set(0, Math.atan2(sample.tangent.x, sample.tangent.z), 0);
      dummy.updateMatrix();
      markers.setMatrixAt(i, dummy.matrix);
    }
    markers.receiveShadow = true;
    this.scene.add(markers);

    const startSample = this.track.sampleAt(0.001, {});
    const startLine = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF_WIDTH * 2.1, 0.07, 2.5), this.checkerMaterial);
    startLine.position.copy(startSample.point);
    startLine.position.y += 0.1;
    startLine.rotation.y = Math.atan2(startSample.tangent.x, startSample.tangent.z);
    startLine.receiveShadow = true;
    this.scene.add(startLine);

    this.buildRamp();
    this.buildTunnel();
    this.buildCheckpointGates();
  }

  makeRibbon(offsetA, offsetB, material, yOffset = 0, uRepeat = 12) {
    const positions = [];
    const uvs = [];
    const indices = [];
    for (let i = 0; i <= this.track.count; i += 1) {
      const sample = this.track.sampleAt(i / this.track.count, {});
      const left = sample.point.clone().addScaledVector(sample.right, offsetA);
      const right = sample.point.clone().addScaledVector(sample.right, offsetB);
      left.y += yOffset;
      right.y += yOffset;
      positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
      const u = (i / this.track.count) * uRepeat;
      uvs.push(u, 0, u, 1);
    }
    for (let i = 0; i < this.track.count; i += 1) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b, b, c, d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, material);
  }

  makeRail(offset, height) {
    const positions = [];
    const indices = [];
    for (let i = 0; i <= this.track.count; i += 1) {
      const sample = this.track.sampleAt(i / this.track.count, {});
      const p = sample.point.clone().addScaledVector(sample.right, offset);
      positions.push(p.x, p.y + height - .3, p.z, p.x, p.y + height + .3, p.z);
    }
    for (let i = 0; i < this.track.count; i += 1) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b, b, c, d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const rail = new THREE.Mesh(geometry, this.railMaterial);
    rail.castShadow = true;
    return rail;
  }

  buildRamp() {
    const sample = this.track.sampleAt(0.61, {});
    const width = ROAD_HALF_WIDTH * .92;
    const length = 13;
    const height = 2.15;
    const deckGeometry = new THREE.BufferGeometry();
    const deckVertices = new Float32Array([
      -width / 2, 0, -length / 2, width / 2, 0, -length / 2, -width / 2, 0, length / 2, width / 2, 0, length / 2,
      -width / 2, height, length / 2, width / 2, height, length / 2
    ]);
    deckGeometry.setAttribute('position', new THREE.BufferAttribute(deckVertices, 3));
    deckGeometry.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 0, 2, 4, 1, 5, 3]);
    deckGeometry.computeVertexNormals();
    const deckMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3f4c, roughness: .62, metalness: .18 });
    const ramp = new THREE.Mesh(deckGeometry, deckMaterial);
    ramp.position.copy(sample.point);
    ramp.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z);
    ramp.position.y += 0.08;
    ramp.castShadow = true;
    this.scene.add(ramp);

    const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0xffd257, emissive: 0x6a4a10, emissiveIntensity: .45, roughness: .5 });
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xf0a45b, roughness: .68, metalness: .1 });
    for (const side of [-1, 1]) {
      const wallGeometry = new THREE.BufferGeometry();
      const wallVertices = new Float32Array([
        0, 0, -length / 2, 0, 0, length / 2, 0, height + .5, length / 2
      ]);
      wallGeometry.setAttribute('position', new THREE.BufferAttribute(wallVertices, 3));
      wallGeometry.setIndex([0, 1, 2]);
      wallGeometry.computeVertexNormals();
      const wall = new THREE.Mesh(wallGeometry, wallMaterial);
      wall.position.set(side * width / 2, 0, 0);
      wall.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      wall.castShadow = true;
      ramp.add(wall);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(.5, .16, length * .96), stripeMaterial);
      lip.position.set(side * (width / 2 - .22), .16, 0);
      ramp.add(lip);
      for (let rib = 0; rib < 5; rib += 1) {
        const ribMesh = new THREE.Mesh(new THREE.BoxGeometry(.22, .3, .3), wallMaterial);
        ribMesh.position.set(side * (width / 2 + .12), .3 + rib * .38, -length / 2 + 1.4 + rib * 2.4);
        ramp.add(ribMesh);
      }
    }
    const lipBar = new THREE.Mesh(new THREE.BoxGeometry(width, .2, .46), stripeMaterial);
    lipBar.position.set(0, height + .06, length / 2 - .2);
    ramp.add(lipBar);
    for (let stripeIndex = 0; stripeIndex < 5; stripeIndex += 1) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(.62, .04, length * .9), stripeMaterial);
      stripe.position.set(-width / 2 + .5 + stripeIndex * (width - 1) / 4, .02, 0);
      stripe.rotation.x = -Math.atan2(height, length);
      ramp.add(stripe);
    }
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(.95, 2.2, 3), new THREE.MeshStandardMaterial({ color: 0xffe17a, emissive: 0x8d4c14, emissiveIntensity: .4 }));
    arrow.rotation.x = Math.PI / 2;
    arrow.rotation.z = Math.PI;
    arrow.position.copy(sample.point);
    arrow.position.y += 0.35;
    arrow.position.addScaledVector(sample.tangent, -3.4);
    this.scene.add(arrow);
  }

  buildTunnel() {
    const tunnelMaterial = new THREE.MeshStandardMaterial({ color: 0x193c50, roughness: 0.6, metalness: 0.42, transparent: true, opacity: 0.83, side: THREE.DoubleSide });
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x0e2e45, roughness: 0.48, metalness: 0.35 });
    const lightMaterial = new THREE.MeshStandardMaterial({ color: 0x7ef4ee, emissive: 0x28bfc8, emissiveIntensity: 2.4 });
    for (let i = 0; i < 12; i += 1) {
      const sample = this.track.sampleAt(0.72 + i * 0.009, {});
      const group = new THREE.Group();
      group.position.copy(sample.point);
      group.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF_WIDTH * 2 + 5, 0.45, 1.9), roofMaterial);
      roof.position.y = 4.2;
      roof.castShadow = true;
      group.add(roof);
      for (const side of [-1, 1]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.2, 1.2), tunnelMaterial);
        pillar.position.set(side * (ROAD_HALF_WIDTH + 1.1), 2.1, 0);
        pillar.castShadow = true;
        group.add(pillar);
      }
      const light = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 0.28), lightMaterial);
      light.position.set(0, 3.88, 0.1);
      group.add(light);
      this.tunnelLights.push(light.material);
      this.scene.add(group);
    }
  }

  buildCheckpointGates() {
    CHECKPOINT_FRACTIONS.forEach((fraction, index) => {
      const sample = this.track.sampleAt(fraction, {});
      const group = new THREE.Group();
      group.position.copy(sample.point);
      group.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z);
      const gateMaterial = new THREE.MeshStandardMaterial({ color: index % 2 ? 0xffb35c : 0x6ceff0, emissive: index % 2 ? 0x76320e : 0x176c76, emissiveIntensity: 1.5 });
      for (const side of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3.6, 8), new THREE.MeshStandardMaterial({ color: 0x254b62, metalness: 0.5, roughness: 0.42 }));
        pole.position.set(side * (ROAD_HALF_WIDTH + 1.4), 1.8, 0);
        group.add(pole);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.8), gateMaterial);
        flag.position.set(side * (ROAD_HALF_WIDTH + 0.85), 3.15, 0);
        flag.rotation.y = side * 0.1;
        group.add(flag);
      }
      const sign = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.55, 0.18), gateMaterial);
      sign.position.set(0, 3.45, 0);
      group.add(sign);
      group.userData.index = index;
      this.checkpointMeshes.push(group);
      this.scene.add(group);
    });
  }

  buildScenery() {
    const dummy = new THREE.Object3D();
    const palmPositions = [];
    for (let i = 0; i < 42; i += 1) {
      const t = wrap01(i / 42 + (i % 3) * 0.006);
      const sample = this.track.sampleAt(t, {});
      const side = i % 2 ? 1 : -1;
      const distance = 20 + (i % 5) * 4;
      const position = sample.point.clone().addScaledVector(sample.right, side * distance);
      position.y = -0.85;
      palmPositions.push({ position, rotation: Math.random() * TAU, scale: 0.8 + (i % 4) * 0.13 });
    }
    const trunkGeometry = new THREE.CylinderGeometry(0.25, 0.43, 5.8, 7);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8c5b3c, roughness: 1 });
    const trunkMesh = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, palmPositions.length);
    const leafGeometry = new THREE.ConeGeometry(.52, 3.6, 5);
    const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x3ca86e, roughness: .92, side: THREE.DoubleSide });
    const leafMesh = new THREE.InstancedMesh(leafGeometry, leafMaterial, palmPositions.length * 5);
    palmPositions.forEach((palm, index) => {
      dummy.position.copy(palm.position);
      dummy.position.y += 2.85 * palm.scale;
      dummy.rotation.set(0, palm.rotation, 0);
      dummy.scale.setScalar(palm.scale);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(index, dummy.matrix);
      for (let leafIndex = 0; leafIndex < 5; leafIndex += 1) {
        const angle = (leafIndex / 5) * TAU + palm.rotation;
        dummy.position.copy(palm.position);
        dummy.position.y += 5.35 * palm.scale;
        dummy.position.x += Math.cos(angle) * 1.7 * palm.scale;
        dummy.position.z += Math.sin(angle) * 1.7 * palm.scale;
        dummy.rotation.set(0, angle, -1.08);
        dummy.scale.set(palm.scale, palm.scale, palm.scale);
        dummy.updateMatrix();
        leafMesh.setMatrixAt(index * 5 + leafIndex, dummy.matrix);
      }
    });
    trunkMesh.castShadow = true;
    leafMesh.castShadow = true;
    this.scene.add(trunkMesh, leafMesh);

    const cityGroup = new THREE.Group();
    const cityMaterials = [new THREE.MeshStandardMaterial({ color: 0x4d7890, roughness: .9 }), new THREE.MeshStandardMaterial({ color: 0x6a93a1, roughness: .9 }), new THREE.MeshStandardMaterial({ color: 0x9aa9a3, roughness: .9 })];
    for (let i = 0; i < 58; i += 1) {
      const width = 5 + (i * 17 % 13);
      const height = 8 + (i * 31 % 36);
      const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, 8 + (i % 3) * 2), cityMaterials[i % cityMaterials.length]);
      building.position.set(-390 + i * 14, height / 2 - 1, 395 + (i % 4) * 8);
      building.castShadow = true;
      cityGroup.add(building);
    }
    this.scene.add(cityGroup);

    const lighthouseSample = this.track.sampleAt(0.18, {});
    const lighthouse = new THREE.Group();
    lighthouse.position.copy(lighthouseSample.point).addScaledVector(lighthouseSample.right, 29);
    lighthouse.position.y = -0.7;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 3.4, 18, 12), new THREE.MeshStandardMaterial({ color: 0xf4eee0, roughness: .85 }));
    tower.position.y = 9;
    tower.castShadow = true;
    lighthouse.add(tower);
    const redBand = new THREE.Mesh(new THREE.CylinderGeometry(2.16, 2.16, 3.1, 12), new THREE.MeshStandardMaterial({ color: 0xe85a4f, roughness: .82 }));
    redBand.position.y = 10.5;
    lighthouse.add(redBand);
    const balcony = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, .45, 12), new THREE.MeshStandardMaterial({ color: 0x2e6270, metalness: .45, roughness: .4 }));
    balcony.position.y = 18.2;
    lighthouse.add(balcony);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 10), new THREE.MeshStandardMaterial({ color: 0x7ef4ee, emissive: 0x28c8d0, emissiveIntensity: 2.6, transparent: true, opacity: .9 }));
    lantern.position.y = 19.6;
    lighthouse.add(lantern);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(3.2, 38, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe9a2, transparent: true, opacity: .08, side: THREE.DoubleSide, depthWrite: false }));
    beam.rotation.z = Math.PI / 2;
    beam.position.set(15, 19.5, 0);
    lighthouse.add(beam);
    this.lighthouseBeam = beam;
    this.scene.add(lighthouse);

    const cloudTexture = createCloudTexture();
    for (let i = 0; i < 14; i += 1) {
      const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexture, transparent: true, opacity: .48 + (i % 3) * .08, depthWrite: false }));
      cloud.position.set(-460 + (i * 103) % 920, 92 + (i % 3) * 18, -390 + (i * 67) % 620);
      cloud.scale.set(82 + (i % 4) * 14, 34 + (i % 3) * 7, 1);
      this.clouds.push(cloud);
      this.scene.add(cloud);
    }

    const mountainMaterial = new THREE.MeshStandardMaterial({ color: 0x5e807a, roughness: 1, metalness: 0, flatShading: true });
    for (let i = 0; i < 11; i += 1) {
      const mountain = new THREE.Mesh(new THREE.ConeGeometry(46 + (i % 3) * 12, 72 + (i % 4) * 20, 6), mountainMaterial);
      mountain.position.set(-410 + i * 82, 22 + (i % 3) * 6, -510 - (i % 2) * 28);
      mountain.rotation.y = i * .7;
      mountain.scale.y = .7 + (i % 3) * .16;
      mountain.castShadow = true;
      this.scene.add(mountain);
    }

    const signMaterial = new THREE.MeshStandardMaterial({ color: 0x2b8a9a, emissive: 0x0b3b4c, emissiveIntensity: .8, side: THREE.DoubleSide });
    for (let i = 0; i < 8; i += 1) {
      const sample = this.track.sampleAt(i / 8 + .08, {});
      const side = i % 2 ? 1 : -1;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.25), signMaterial);
      sign.position.copy(sample.point).addScaledVector(sample.right, side * 13.5);
      sign.position.y += 2.3;
      sign.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z) + Math.PI / 2;
      this.scene.add(sign);
    }

    const gateSample = this.track.sampleAt(0.998, {});
    const gate = new THREE.Group();
    gate.position.copy(gateSample.point);
    gate.rotation.y = Math.atan2(gateSample.tangent.x, gateSample.tangent.z);
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0xf4e4ad, roughness: .6, metalness: .2 });
    const bannerMaterial = new THREE.MeshStandardMaterial({ color: 0xff7048, emissive: 0x6e241e, emissiveIntensity: .35, side: THREE.DoubleSide });
    const flagMaterial = new THREE.MeshStandardMaterial({ color: 0x5de5ec, emissive: 0x176b78, emissiveIntensity: .45, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.12, .18, 5.6, 8), poleMaterial);
      pole.position.set(side * 13.2, 2.6, 0);
      pole.castShadow = true;
      gate.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.35), flagMaterial);
      flag.position.set(side * 11.35, 4.2, 0);
      flag.rotation.y = side > 0 ? 0 : Math.PI;
      gate.add(flag);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(9.5, .42, .22), bannerMaterial);
    banner.position.y = 5.3;
    banner.castShadow = true;
    gate.add(banner);
    this.scene.add(gate);

    this.buildRoadsideDetail();
    this.buildCoastalDetail();
  }

  islandRadiusAt(angle) {
    const outline = this.islandOutline;
    if (!outline) return 400;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    let best = Infinity;
    for (let i = 0; i < outline.length; i += 1) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      const ex = b[0] - a[0];
      const ez = b[1] - a[1];
      const denom = dx * ez - dz * ex;
      if (Math.abs(denom) < 1e-6) continue;
      const s = (a[0] * ez - a[1] * ex) / denom;
      if (s <= 0) continue;
      const u = Math.abs(ex) > Math.abs(ez) ? (s * dx - a[0]) / ex : (s * dz - a[1]) / ez;
      if (u < -0.001 || u > 1.001) continue;
      best = Math.min(best, s);
    }
    return Number.isFinite(best) ? best : 400;
  }

  buildRoadsideDetail() {
    const shrubPalette = [0x3f8f5c, 0x2f7a51, 0x58a862, 0x6f8f3a, 0x4b9a6b];
    const shrubGeometry = new THREE.IcosahedronGeometry(1, 1);
    const shrubs = [];
    for (let i = 0; i < 190; i += 1) {
      const t = wrap01(i / 190 + (i % 7) * .003);
      const sample = this.track.sampleAt(t, {});
      const side = i % 2 ? 1 : -1;
      const ring = i % 3;
      const distance = 11 + ring * 7 + (i % 11) * 3.4;
      const position = sample.point.clone().addScaledVector(sample.right, side * distance);
      position.x += ((i * 37) % 23) - 11;
      position.z += ((i * 53) % 23) - 11;
      position.y = -0.9 + (i % 3) * .05;
      shrubs.push({ position, scale: 1.2 + (i % 6) * .34, rotation: (i * 1.9) % TAU, squash: .78 + (i % 4) * .07, color: shrubPalette[i % shrubPalette.length] });
    }
    const shrubMeshes = shrubPalette.map((color) => {
      const mesh = new THREE.InstancedMesh(shrubGeometry, new THREE.MeshStandardMaterial({ color, roughness: .95, flatShading: true }), 64);
      mesh.castShadow = true;
      mesh.count = 0;
      this.scene.add(mesh);
      return mesh;
    });
    const dummy = new THREE.Object3D();
    shrubs.forEach((shrub) => {
      const mesh = shrubMeshes[shrubPalette.indexOf(shrub.color)];
      dummy.position.copy(shrub.position);
      dummy.rotation.set(0, shrub.rotation, 0);
      dummy.scale.set(shrub.scale, shrub.scale * shrub.squash, shrub.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(mesh.count, dummy.matrix);
      mesh.count += 1;
    });
    shrubMeshes.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; });

    const broadleafTrunkGeometry = new THREE.CylinderGeometry(.3, .46, 4.4, 6);
    const broadleafTrunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4a34, roughness: 1 });
    const broadleafCanopyGeometry = new THREE.IcosahedronGeometry(2.5, 1);
    const broadleafPalette = [0x2f7f4f, 0x3d9159, 0x2a6f52, 0x4a9a5c];
    const broadleaf = [];
    for (let i = 0; i < 34; i += 1) {
      const sample = this.track.sampleAt(wrap01(i / 34 + .04), {});
      const side = i % 2 ? 1 : -1;
      const position = sample.point.clone().addScaledVector(sample.right, side * (19 + (i % 5) * 8));
      position.x += ((i * 29) % 17) - 8;
      position.z += ((i * 41) % 17) - 8;
      broadleaf.push({ position, scale: .85 + (i % 4) * .3, rotation: (i * 2.3) % TAU, color: broadleafPalette[i % broadleafPalette.length] });
    }
    const trunkMesh = new THREE.InstancedMesh(broadleafTrunkGeometry, broadleafTrunkMaterial, broadleaf.length);
    trunkMesh.castShadow = true;
    this.scene.add(trunkMesh);
    const canopyMeshes = broadleafPalette.map((color) => {
      const mesh = new THREE.InstancedMesh(broadleafCanopyGeometry, new THREE.MeshStandardMaterial({ color, roughness: .93, flatShading: true }), 12);
      mesh.castShadow = true;
      mesh.count = 0;
      this.scene.add(mesh);
      return mesh;
    });
    broadleaf.forEach((tree, index) => {
      dummy.position.copy(tree.position);
      dummy.position.y += 2.1 * tree.scale;
      dummy.rotation.set(0, tree.rotation, 0);
      dummy.scale.setScalar(tree.scale);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(index, dummy.matrix);
      const canopy = canopyMeshes[broadleafPalette.indexOf(tree.color)];
      dummy.position.copy(tree.position);
      dummy.position.y += 4.6 * tree.scale;
      dummy.rotation.set(0, tree.rotation * 1.7, .1);
      dummy.scale.set(tree.scale * 1.15, tree.scale * .92, tree.scale * 1.15);
      dummy.updateMatrix();
      canopy.setMatrixAt(canopy.count, dummy.matrix);
      canopy.count += 1;
    });
    trunkMesh.instanceMatrix.needsUpdate = true;
    canopyMeshes.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; });

    const lampPoleMaterial = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: .58, metalness: .3 });
    const lampHeadMaterial = new THREE.MeshStandardMaterial({ color: 0xfff6d2, emissive: 0xffd98a, emissiveIntensity: 2.2 });
    const lampHeadGeometry = new THREE.SphereGeometry(.3, 10, 8);
    const lampHeads = [];
    for (let i = 0; i < 18; i += 1) {
      const t = wrap01(i / 18 + .012);
      const sample = this.track.sampleAt(t, {});
      const side = i % 2 ? 1 : -1;
      const lamp = new THREE.Group();
      lamp.position.copy(sample.point).addScaledVector(sample.right, side * 10.6);
      lamp.position.y = -0.9;
      lamp.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.11, .17, 8.2, 8), lampPoleMaterial);
      pole.position.y = 4.1;
      pole.castShadow = true;
      lamp.add(pole);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(.42, .5, .5, 8), new THREE.MeshStandardMaterial({ color: 0x2a4a52, roughness: .8 }));
      foot.position.y = .2;
      lamp.add(foot);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.7, .12, .12), lampPoleMaterial);
      arm.position.set(-side * .82, 8.05, 0);
      lamp.add(arm);
      const head = new THREE.Mesh(lampHeadGeometry, lampHeadMaterial);
      head.position.set(-side * 1.6, 7.82, 0);
      lamp.add(head);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(.52, .4, 10), lampPoleMaterial);
      shade.position.set(-side * 1.6, 8.16, 0);
      lamp.add(shade);
      lampHeads.push(head);
      this.scene.add(lamp);
    }
    this.lampHeads = lampHeads;
    this.lampHeadMaterial = lampHeadMaterial;

    const chevronShape = new THREE.Shape();
    chevronShape.moveTo(0, .9);
    chevronShape.lineTo(.72, 0);
    chevronShape.lineTo(.72, -.9);
    chevronShape.lineTo(0, 0);
    chevronShape.closePath();
    const chevronMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2b33, roughness: .5, metalness: .2 });
    const chevronFace = new THREE.MeshStandardMaterial({ color: 0xffd257, emissive: 0x6a4a10, emissiveIntensity: .5, roughness: .45, side: THREE.DoubleSide });
    const curvature = [];
    for (let i = 0; i < this.track.count; i += 6) {
      const a = this.track.samples[i].tangent;
      const b = this.track.samples[(i + 14) % this.track.count].tangent;
      curvature.push({ t: this.track.samples[i].t, amount: Math.abs(a.x * b.z - a.z * b.x), sign: Math.sign(a.x * b.z - a.z * b.x) });
    }
    curvature.sort((p, q) => q.amount - p.amount);
    const corners = [];
    curvature.forEach((entry) => {
      if (corners.length >= 6) return;
      if (corners.some((corner) => Math.abs(corner.t - entry.t) < .09)) return;
      corners.push(entry);
    });
    corners.forEach((corner) => {
      for (let step = -3; step <= 3; step += 1) {
        const sample = this.track.sampleAt(wrap01(corner.t + step * .012), {});
        const side = corner.sign > 0 ? 1 : -1;
        const board = new THREE.Group();
        board.position.copy(sample.point).addScaledVector(sample.right, side * 8.4);
        board.position.y = .1;
        board.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z) + Math.PI / 2;
        const panel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.7, .12), chevronMaterial);
        panel.castShadow = true;
        board.add(panel);
        const arrow = new THREE.Mesh(new THREE.ShapeGeometry(chevronShape), chevronFace);
        arrow.position.z = .08;
        if (side < 0) arrow.rotation.y = Math.PI;
        board.add(arrow);
        const leg = new THREE.Mesh(new THREE.BoxGeometry(.12, .8, .12), chevronMaterial);
        leg.position.y = -.9;
        board.add(leg);
        this.scene.add(board);
      }
    });

    const billboardWords = [
      ['SPEED', 'COAST', 'FREEDOM'],
      ['晴潮竞速', 'SUNNY COAST RACER'],
      ['VOL. 01', 'TIDAL RUN']
    ];
    for (let i = 0; i < 6; i += 1) {
      const sample = this.track.sampleAt(i / 6 + .09, {});
      const side = i % 2 ? 1 : -1;
      const words = billboardWords[i % billboardWords.length];
      const board = new THREE.Group();
      board.position.copy(sample.point).addScaledVector(sample.right, side * 15.5);
      board.position.y = -0.9;
      board.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z) + Math.PI / 2 + (side > 0 ? .34 : -.34);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(9.4, 4.6, .34), new THREE.MeshStandardMaterial({ color: 0x0e2f40, roughness: .55, metalness: .35 }));
      frame.position.y = 4.1;
      frame.castShadow = true;
      board.add(frame);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(8.7, 3.9), new THREE.MeshBasicMaterial({ map: createBillboardTexture(words.join('  '), '#ffe98a', '#0a2635') }));
      face.position.set(0, 4.1, .2);
      board.add(face);
      for (const x of [-3.4, 3.4]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(.38, 2.2, .38), new THREE.MeshStandardMaterial({ color: 0x35505c, roughness: .8 }));
        leg.position.set(x, 1.1, 0);
        leg.castShadow = true;
        board.add(leg);
      }
      this.scene.add(board);
    }
  }

  buildCoastalDetail() {
    const concreteMaterial = new THREE.MeshStandardMaterial({ color: 0xd9d2c2, roughness: .92 });
    const steelMaterial = new THREE.MeshStandardMaterial({ color: 0xe8673f, roughness: .55, metalness: .35 });
    const darkTrimMaterial = new THREE.MeshStandardMaterial({ color: 0x123244, roughness: .5, metalness: .5 });
    const startSample = this.track.sampleAt(.002, {});
    const gantry = new THREE.Group();
    gantry.position.copy(startSample.point);
    gantry.rotation.y = Math.atan2(startSample.tangent.x, startSample.tangent.z);
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(.34, .46, 9.2, 10), concreteMaterial);
      pillar.position.set(side * 12.4, 4.4, 0);
      pillar.castShadow = true;
      gantry.add(pillar);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(1.5, .5, 1.5), darkTrimMaterial);
      foot.position.set(side * 12.4, .12, 0);
      gantry.add(foot);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(25.6, 1.5, .5), concreteMaterial);
    beam.position.y = 8.7;
    beam.castShadow = true;
    gantry.add(beam);
    const beamTrim = new THREE.Mesh(new THREE.BoxGeometry(26, .34, .62), steelMaterial);
    beamTrim.position.y = 9.32;
    gantry.add(beamTrim);
    const startPanel = new THREE.Mesh(new THREE.BoxGeometry(9.4, 1.15, .22), new THREE.MeshStandardMaterial({ color: 0x0f3a4c, emissive: 0x2ad3e0, emissiveIntensity: 1.5, roughness: .4 }));
    startPanel.position.set(0, 8.7, .12);
    gantry.add(startPanel);
    const startText = createBillboardTexture('START / FINISH', '#8ff6ff', '#062434');
    const startBoard = new THREE.Mesh(new THREE.PlaneGeometry(9.1, 1.02), new THREE.MeshBasicMaterial({ map: startText, transparent: true }));
    startBoard.position.set(0, 8.7, .26);
    gantry.add(startBoard);
    const startBack = new THREE.Mesh(new THREE.PlaneGeometry(9.1, 1.02), new THREE.MeshBasicMaterial({ map: startText, transparent: true }));
    startBack.position.set(0, 8.7, -.26);
    startBack.rotation.y = Math.PI;
    gantry.add(startBack);
    const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffc247, emissiveIntensity: 1.9 });
    const startLights = [];
    for (let i = 0; i < 6; i += 1) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(.19, 10, 8), lightMaterial.clone());
      bulb.position.set(-8.75 + i * 3.5, 7.9, .34);
      gantry.add(bulb);
      startLights.push(bulb);
    }
    this.startGantryLights = startLights;
    this.scene.add(gantry);

    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: .7 });
    const flagColors = [0xff6b4a, 0x5de5ec, 0xffd75e, 0x8affa8, 0xff8ad0];
    for (let i = 0; i < 26; i += 1) {
      const t = wrap01(i / 26 + .03);
      const sample = this.track.sampleAt(t, {});
      const side = i % 2 ? 1 : -1;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(.07, .1, 6.2, 6), poleMaterial);
      mast.position.copy(sample.point).addScaledVector(sample.right, side * 9.4);
      mast.position.y += 2.9;
      mast.castShadow = true;
      this.scene.add(mast);
      const pivot = new THREE.Group();
      pivot.position.copy(mast.position);
      pivot.position.y += 2.9;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.15, 6, 1), new THREE.MeshStandardMaterial({ color: flagColors[i % flagColors.length], roughness: .78, side: THREE.DoubleSide, emissive: flagColors[i % flagColors.length], emissiveIntensity: .12 }));
      cloth.position.set(1.15, 0, 0);
      pivot.add(cloth);
      pivot.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z) + (side > 0 ? -1.5 : 1.5);
      this.scene.add(pivot);
      this.swayFlags.push({ pivot, cloth, phase: i * .7, base: pivot.rotation.y });
    }

    const umbrellaColors = [0xff7a59, 0x5ad6e6, 0xffd36b, 0xff92b8];
    const towelColors = [0xfdf6e6, 0x9fe6dd, 0xffd9a8, 0xffc2d4];
    for (let i = 0; i < 30; i += 1) {
      const t = wrap01(i / 30 * .78 + .12);
      const sample = this.track.sampleAt(t, {});
      const outward = Math.atan2(sample.point.z, sample.point.x);
      const shoreRadius = this.islandRadiusAt(outward);
      const clusterAngle = outward + ((i % 3) - 1) * .045;
      const radius = this.islandRadiusAt(clusterAngle) * (.965 + (i % 4) * .017);
      const base = new THREE.Vector3(Math.cos(clusterAngle) * radius, -1.02, Math.sin(clusterAngle) * radius);
      if (base.distanceTo(sample.point) < 34) continue;
      const cluster = new THREE.Group();
      cluster.position.copy(base);
      cluster.rotation.y = (i * 1.37) % TAU;
      const color = umbrellaColors[i % umbrellaColors.length];
      const umbrella = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 2.5, 6), poleMaterial);
      stem.position.y = 1.25;
      umbrella.add(stem);
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.5, .68, 8, 1, true), new THREE.MeshStandardMaterial({ color, roughness: .82, side: THREE.DoubleSide }));
      canopy.position.y = 2.5;
      canopy.castShadow = true;
      umbrella.add(canopy);
      umbrella.rotation.z = .12;
      cluster.add(umbrella);
      for (let seat = 0; seat < 2; seat += 1) {
        const angle = seat ? .62 : -.5;
        const lounger = new THREE.Mesh(new RoundedBoxGeometry(.7, .12, 1.7, 2, .05), new THREE.MeshStandardMaterial({ color: towelColors[i % towelColors.length], roughness: .88 }));
        lounger.position.set(Math.sin(angle) * 2.05, .34, Math.cos(angle) * 2.05);
        lounger.rotation.y = angle;
        lounger.castShadow = true;
        cluster.add(lounger);
        const leg = new THREE.Mesh(new RoundedBoxGeometry(.64, .12, .56, 2, .04), darkTrimMaterial);
        leg.position.set(Math.sin(angle) * 2.6, .16, Math.cos(angle) * 2.6);
        leg.rotation.y = angle;
        cluster.add(leg);
      }
      this.scene.add(cluster);
    }

    const hullMaterial = new THREE.MeshStandardMaterial({ color: 0xf7f3e8, roughness: .62 });
    const hullAccentMaterial = new THREE.MeshStandardMaterial({ color: 0x1d6f86, roughness: .55 });
    const sailMaterial = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: .8, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i += 1) {
      const boat = new THREE.Group();
      const angle = -.4 + i * .46;
      const radius = 300 + (i % 3) * 78;
      boat.position.set(Math.cos(angle) * radius - 120, -1.15, Math.sin(angle) * radius + 240);
      boat.rotation.y = angle + 1.2;
      const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), hullMaterial);
      hull.scale.set(1.05, .62, 3.4);
      hull.castShadow = true;
      boat.add(hull);
      const stripe = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6), hullAccentMaterial);
      stripe.scale.set(1.07, .3, 3.1);
      stripe.position.y = .16;
      boat.add(stripe);
      const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.5, .8, 1.9, 2, .12), hullMaterial);
      cabin.position.set(0, .5, -.3);
      boat.add(cabin);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(.07, .1, 8.4, 6), darkTrimMaterial);
      mast.position.y = 4.2;
      boat.add(mast);
      const mainShape = new THREE.Shape();
      mainShape.moveTo(0, 0);
      mainShape.lineTo(0, 7.4);
      mainShape.lineTo(3.3, .5);
      mainShape.closePath();
      const mainSail = new THREE.Mesh(new THREE.ShapeGeometry(mainShape), sailMaterial);
      mainSail.position.set(.08, .6, 0);
      mainSail.rotation.y = Math.PI / 2;
      boat.add(mainSail);
      const jibShape = new THREE.Shape();
      jibShape.moveTo(0, 0);
      jibShape.lineTo(0, 5.2);
      jibShape.lineTo(-2.1, .4);
      jibShape.closePath();
      const jib = new THREE.Mesh(new THREE.ShapeGeometry(jibShape), sailMaterial);
      jib.position.set(-.08, .6, 1.9);
      boat.add(jib);
      this.boats.push({ group: boat, phase: i * 1.3 });
      this.scene.add(boat);
    }

    for (let i = 0; i < 5; i += 1) {
      const crane = new THREE.Group();
      const base = -330 + i * 96;
      crane.position.set(base, 0, 352 + (i % 2) * 26);
      crane.rotation.y = -.5 + i * .22;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(3.4, 44, 3.4), concreteMaterial);
      tower.position.y = 22;
      tower.castShadow = true;
      crane.add(tower);
      for (let braceIndex = 0; braceIndex < 5; braceIndex += 1) {
        const brace = new THREE.Mesh(new THREE.BoxGeometry(4.2, .6, 4.2), steelMaterial);
        brace.position.y = 6 + braceIndex * 8;
        crane.add(brace);
      }
      const boom = new THREE.Mesh(new THREE.BoxGeometry(38, 1.8, 2.4), steelMaterial);
      boom.position.set(11, 45, 0);
      boom.rotation.z = .16;
      boom.castShadow = true;
      crane.add(boom);
      const counterweight = new THREE.Mesh(new THREE.BoxGeometry(7, 3.4, 3.6), darkTrimMaterial);
      counterweight.position.set(-11, 44, 0);
      crane.add(counterweight);
      const cabin = new THREE.Mesh(new RoundedBoxGeometry(3.4, 2.6, 3, 2, .3), new THREE.MeshStandardMaterial({ color: 0xf7f1e2, roughness: .6 }));
      cabin.position.set(3, 42.4, 0);
      crane.add(cabin);
      this.cranes.push({ group: crane, boom, phase: i * .8 });
      this.scene.add(crane);
    }

    const gullMaterial = new THREE.MeshStandardMaterial({ color: 0xfdfbf4, roughness: .9, side: THREE.DoubleSide });
    const gullGeometry = new THREE.BufferGeometry();
    gullGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -1.1, .1, .5, -1.35, 0, .1, 0, 0, 0, 1.1, .1, .5, 1.35, 0, .1], 3));
    gullGeometry.computeVertexNormals();
    for (let i = 0; i < 9; i += 1) {
      const gull = new THREE.Mesh(gullGeometry, gullMaterial);
      this.gulls.push({ mesh: gull, radius: 46 + i * 9, height: 26 + (i % 4) * 6, speed: .22 + (i % 3) * .07, phase: i * .9, center: new THREE.Vector3(-40 + (i % 3) * 60, 0, 60 + (i % 4) * 44) });
      this.scene.add(gull);
    }

    const farMaterial = new THREE.MeshBasicMaterial({ color: 0x9fc4cd, fog: true });
    for (let i = 0; i < 9; i += 1) {
      const ridge = new THREE.Mesh(new THREE.ConeGeometry(88 + (i % 3) * 26, 120 + (i % 4) * 34, 5), farMaterial);
      ridge.position.set(-560 + i * 138, 26 + (i % 3) * 8, -760 - (i % 2) * 40);
      ridge.rotation.y = i * .9;
      ridge.scale.y = .62 + (i % 3) * .12;
      this.scene.add(ridge);
    }
    const island = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 8), new THREE.MeshStandardMaterial({ color: 0x74a08c, roughness: 1, flatShading: true }));
    island.position.set(430, -12, 470);
    island.scale.set(120, 26, 76);
    island.rotation.y = .4;
    this.scene.add(island);

    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: createGlowTexture(0xfff0c0), color: 0xffe9ac, transparent: true, opacity: .62, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    sunGlow.position.set(150, 96, -520);
    sunGlow.scale.set(230, 230, 1);
    this.scene.add(sunGlow);
    const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: createGlowTexture(0xffffff), color: 0xffffff, transparent: true, opacity: .95, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    sunCore.position.set(150, 96, -520);
    sunCore.scale.set(76, 76, 1);
    this.scene.add(sunCore);
  }

  initParticles() {
    this.particles.smoke = new ParticlePool(190, new THREE.Color(0xd9f6f2), 1.05, .34, false);
    this.particles.sparks = new ParticlePool(70, new THREE.Color(0xffc45b), .42, .82, true);
    this.scene.add(this.particles.smoke.points, this.particles.sparks.points);
    for (let i = 0; i < 8; i += 1) {
      const material = new THREE.MeshBasicMaterial({ color: 0xffc45b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(.52, .68, 24), material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 4;
      this.scene.add(mesh);
      this.impactRings.push({ mesh, life: 0, maxLife: 1 });
    }
  }

  spawnImpact(position, intensity = 1) {
    const ring = this.impactRings.find((candidate) => candidate.life <= 0) || this.impactRings[0];
    ring.life = 0.34 + intensity * 0.12;
    ring.maxLife = ring.life;
    ring.mesh.position.copy(position);
    ring.mesh.position.y += 0.08;
    ring.mesh.scale.setScalar(.45 + intensity * .18);
    ring.mesh.material.color.set(intensity > 1.2 ? 0xff7048 : 0xffd36a);
    ring.mesh.material.opacity = .86;
    ring.mesh.visible = true;
  }

  updateImpactEffects(dt) {
    for (const ring of this.impactRings) {
      if (ring.life <= 0) continue;
      ring.life -= dt;
      if (ring.life <= 0) { ring.mesh.visible = false; ring.mesh.material.opacity = 0; continue; }
      const ratio = clamp(ring.life / ring.maxLife, 0, 1);
      ring.mesh.material.opacity = ratio * .82;
      ring.mesh.scale.multiplyScalar(1 + dt * 2.8);
    }
    this.impactFlash = Math.max(0, this.impactFlash - dt);
    if (this.dom.impactFlash) this.dom.impactFlash.style.opacity = String(this.impactFlash * 1.8);
  }

  createSpeedLines() {
    for (let i = 0; i < 28; i += 1) {
      const line = document.createElement('i');
      line.className = 'speed-line';
      line.style.setProperty('--left', `${3 + Math.random() * 94}%`);
      line.style.setProperty('--top', `${-10 + Math.random() * 75}%`);
      line.style.setProperty('--h', `${35 + Math.random() * 110}px`);
      line.style.setProperty('--rot', `${-10 + Math.random() * 20}deg`);
      line.style.setProperty('--dur', `${.42 + Math.random() * .65}s`);
      this.dom.speedLines.appendChild(line);
    }
  }

  initInput() {
    const tracked = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight']);
    window.addEventListener('keydown', (event) => {
      if (tracked.has(event.code)) event.preventDefault();
      if (!this.keys.has(event.code)) this.handleKeyPress(event.code);
      this.keys.add(event.code);
    }, { passive: false });
    window.addEventListener('keyup', (event) => {
      if (tracked.has(event.code)) event.preventDefault();
      this.keys.delete(event.code);
    }, { passive: false });
    document.querySelectorAll('[data-key]').forEach((button) => {
      const code = button.dataset.key;
      const press = (event) => { event.preventDefault(); button.classList.add('pressed'); if (!this.keys.has(code)) this.handleKeyPress(code); this.keys.add(code); };
      const release = (event) => { event.preventDefault(); button.classList.remove('pressed'); this.keys.delete(code); };
      button.addEventListener('pointerdown', press);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('pointerleave', release);
    });
  }

  handleKeyPress(code) {
    if (code === 'KeyP' || code === 'Escape') { this.togglePause(); return; }
    if (code === 'KeyR') { this.startRace(); return; }
    if (code === 'KeyC') { this.cameraMode = (this.cameraMode + 1) % 3; this.dom.cameraLabel.textContent = CAMERA_LABELS[this.cameraMode]; this.audio.beep(560, .06, 'sine'); return; }
    if (code === 'KeyM') { this.toggleMute(); return; }
    if (code === 'ShiftLeft' || code === 'ShiftRight') {
      if (this.player && (this.raceState === 'racing' || this.raceState === 'countdown')) {
        if (this.player.driftActive) this.releaseDrift(this.player);
        else if (this.player.nitro >= 18) this.applyNitro(this.player);
      }
      return;
    }
    if (code === 'Enter') {
      if (this.raceState === 'menu' || this.raceState === 'finished') this.startRace();
      else if (this.raceState === 'paused') this.togglePause(false);
      return;
    }
    if (this.raceState === 'menu' && ['KeyW', 'ArrowUp', 'KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight', 'Space'].includes(code)) this.startRace();
  }

  getPlayerControl() {
    const has = (...codes) => codes.some((code) => this.keys.has(code));
    return {
      throttle: has('KeyW', 'ArrowUp') ? 1 : 0,
      brake: has('KeyS', 'ArrowDown') ? 1 : 0,
      steer: (has('KeyA', 'ArrowLeft') ? 1 : 0) - (has('KeyD', 'ArrowRight') ? 1 : 0),
      drift: has('Space'),
      nitro: has('ControlLeft', 'ControlRight')
    };
  }

  createRacer(name, color, index) {
    const isPlayer = index === 0;
    const visual = this.createCarVisual(color, isPlayer);
    this.scene.add(visual);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 24),
      new THREE.MeshBasicMaterial({ color: 0x03131d, transparent: true, opacity: 0.34, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1.55, 2.65, 1);
    shadow.renderOrder = 1;
    this.scene.add(shadow);
    const spawnT = wrap01(0.018 + index * 0.018);
    const sample = this.track.sampleAt(spawnT, {});
    const lane = isPlayer ? 0 : (index % 2 ? -2.5 : 2.5);
    const position = sample.point.clone().addScaledVector(sample.right, lane);
    position.y += 0.06;
    const heading = Math.atan2(sample.tangent.x, sample.tangent.z);
    return {
      id: index,
      name,
      color,
      isPlayer,
      visual,
      shadow,
      position,
      heading,
      speed: 0,
      lateralVelocity: 0,
      steer: 0,
      nitro: isPlayer ? 68 : 48 + index * 6,
      driftActive: false,
      driftCharge: 0,
      driftSegments: 0,
      driftReleaseCount: 0,
      driftDirection: 0,
      directionChangeAge: 10,
      directionChanged: false,
      driftSegmentsBeforeRelease: 1,
      boostTimer: 0,
      boostForce: 0,
      boostKind: '',
      nitroActive: false,
      lap: 0,
      nextCheckpoint: 0,
      checkpointCount: 0,
      lastS: sample.t,
      projected: this.track.nearest(position),
      lateral: 0,
      progress: sample.t,
      wrongWay: false,
      finished: false,
      finishTime: 0,
      bestLap: 0,
      lapStartedAt: 0,
      lastLapStart: 0,
      airborne: false,
      verticalOffset: 0,
      verticalVelocity: 0,
      jumpArmed: false,
      collisionCooldown: 0,
      collisionFlash: 0,
      emitClock: 0,
      aiCooldown: 0.5 + index * 0.08,
      aiSkill: 0.86 + index * 0.025,
      aiTargetLane: isPlayer ? 0 : AI_LANES[index % AI_LANES.length],
      aiRecovery: 0,
      aiRecoveryCooldown: 0,
      aiStuckTimer: 0,
      aiLastProgressT: sample.t,
      visualRoll: 0,
      visualPitch: 0,
      wheelSpin: 0,
      driftMessageTimer: 0
    };
  }

  createCarVisual(color, isPlayer) {
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshPhysicalMaterial({ color, roughness: .2, metalness: .55, clearcoat: .9, clearcoatRoughness: .14, envMapIntensity: 1.5 });
    const darkMaterial = new THREE.MeshPhysicalMaterial({ color: 0x061420, roughness: .3, metalness: .6, clearcoat: .5, clearcoatRoughness: .26 });
    const glassMaterial = new THREE.MeshPhysicalMaterial({ color: 0x12333f, roughness: .05, metalness: .2, clearcoat: 1, clearcoatRoughness: .04, transparent: true, opacity: .74, envMapIntensity: 2.1 });
    const trimMaterial = new THREE.MeshPhysicalMaterial({ color: 0x0d2a38, roughness: .42, metalness: .7, clearcoat: .3 });
    const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xfff4c4, emissive: 0xffc85b, emissiveIntensity: 2.4 });
    const tailMaterial = new THREE.MeshStandardMaterial({ color: 0xff4a63, emissive: 0xa81233, emissiveIntensity: 1.9 });
    const bodyProfile = new THREE.Shape();
    [[-2.34,.30],[-2.38,.46],[-2.14,.58],[-1.60,.66],[-.90,.63],[.10,.66],[.78,.60],[1.48,.55],[2.06,.40],[2.36,.30],[2.30,.17],[1.55,.15],[-1.62,.15]]
      .forEach(([x, y], i) => i === 0 ? bodyProfile.moveTo(x, y) : bodyProfile.lineTo(x, y));
    bodyProfile.closePath();
    const bodyGeo = new THREE.ExtrudeGeometry(bodyProfile, { depth: 1.78, bevelEnabled: true, bevelThickness: .05, bevelSize: .04, bevelSegments: 2 });
    bodyGeo.rotateY(-Math.PI / 2);
    bodyGeo.translate(.89, 0, 0);
    const body = new THREE.Mesh(bodyGeo, bodyMaterial);
    body.castShadow = true;
    group.add(body);
    const cabinProfile = new THREE.Shape();
    [[-1.04,.62],[-.66,1.02],[.14,1.09],[.88,.68]]
      .forEach(([x, y], i) => i === 0 ? cabinProfile.moveTo(x, y) : cabinProfile.lineTo(x, y));
    cabinProfile.closePath();
    const cabinGeo = new THREE.ExtrudeGeometry(cabinProfile, { depth: 1.4, bevelEnabled: true, bevelThickness: .05, bevelSize: .04, bevelSegments: 2 });
    cabinGeo.rotateY(-Math.PI / 2);
    cabinGeo.translate(.7, 0, 0);
    const cabin = new THREE.Mesh(cabinGeo, glassMaterial);
    cabin.castShadow = true;
    group.add(cabin);
    const roof = new THREE.Mesh(new RoundedBoxGeometry(1.36, .09, 1.02, 3, .03), darkMaterial);
    roof.position.set(0, 1.1, -.26);
    group.add(roof);
    const roofStripe = new THREE.Mesh(new RoundedBoxGeometry(.3, .04, 1.06, 2, .015), new THREE.MeshStandardMaterial({ color: 0xf6f2e6, roughness: .5 }));
    roofStripe.position.set(0, 1.15, -.26);
    group.add(roofStripe);
    for (const x of [-.86, .86]) {
      const stalk = new THREE.Mesh(new THREE.BoxGeometry(.16, .04, .04), trimMaterial);
      stalk.position.set(x * .92, .95, .58);
      group.add(stalk);
      const mirror = new THREE.Mesh(new RoundedBoxGeometry(.24, .1, .26, 2, .03), darkMaterial);
      mirror.position.set(x, .97, .6);
      mirror.rotation.set(0, x > 0 ? -.22 : .22, x > 0 ? -.16 : .16);
      group.add(mirror);
    }
    const splitter = new THREE.Mesh(new RoundedBoxGeometry(2.02, .1, .38, 2, .03), darkMaterial);
    splitter.position.set(0, .21, 2.42);
    group.add(splitter);
    for (const x of [-1.02, 1.02]) {
      const skirt = new THREE.Mesh(new RoundedBoxGeometry(.12, .13, 3.05, 2, .03), darkMaterial);
      skirt.position.set(x, .25, -.05);
      group.add(skirt);
    }
    for (const x of [-.62, .62]) {
      const post = new THREE.Mesh(new RoundedBoxGeometry(.1, .38, .1, 2, .03), trimMaterial);
      post.position.set(x, .82, -1.98);
      group.add(post);
    }
    const spoiler = new THREE.Mesh(new RoundedBoxGeometry(1.96, .09, .42, 3, .03), darkMaterial);
    spoiler.position.set(0, 1.02, -1.99);
    spoiler.rotation.x = .15;
    spoiler.castShadow = true;
    group.add(spoiler);
    for (const x of [-.94, .94]) {
      const endPlate = new THREE.Mesh(new RoundedBoxGeometry(.06, .2, .44, 2, .02), darkMaterial);
      endPlate.position.set(x, .98, -1.99);
      endPlate.rotation.x = .15;
      group.add(endPlate);
    }
    for (let louvre = 0; louvre < 3; louvre += 1) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(.86, .04, .1), trimMaterial);
      slat.position.set(0, .645 - louvre * .01, -1.44 - louvre * .17);
      slat.rotation.x = -.34;
      group.add(slat);
    }
    for (const x of [-.3, .3]) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(.26, .04, .5), trimMaterial);
      vent.position.set(x, .565, 1.32);
      vent.rotation.x = -.14;
      group.add(vent);
    }
    const diffuser = new THREE.Mesh(new RoundedBoxGeometry(1.9, .14, .3, 2, .03), darkMaterial);
    diffuser.position.set(0, .27, -2.26);
    diffuser.rotation.x = -.16;
    group.add(diffuser);
    for (let finIndex = -2; finIndex <= 2; finIndex += 1) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(.05, .12, .3), trimMaterial);
      fin.position.set(finIndex * .36, .3, -2.26);
      group.add(fin);
    }
    const tireGeometry = new THREE.CylinderGeometry(.36, .36, .36, 22);
    tireGeometry.rotateZ(Math.PI / 2);
    const rimGeometry = new THREE.CylinderGeometry(.2, .2, .38, 16);
    rimGeometry.rotateZ(Math.PI / 2);
    const discGeometry = new THREE.CylinderGeometry(.14, .14, .06, 14);
    discGeometry.rotateZ(Math.PI / 2);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x090f16, roughness: .92, metalness: .04 });
    const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xcfe0e6, roughness: .17, metalness: .98, envMapIntensity: 1.6 });
    const brakeMaterial = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: .42, metalness: .75 });
    const spokeGeometry = new THREE.BoxGeometry(.07, .32, .1);
    const capGeometry = new THREE.CylinderGeometry(.055, .055, .42, 10);
    capGeometry.rotateZ(Math.PI / 2);
    const wheels = [];
    const addWheel = (x, z) => {
      const wheel = new THREE.Mesh(tireGeometry, wheelMaterial);
      wheel.position.set(x, .38, z);
      wheel.castShadow = true;
      wheel.add(new THREE.Mesh(rimGeometry, rimMaterial));
      const disc = new THREE.Mesh(discGeometry, brakeMaterial);
      disc.position.x = x > 0 ? -.05 : .05;
      wheel.add(disc);
      for (let spokeIndex = 0; spokeIndex < 6; spokeIndex += 1) {
        const spoke = new THREE.Mesh(spokeGeometry, rimMaterial);
        spoke.rotation.x = (spokeIndex / 6) * Math.PI * 2;
        wheel.add(spoke);
      }
      wheel.add(new THREE.Mesh(capGeometry, rimMaterial));
      group.add(wheel);
      wheels.push(wheel);
    };
    addWheel(-.93, 1.44);
    addWheel(.93, 1.44);
    addWheel(-1.04, -1.46);
    addWheel(1.04, -1.46);
    for (const x of [-.72, .72]) {
      const canard = new THREE.Mesh(new THREE.BoxGeometry(.34, .04, .26), darkMaterial);
      canard.position.set(x, .36, 2.24);
      canard.rotation.set(-.2, x > 0 ? -.16 : .16, x > 0 ? -.12 : .12);
      group.add(canard);
    }
    for (const x of [-.66, .66]) {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(.54, .17, .18), darkMaterial);
      housing.position.set(x, .47, 2.2);
      housing.rotation.x = -.44;
      group.add(housing);
      const headlight = new THREE.Mesh(new THREE.BoxGeometry(.44, .085, .14), lightMaterial);
      headlight.position.set(x, .49, 2.22);
      headlight.rotation.x = -.44;
      group.add(headlight);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(.36, .1, .1), tailMaterial);
      tail.position.set(x, .53, -2.29);
      group.add(tail);
    }
    const tailStrip = new THREE.Mesh(new RoundedBoxGeometry(1.66, .055, .08, 2, .02), tailMaterial);
    tailStrip.position.set(0, .53, -2.31);
    group.add(tailStrip);
    for (const x of [-.9, .9]) {
      const crease = new THREE.Mesh(new THREE.BoxGeometry(.04, .07, 2.1), trimMaterial);
      crease.position.set(x, .42, .55);
      crease.rotation.x = -.06;
      group.add(crease);
      const scoop = new THREE.Mesh(new RoundedBoxGeometry(.11, .26, .54, 2, .04), darkMaterial);
      scoop.position.set(x * .97, .42, -.86);
      scoop.rotation.y = x > 0 ? -.1 : .1;
      group.add(scoop);
    }
    const grille = new THREE.Mesh(new RoundedBoxGeometry(1.24, .15, .1, 2, .03), darkMaterial);
    grille.position.set(0, .28, 2.37);
    grille.rotation.x = -.2;
    group.add(grille);
    for (const x of [-.74, .74]) {
      const intake = new THREE.Mesh(new RoundedBoxGeometry(.16, .18, .46, 2, .03), darkMaterial);
      intake.position.set(x, .4, 1.86);
      intake.rotation.y = x > 0 ? -.14 : .14;
      group.add(intake);
    }
    const exhaustMaterial = new THREE.MeshBasicMaterial({ color: 0xffad45, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const exhausts = [];
    for (const x of [-.42, .42]) {
      const exhaust = new THREE.Mesh(new THREE.ConeGeometry(.15, .9, 8), exhaustMaterial);
      exhaust.rotation.x = Math.PI / 2;
      exhaust.position.set(x, .42, -2.5);
      group.add(exhaust);
      exhausts.push(exhaust);
    }
    if (isPlayer) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .5, 6), darkMaterial);
      pole.position.set(0, 1.35, -.26);
      group.add(pole);
      const pennantShape = new THREE.Shape();
      pennantShape.moveTo(0, 0);
      pennantShape.lineTo(.4, .09);
      pennantShape.lineTo(0, .21);
      pennantShape.closePath();
      const flag = new THREE.Mesh(new THREE.ShapeGeometry(pennantShape), new THREE.MeshStandardMaterial({ color: 0xffd75e, roughness: .5, metalness: .1, side: THREE.DoubleSide, emissive: 0xff9d1f, emissiveIntensity: .4 }));
      flag.position.set(0, 1.4, -.26);
      group.add(flag);
    }
    group.scale.setScalar(.92);
    group.userData = { wheels, exhausts, exhaustMaterial, body, bodyMaterial, cabin, tailMaterial, lightMaterial };
    return group;
  }

  resetRacer(racer) {
    const index = racer.id;
    const spawnT = wrap01(0.018 + index * 0.018);
    const sample = this.track.sampleAt(spawnT, {});
    const lane = racer.isPlayer ? 0 : (index % 2 ? -2.5 : 2.5);
    racer.position.copy(sample.point).addScaledVector(sample.right, lane);
    racer.position.y += 0.06;
    racer.heading = Math.atan2(sample.tangent.x, sample.tangent.z);
    racer.speed = 0;
    racer.lateralVelocity = 0;
    racer.steer = 0;
    racer.nitro = racer.isPlayer ? 68 : 48 + index * 6;
    racer.driftActive = false;
    racer.driftCharge = 0;
    racer.driftSegments = 0;
    racer.driftReleaseCount = 0;
    racer.driftDirection = 0;
    racer.directionChangeAge = 10;
    racer.directionChanged = false;
    racer.driftSegmentsBeforeRelease = 1;
    racer.boostTimer = 0;
    racer.boostForce = 0;
    racer.boostKind = '';
    racer.nitroActive = false;
    racer.lap = 0;
    racer.nextCheckpoint = 0;
    racer.checkpointCount = 0;
    racer.lastS = sample.t;
    racer.projected = this.track.nearest(racer.position);
    racer.shadow.position.set(racer.position.x, racer.projected.point.y + 0.025, racer.position.z);
    racer.shadow.material.opacity = 0.34;
    racer.lateral = 0;
    racer.progress = sample.t;
    racer.wrongWay = false;
    racer.finished = false;
    racer.finishTime = 0;
    racer.bestLap = 0;
    racer.lastLapStart = 0;
    racer.lapStartedAt = 0;
    racer.airborne = false;
    racer.verticalOffset = 0;
    racer.verticalVelocity = 0;
    racer.jumpArmed = false;
    racer.collisionCooldown = 0;
    racer.collisionFlash = 0;
    racer.emitClock = 0;
    racer.aiCooldown = 0.5 + index * 0.08;
    racer.aiRecovery = 0;
    racer.aiRecoveryCooldown = 0;
    racer.aiStuckTimer = 0;
    racer.aiLastProgressT = sample.t;
    racer.driftMessageTimer = 0;
    racer.visual.position.copy(racer.position);
    racer.visual.rotation.set(0, racer.heading, 0);
    racer.visual.userData.exhaustMaterial.opacity = 0;
  }

  resetRace() {
    if (!this.racers.length) {
      this.racers = RACER_NAMES.map((name, index) => this.createRacer(name, RACER_COLORS[index], index));
    } else {
      this.racers.forEach((racer) => this.resetRacer(racer));
    }
    this.player = this.racers[0];
    this.raceTime = 0;
    this.lapStartedAt = 0;
    this.raceState = 'menu';
    this.resumeState = 'racing';
    this.countdownRemaining = 0;
    this.goTimer = 0;
    this.cooldownRemaining = 0;
    this.boostToastTimer = 0;
    this.accumulator = 0;
    this.playerTrail.length = 0;
    this.lastPlayerRank = 0;
    this.leaderboardFlash = '';
    this.dom.shell.classList.remove('boosting', 'drifting');
    this.dom.hud.classList.add('hud-dim');
    this.dom.startOverlay.hidden = false;
    this.dom.pauseOverlay.hidden = true;
    this.dom.resultsOverlay.hidden = true;
    this.dom.countdownOverlay.hidden = true;
    this.dom.raceState.textContent = 'COUNTDOWN';
    this.updateHud();
    this.updateCamera(0.016, true);
  }

  startRace() {
    this.audio.ensure();
    this.dom.audioStatus.textContent = this.audio.context ? '合成音效已开启' : '浏览器未提供音频';
    this.racers.forEach((racer) => this.resetRacer(racer));
    this.raceTime = 0;
    this.lapStartedAt = 0;
    this.boostToastTimer = 0;
    this.goTimer = 0;
    this.cooldownRemaining = 0;
    this.countdownRemaining = 3.25;
    this.lastCountdownNumber = 4;
    this.playerTrail.length = 0;
    this.lastPlayerRank = 0;
    this.leaderboardFlash = '';
    this.dom.shell.classList.remove('boosting', 'drifting');
    this.dom.hud.classList.remove('hud-dim');
    this.raceState = 'countdown';
    this.dom.startOverlay.hidden = true;
    this.dom.pauseOverlay.hidden = true;
    this.dom.resultsOverlay.hidden = true;
    this.dom.countdownOverlay.hidden = false;
    this.dom.countdownValue.textContent = '3';
    this.dom.countdownCaption.textContent = '准备发车';
    this.dom.raceState.textContent = 'COUNTDOWN';
    this.dom.audioStatus.textContent = this.audio.context ? '合成音效已开启' : '浏览器未提供音频';
  }

  handleBlur() {
    this.keys.clear();
    if (this.raceState === 'racing' || this.raceState === 'countdown' || this.raceState === 'cooldown') this.pauseGame(true);
  }

  pauseGame(fromBlur = false) {
    if (this.raceState === 'paused' || this.raceState === 'menu' || this.raceState === 'finished') return;
    this.resumeState = this.raceState;
    this.raceState = 'paused';
    this.pausedByBlur = fromBlur;
    this.dom.pauseOverlay.hidden = false;
    this.dom.pauseOverlay.querySelector('h2').textContent = fromBlur ? '比赛已暂停' : '比赛已暂停';
  }

  togglePause(force) {
    if (force === false && this.raceState === 'paused') {
      this.raceState = this.resumeState;
      this.dom.pauseOverlay.hidden = true;
      this.keys.clear();
      this.pausedByBlur = false;
      return;
    }
    if (this.raceState === 'paused') this.togglePause(false);
    else this.pauseGame(false);
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    this.dom.muteButton.classList.toggle('muted', this.audio.muted);
    this.dom.muteLabel.textContent = this.audio.muted ? '已静音' : '声音';
  }

  projectRacer(racer) {
    racer.projected = this.track.nearest(racer.position);
    racer.lateral = racer.projected.lateral;
    return racer.projected;
  }

  getForward(racer, target = vec3()) {
    return target.set(Math.sin(racer.heading), 0, Math.cos(racer.heading));
  }

  getRight(racer, target = vec3()) {
    return target.set(Math.cos(racer.heading), 0, -Math.sin(racer.heading));
  }

  recoverRacer(racer) {
    const currentT = racer.projected?.t ?? racer.lastS ?? 0;
    const sample = this.track.sampleAt(currentT, {});
    const lane = clamp(racer.aiTargetLane ?? 0, -ROAD_HALF_WIDTH + 2.2, ROAD_HALF_WIDTH - 2.2);
    racer.position.copy(sample.point).addScaledVector(sample.right, lane);
    racer.position.y = sample.point.y + 0.06;
    racer.heading = Math.atan2(sample.tangent.x, sample.tangent.z);
    racer.speed = clamp(Math.abs(racer.speed) * 0.42, 9, 17);
    racer.lateralVelocity = 0;
    racer.steer = 0;
    racer.driftActive = false;
    racer.driftCharge = 0;
    racer.lastS = sample.t;
    racer.projected = this.track.nearest(racer.position);
    racer.lateral = racer.projected.lateral;
    racer.progress = racer.lap + racer.projected.t;
    racer.aiRecovery = 0.9;
    racer.aiRecoveryCooldown = 4.0;
    racer.aiStuckTimer = 0;
    racer.aiLastProgressT = sample.t;
  }

  getAIControl(racer) {
    const projected = racer.projected || this.projectRacer(racer);
    const speed = Math.abs(racer.speed);
    const skill = clamp(racer.aiSkill ?? 0.9, 0.72, 1);
    racer.aiRecoveryCooldown = Math.max(0, racer.aiRecoveryCooldown - FIXED_DT);

    let progressDelta = projected.t - (racer.aiLastProgressT ?? projected.t);
    if (progressDelta > 0.5) progressDelta -= 1;
    if (progressDelta < -0.5) progressDelta += 1;
    if (Math.abs(progressDelta) < 0.0025) racer.aiStuckTimer += FIXED_DT;
    else { racer.aiStuckTimer = 0; racer.aiLastProgressT = projected.t; }

    const nearWall = Math.abs(projected.lateral) > ROAD_HALF_WIDTH - 2.15;
    const shouldRecover = racer.aiRecoveryCooldown <= 0 && (
      (nearWall && speed < 15) ||
      (racer.aiStuckTimer > 1.45 && speed < 11) ||
      (racer.wrongWay && speed < 9)
    );
    if (shouldRecover) this.recoverRacer(racer);
    if (racer.aiRecovery > 0) {
      racer.aiRecovery = Math.max(0, racer.aiRecovery - FIXED_DT);
      return { throttle: 0.72, brake: false, steer: 0, drift: false, nitro: false };
    }

    const lookAhead = clamp(0.036 + speed * 0.00155, 0.042, 0.105);
    const targetSample = this.track.sampleAt(projected.t + lookAhead, {});
    let targetLane = racer.aiTargetLane ?? 0;
    for (const other of this.racers) {
      if (other === racer || other.finished) continue;
      let gap = (other.projected?.t ?? 0) - projected.t;
      if (gap > 0.5) gap -= 1;
      if (gap < -0.5) gap += 1;
      const distance = gap * this.track.length;
      if (distance > 1.5 && distance < 19) {
        targetLane += other.lateral > targetLane ? -1.15 : 1.15;
      }
    }
    targetLane = clamp(targetLane, -ROAD_HALF_WIDTH + 2.1, ROAD_HALF_WIDTH - 2.1);
    const desired = targetSample.point.clone().addScaledVector(targetSample.right, targetLane);
    const desiredHeading = Math.atan2(desired.x - racer.position.x, desired.z - racer.position.z);
    const trackHeading = Math.atan2(targetSample.tangent.x, targetSample.tangent.z);
    const currentTrackHeading = Math.atan2(projected.tangent.x, projected.tangent.z);
    const angle = angleDelta(racer.heading, desiredHeading);
    const lateralError = targetLane - projected.lateral;
    const curvature = Math.abs(angleDelta(currentTrackHeading, trackHeading));
    let steer = clamp(angle * (2.15 + skill * 0.7) + lateralError * 0.2, -1, 1);
    if (nearWall) steer = clamp(steer - projected.lateral * 0.12, -1, 1);

    const targetSpeed = clamp(68 - curvature * 18 - Math.abs(lateralError) * 0.9 - (nearWall ? 10 : 0), 24, 64);
    const throttle = speed < targetSpeed ? 1 : 0;
    const brake = speed > targetSpeed + 4.5;
    racer.aiCooldown -= FIXED_DT;
    const shouldDrift = racer.aiCooldown <= 0 && speed > 28 && curvature > 0.22 && curvature < 0.48 && Math.abs(lateralError) < 1.7 && !nearWall;
    if (shouldDrift) racer.aiCooldown = 2.1 + racer.id * 0.08;
    const nitro = racer.nitro > 44 && speed > 27 && Math.abs(angle) < 0.13 && Math.abs(lateralError) < 1.1 && curvature < 0.16 && !nearWall;
    return { throttle, brake, steer, drift: shouldDrift, nitro };
  }

  beginDrift(racer, steering = racer.steer) {
    racer.driftActive = true;
    racer.driftCharge = 0;
    racer.driftSegments = 1;
    racer.driftDirection = Math.sign(steering || 0);
    racer.directionChangeAge = 10;
    racer.directionChanged = false;
    racer.driftSegmentsBeforeRelease = 1;
    racer.driftMessageTimer = .3;
  }

  releaseDrift(racer) {
    if (!racer.driftActive) return;
    const charge = racer.driftCharge;
    const directionAge = racer.directionChangeAge;
    const segments = racer.driftSegmentsBeforeRelease;
    const directionChanged = racer.directionChanged;
    racer.driftActive = false;
    racer.driftCharge = 0;
    racer.driftSegments = 0;
    racer.directionChangeAge = 10;
    racer.directionChanged = false;
    racer.lateralVelocity *= .38;
    if (charge < .16) return;
    let kind = 'normal';
    if (racer.driftReleaseCount > 0 && charge > .66) kind = 'double';
    if (racer.driftReleaseCount > 0 && segments > 1 && directionChanged && charge > .48) kind = 'break';
    if (directionAge < 1.25 && charge > .5 && racer.driftReleaseCount > 0) kind = 'break';
    racer.driftReleaseCount += 1;
    const boostTable = {
      normal: { force: 17, time: .68, nitro: 12 },
      double: { force: 23, time: 1.02, nitro: 19 },
      break: { force: 29, time: 1.28, nitro: 27 }
    };
    const boost = boostTable[kind];
    racer.boostTimer = boost.time;
    racer.boostForce = boost.force;
    racer.boostKind = kind;
    racer.nitro = clamp(racer.nitro + boost.nitro, 0, 100);
    racer.driftMessageTimer = 1.05;
    this.showBoost(racer, kind);
    this.audio.boost(kind);
  }

  applyNitro(racer) {
    if (racer.nitro < 18) return;
    racer.nitro -= 18;
    racer.boostTimer = Math.max(racer.boostTimer, 1.22);
    racer.boostForce = Math.max(racer.boostForce, 25);
    racer.boostKind = 'nitro';
    racer.driftMessageTimer = .7;
    this.showBoost(racer, 'nitro');
    this.audio.boost('double');
  }

  showBoost(racer, kind) {
    if (!racer.isPlayer) return;
    const labels = { normal: ['普通喷', 'BOOST READY'], double: ['双喷', 'DOUBLE RELEASE'], break: ['断位喷', 'DIRECTION BREAK'], nitro: ['氮气', 'NITRO BURST'] };
    const [title, subtitle] = labels[kind] || labels.normal;
    this.dom.boostText.textContent = title;
    this.dom.boostSubText.textContent = subtitle;
    this.dom.boostMessage.className = `boost-message show ${kind === 'double' ? 'double' : kind === 'break' ? 'break' : ''}`;
    this.boostToastTimer = 1.15;
  }

  updateRacerPhysics(racer, control, dt, time) {
    if (racer.finished) {
      racer.speed = damp(racer.speed, 0, 2.5, dt);
      racer.lateralVelocity = damp(racer.lateralVelocity, 0, 4, dt);
    } else {
      const speedBefore = racer.speed;
      const throttle = control.throttle && !racer.finished;
      const brake = control.brake && !racer.finished;
      if (brake) {
        if (racer.speed > .55) racer.speed -= 48 * dt;
        else racer.speed -= 21 * dt;
      } else if (throttle) {
        racer.speed += (racer.speed < -.5 ? 42 : 30) * dt;
      } else {
        racer.speed -= (racer.speed > 0 ? 5.2 : 2.4) * dt;
      }
      if (!throttle && !brake) racer.speed *= Math.exp(-.58 * dt);
      if (racer.speed < -18) racer.speed = -18;
      if (racer.boostTimer > 0) {
        racer.boostTimer -= dt;
        racer.speed += racer.boostForce * dt;
      } else {
        racer.boostKind = racer.boostKind === 'nitro' ? '' : racer.boostKind;
      }
      if (control.nitro && racer.nitro > 0) {
        racer.nitro = clamp(racer.nitro - 28 * dt, 0, 100);
        racer.nitroActive = true;
        racer.boostTimer = Math.max(racer.boostTimer, .2);
        racer.boostForce = Math.max(racer.boostForce, 18);
        racer.boostKind = 'nitro';
        if (racer.isPlayer && Math.random() < dt * 4) this.audio.tone(260, .06, 'triangle', .035, 90);
      } else {
        racer.nitroActive = false;
      }
      if (!control.drift && racer.driftActive) this.releaseDrift(racer);
      if (control.drift && !racer.driftActive && racer.speed > 13) this.beginDrift(racer, control.steer);
      if (racer.driftActive) {
        racer.driftCharge = clamp(racer.driftCharge + dt * (.18 + Math.abs(racer.steer) * .19 + Math.abs(racer.speed) * .0012), 0, 1);
        racer.driftSegmentsBeforeRelease = racer.driftSegments;
        racer.directionChangeAge += dt;
        const currentDirection = Math.sign(control.steer);
        if (currentDirection && racer.driftDirection && currentDirection !== racer.driftDirection) {
          racer.driftSegments += 1;
          racer.driftDirection = currentDirection;
          racer.directionChangeAge = 0;
          racer.directionChanged = true;
        }
      }
      const steering = clamp(control.steer, -1, 1);
      racer.steer = damp(racer.steer, steering, racer.driftActive ? 8 : 12, dt);
      const speedFactor = clamp(Math.abs(racer.speed) / (12 + Math.abs(racer.speed) * .22), 0, 1);
      const turnRate = (racer.driftActive ? .84 : .68) * speedFactor;
      racer.heading += racer.steer * turnRate * dt * (racer.speed < 0 ? -1 : 1);
      const driftTarget = racer.driftActive ? -racer.steer * (6.5 + Math.abs(racer.speed) * .16) : -racer.steer * 1.3;
      racer.lateralVelocity = damp(racer.lateralVelocity, driftTarget, racer.driftActive ? 6.5 : 9, dt);
      const forward = this.getForward(racer);
      const right = this.getRight(racer);
      racer.position.x += (forward.x * racer.speed + right.x * racer.lateralVelocity) * dt;
      racer.position.z += (forward.z * racer.speed + right.z * racer.lateralVelocity) * dt;
      if (racer.speed > 64) racer.speed = 64;
      if (racer.speed < -18) racer.speed = -18;
      const projected = this.projectRacer(racer);
      const roadLimit = ROAD_HALF_WIDTH - 1.15;
      if (Math.abs(racer.lateral) > roadLimit) {
        const excess = Math.abs(racer.lateral) - roadLimit;
        racer.position.addScaledVector(projected.right, -Math.sign(racer.lateral) * excess);
        racer.speed *= Math.exp(-(5.2 + excess * .9) * dt);
        if (!racer.isPlayer) {
          const safeLane = clamp(racer.aiTargetLane ?? 0, -ROAD_HALF_WIDTH + 3, ROAD_HALF_WIDTH - 3);
          const lateralCorrection = clamp((safeLane - racer.lateral) * 0.32, -2.4, 2.4);
          racer.position.addScaledVector(projected.right, lateralCorrection);
          const trackHeading = Math.atan2(projected.tangent.x, projected.tangent.z);
          racer.heading += angleDelta(racer.heading, trackHeading) * Math.min(1, dt * 9);
          racer.lateralVelocity *= Math.exp(-8 * dt);
          if (Math.abs(racer.lateral) > ROAD_HALF_WIDTH - 1.4 && racer.speed < 15) racer.speed = 15;
        }
        if (excess > .08 && racer.collisionCooldown <= 0) {
          racer.collisionCooldown = .36;
          racer.collisionFlash = 1;
          const impact = clamp(.6 + excess * .2, .6, 1.45);
          const contact = racer.position.clone();
          contact.y = projected.point.y + .62;
          this.spawnImpact(contact, impact);
          for (let spark = 0; spark < 5; spark += 1) {
            const velocity = vec3((Math.random() - .5) * 5, 1.2 + Math.random() * 3, (Math.random() - .5) * 5);
            this.particles.sparks.spawn(contact, velocity, .18 + Math.random() * .18, .28 + Math.random() * .3);
          }
          if (racer.isPlayer) {
            this.impactFlash = Math.max(this.impactFlash, .2);
            this.audio.collision();
            this.shakeTimer = Math.max(this.shakeTimer, .2);
          }
        }
      }
      racer.collisionCooldown = Math.max(0, racer.collisionCooldown - dt);
      this.updateJump(racer, projected, dt, time);
      this.emitRacerParticles(racer, projected, dt);
      if (Math.abs(racer.speed - speedBefore) > .5 && racer.boostTimer > 0 && racer.isPlayer && Math.random() < dt * 8) this.audio.tone(390, .04, 'triangle', .025, 100);
    }
    this.updateCarVisual(racer, dt, time);
  }

  updateJump(racer, projected, dt) {
    const t = projected.t;
    const rampCenter = .61;
    const nearRamp = t > .565 && t < .665;
    const descending = t > .64 && t < .79;
    if (nearRamp && Math.abs(racer.speed) > 24 && !racer.airborne && !racer.jumpArmed) {
      racer.airborne = true;
      racer.jumpArmed = true;
      racer.verticalVelocity = 5.2 + Math.abs(racer.speed) * .045;
      racer.verticalOffset = .05;
    }
    if (racer.airborne) {
      racer.verticalVelocity -= 15.5 * dt;
      racer.verticalOffset += racer.verticalVelocity * dt;
      if (racer.verticalOffset <= 0) {
        racer.verticalOffset = 0;
        racer.airborne = false;
        racer.verticalVelocity = 0;
        if (racer.isPlayer) { this.shakeTimer = Math.max(this.shakeTimer, .24); this.audio.tone(85, .12, 'sine', .08, -25); }
      }
    } else {
      if (!nearRamp && t < .7) racer.jumpArmed = false;
      racer.verticalOffset = damp(racer.verticalOffset, 0, 8, dt);
    }
    const groundY = projected.point.y + .06 + racer.verticalOffset;
    racer.position.y = groundY;
  }

  updateCarVisual(racer, dt) {
    const visual = racer.visual;
    visual.position.copy(racer.position);
    visual.rotation.order = 'YXZ';
    visual.rotation.y = racer.heading;
    if (racer.shadow) {
      const groundHeight = (racer.projected?.point?.y ?? racer.position.y) + 0.025;
      racer.shadow.position.set(racer.position.x, groundHeight, racer.position.z);
      const shadowFade = clamp(1 - racer.verticalOffset * 0.18, 0.2, 1);
      racer.shadow.material.opacity = 0.34 * shadowFade;
      const shadowScale = clamp(1 - racer.verticalOffset * 0.06, 0.72, 1);
      racer.shadow.scale.set(1.55 * shadowScale, 2.65 * shadowScale, 1);
    }
    racer.visualRoll = damp(racer.visualRoll, clamp(-racer.lateralVelocity * .012, -.18, .18), 8, dt);
    racer.visualPitch = damp(racer.visualPitch, racer.airborne ? clamp(-racer.verticalVelocity * .012, -.12, .12) : 0, 7, dt);
    visual.rotation.z = racer.visualRoll;
    visual.rotation.x = racer.visualPitch;
    racer.wheelSpin += racer.speed * dt / .49;
    for (const wheel of visual.userData.wheels) wheel.rotation.x = racer.wheelSpin;
    racer.collisionFlash = Math.max(0, racer.collisionFlash - dt * 3.8);
    const collisionFlash = clamp(racer.collisionFlash, 0, 1);
    racer.visual.userData.bodyMaterial.emissive.setRGB(collisionFlash * .9, collisionFlash * .16, collisionFlash * .04);
    racer.visual.userData.bodyMaterial.emissiveIntensity = collisionFlash * 2.4;
    const boostAmount = racer.boostTimer > 0 ? clamp(racer.boostTimer, 0, 1) : 0;
    visual.userData.exhaustMaterial.opacity = boostAmount * .75;
    visual.userData.exhausts.forEach((exhaust, index) => {
      exhaust.scale.y = .45 + boostAmount * (.7 + Math.sin(this.elapsed * 28 + index) * .18);
      exhaust.position.z = -2.5 - boostAmount * .3;
    });
  }

  emitRacerParticles(racer, projected, dt) {
    racer.emitClock -= dt;
    if (racer.emitClock > 0) return;
    const speed = Math.abs(racer.speed);
    if (racer.driftActive && speed > 13) {
      racer.emitClock = .035;
      const forward = this.getForward(racer);
      const right = this.getRight(racer);
      for (const side of [-1, 1]) {
        const wheel = racer.position.clone().addScaledVector(forward, -1.28).addScaledVector(right, side * 1.05);
        wheel.y += .15;
        const velocity = forward.clone().multiplyScalar(-speed * .11).addScaledVector(right, side * (1.2 + Math.random() * 1.4));
        velocity.y = 1.2 + Math.random() * 1.4;
        this.particles.smoke.spawn(wheel, velocity, .45 + Math.random() * .28, .75 + Math.random() * .5);
        if (racer.driftCharge > .28 && Math.random() < .55) {
          const sparkVelocity = forward.clone().multiplyScalar(-speed * .25).addScaledVector(right, side * (2.5 + Math.random() * 3));
          sparkVelocity.y = .5 + Math.random() * 2;
          this.particles.sparks.spawn(wheel, sparkVelocity, .2 + Math.random() * .22, .4 + Math.random() * .5);
        }
      }
    } else if (racer.boostTimer > 0) {
      racer.emitClock = .05;
      const forward = this.getForward(racer);
      const tail = racer.position.clone().addScaledVector(forward, -2.1);
      tail.y += .6;
      const velocity = forward.clone().multiplyScalar(-8 - Math.random() * 8);
      velocity.y = .5 + Math.random();
      this.particles.sparks.spawn(tail, velocity, .18 + Math.random() * .16, .45);
    }
  }

  resolveVehicleCollisions() {
    for (let i = 0; i < this.racers.length; i += 1) {
      for (let j = i + 1; j < this.racers.length; j += 1) {
        const a = this.racers[i];
        const b = this.racers[j];
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const distance = Math.hypot(dx, dz);
        const minimum = 2.8;
        if (distance >= minimum || distance <= .001) continue;
        const nx = dx / distance;
        const nz = dz / distance;
        const push = (minimum - distance) * .5;
        a.position.x -= nx * push;
        a.position.z -= nz * push;
        b.position.x += nx * push;
        b.position.z += nz * push;
        const impactSpeed = clamp(Math.abs(a.speed - b.speed) / 42 + .55, .55, 1.6);
        a.speed *= .94;
        b.speed *= .94;
        const canImpact = a.collisionCooldown <= 0 && b.collisionCooldown <= 0;
        if (!canImpact) continue;
        const contact = a.position.clone().lerp(b.position, .5);
        contact.y = Math.max(a.position.y, b.position.y) + .62;
        this.spawnImpact(contact, impactSpeed);
        for (let spark = 0; spark < 8; spark += 1) {
          const velocity = vec3((Math.random() - .5) * 7, 1.4 + Math.random() * 4.2, (Math.random() - .5) * 7);
          this.particles.sparks.spawn(contact, velocity, .2 + Math.random() * .24, .34 + Math.random() * .42);
        }
        a.collisionFlash = 1;
        b.collisionFlash = 1;
        a.collisionCooldown = .36;
        b.collisionCooldown = .36;
        if (a.isPlayer || b.isPlayer) {
          this.impactFlash = .28 + impactSpeed * .08;
          this.shakeTimer = Math.max(this.shakeTimer, .18 + impactSpeed * .08);
          this.audio.collision();
        } else {
          this.shakeTimer = Math.max(this.shakeTimer, .045);
        }
      }
    }
  }

  updateProgress(racer) {
    const projected = this.projectRacer(racer);
    const current = projected.t;
    const previousS = racer.lastS;
    let delta = current - previousS;
    if (delta > .5) delta -= 1;
    if (delta < -.5) delta += 1;
    const forwardMotion = delta >= -0.018;
    racer.wrongWay = delta < -.035;
    racer.lastS = current;
    racer.progress = racer.lap + current;
    if (racer.finished) return;
    if (racer.nextCheckpoint < CHECKPOINT_FRACTIONS.length) {
      const checkpoint = CHECKPOINT_FRACTIONS[racer.nextCheckpoint];
      if (forwardMotion && Math.abs(current - checkpoint) < .032 && projected.distance < ROAD_HALF_WIDTH + 6) {
        racer.nextCheckpoint += 1;
        racer.checkpointCount += 1;
        racer.nitro = clamp(racer.nitro + 2.5, 0, 100);
        if (racer.isPlayer) {
          this.audio.tone(420 + racer.nextCheckpoint * 40, .08, 'sine', .045, 60);
          this.dom.checkpointFill.style.width = `${racer.nextCheckpoint / CHECKPOINT_FRACTIONS.length * 100}%`;
        }
      }
    } else if (forwardMotion && previousS > .86 && current < .14) {
      const lapTime = this.raceTime - racer.lastLapStart;
      racer.lastLapStart = this.raceTime;
      racer.lap += 1;
      racer.nextCheckpoint = 0;
      racer.checkpointCount = 0;
      if (lapTime > 0 && (!racer.bestLap || lapTime < racer.bestLap)) racer.bestLap = lapTime;
      if (racer.lap >= TOTAL_LAPS) {
        racer.finished = true;
        racer.finishTime = this.raceTime;
        if (racer.isPlayer) this.finishPlayer();
      } else if (racer.isPlayer) {
        this.audio.beep(740, .18, 'square');
      }
    }
  }

  finishPlayer() {
    if (this.raceState === 'cooldown' || this.raceState === 'finished') return;
    this.raceState = 'cooldown';
    this.cooldownRemaining = 2.2;
    this.dom.raceState.textContent = 'FINISH';
    this.audio.beep(880, .18, 'square');
    this.audio.tone(1180, .28, 'sine', .1, 140);
  }

  updateRaceState(dt) {
    if (this.raceState === 'countdown') {
      this.countdownRemaining -= dt;
      const number = Math.ceil(this.countdownRemaining);
      if (number !== this.lastCountdownNumber && number > 0) {
        this.lastCountdownNumber = number;
        this.dom.countdownValue.textContent = String(number);
        this.dom.countdownCaption.textContent = number === 1 ? '最后准备' : '准备发车';
        this.audio.beep(number === 1 ? 660 : 440, .12, 'square');
      }
      if (this.countdownRemaining <= 0) {
        this.raceState = 'racing';
        this.goTimer = .72;
        this.dom.countdownValue.textContent = 'GO!';
        this.dom.countdownCaption.textContent = '追着海风，冲！';
        this.dom.raceState.textContent = 'RACE LIVE';
        this.audio.beep(880, .22, 'square');
      }
    } else if (this.raceState === 'racing' || this.raceState === 'cooldown') {
      this.raceTime += dt;
      if (this.raceState === 'cooldown') {
        this.cooldownRemaining -= dt;
        if (this.cooldownRemaining <= 0) this.showResults();
      }
    }
    if (this.goTimer > 0) {
      this.goTimer -= dt;
      if (this.goTimer <= 0) this.dom.countdownOverlay.hidden = true;
    }
  }

  fixedUpdate(dt) {
    this.elapsed += dt;
    if (this.raceState === 'paused' || this.raceState === 'menu' || this.raceState === 'finished') {
      this.updateWorld(dt);
      this.particles.smoke.update(dt);
      this.particles.sparks.update(dt);
      return;
    }
    this.updateRaceState(dt);
    const playerControl = this.getPlayerControl();
    if (this.raceState === 'racing' || this.raceState === 'cooldown') {
      for (const racer of this.racers) {
        if (racer.isPlayer && this.raceState === 'cooldown') continue;
        const control = racer.isPlayer ? playerControl : this.getAIControl(racer);
        this.updateRacerPhysics(racer, control, dt, this.elapsed);
        this.updateProgress(racer);
      }
      this.resolveVehicleCollisions();
    } else {
      this.racers.forEach((racer) => this.updateCarVisual(racer, dt, this.elapsed));
    }
    this.particles.smoke.update(dt);
    this.particles.sparks.update(dt);
    this.updateWorld(dt);
  }

  updateWorld(dt) {
    if (this.sea) {
      this.sea.material.color.setHSL(.528, .68, .33 + Math.sin(this.elapsed * .18) * .012);
      this.seaWaves.forEach((wave, index) => {
        wave.position.x = Math.sin(this.elapsed * .13 + index) * 2.8;
        wave.position.z = Math.cos(this.elapsed * .09 + index) * 1.3;
      });
    }
    this.clouds.forEach((cloud, index) => {
      cloud.position.x += dt * (0.35 + (index % 3) * .08);
      if (cloud.position.x > 510) cloud.position.x = -510;
    });
    if (this.lighthouseBeam) this.lighthouseBeam.rotation.y = this.elapsed * .6;
    this.swayFlags.forEach((flag) => {
      const sway = Math.sin(this.elapsed * 1.9 + flag.phase);
      flag.pivot.rotation.y = flag.base + sway * .34;
      flag.pivot.rotation.z = sway * .07;
      flag.cloth.scale.x = 1 + sway * .12;
    });
    this.gulls.forEach((gull) => {
      const angle = this.elapsed * gull.speed + gull.phase;
      gull.mesh.position.set(
        gull.center.x + Math.cos(angle) * gull.radius,
        gull.height + Math.sin(angle * 2.4) * 2.2,
        gull.center.z + Math.sin(angle) * gull.radius
      );
      gull.mesh.rotation.y = -angle + Math.PI / 2;
      gull.mesh.rotation.z = Math.sin(this.elapsed * 5.4 + gull.phase) * .5;
    });
    this.boats.forEach((boat) => {
      boat.group.position.y = -1.15 + Math.sin(this.elapsed * .7 + boat.phase) * .22;
      boat.group.rotation.z = Math.sin(this.elapsed * .55 + boat.phase) * .045;
      boat.group.rotation.x = Math.cos(this.elapsed * .48 + boat.phase) * .03;
    });
    this.cranes.forEach((crane) => {
      crane.boom.rotation.y = Math.sin(this.elapsed * .28 + crane.phase) * .5;
    });
    if (this.startGantryLights) {
      this.startGantryLights.forEach((bulb, index) => {
        bulb.material.emissiveIntensity = 1.4 + Math.sin(this.elapsed * 2.4 - index * .6) * .9;
      });
    }
    if (this.lampHeadMaterial) {
      this.lampHeadMaterial.emissiveIntensity = 1.9 + Math.sin(this.elapsed * 1.3) * .4;
    }
    this.tunnelLights.forEach((material, index) => { material.emissiveIntensity = 1.7 + Math.sin(this.elapsed * 3 + index) * .55; });
    this.updateImpactEffects(dt);
  }

  updateCamera(dt, immediate = false) {
    if (!this.player) return;
    const forward = this.getForward(this.player);
    const right = this.getRight(this.player);
    const speed = Math.abs(this.player.speed);
    const driftOffset = clamp(this.player.lateralVelocity * -.045, -2.2, 2.2);
    let desired;
    let look;
    if (this.cameraMode === 0) {
      desired = this.player.position.clone().addScaledVector(forward, -(10.5 + speed * .07)).addScaledVector(right, driftOffset);
      desired.y += 4.2 + speed * .018;
      look = this.player.position.clone().addScaledVector(forward, 8.5).addScaledVector(right, driftOffset * .3);
      look.y += 1.2;
    } else if (this.cameraMode === 1) {
      desired = this.player.position.clone().addScaledVector(forward, 1.2).addScaledVector(right, driftOffset * .35);
      desired.y += 1.9;
      look = this.player.position.clone().addScaledVector(forward, 17);
      look.y += 1.15;
    } else {
      desired = this.player.position.clone().addScaledVector(forward, -6.8).addScaledVector(right, 7.2 + driftOffset);
      desired.y += 2.8;
      look = this.player.position.clone().addScaledVector(forward, 3.2);
      look.y += 1.1;
    }
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      desired.x += (Math.random() - .5) * .35;
      desired.y += (Math.random() - .5) * .25;
      desired.z += (Math.random() - .5) * .35;
    }
    if (immediate) this.camera.position.copy(desired);
    else this.camera.position.lerp(desired, 1 - Math.exp(-5.5 * dt));
    this.camera.lookAt(look);
    const targetFov = 55 + speed * .31 + (this.player.boostTimer > 0 ? 10 : 0) + (this.player.driftActive ? 2.5 : 0);
    this.camera.fov = immediate ? targetFov : damp(this.camera.fov, targetFov, 4, dt);
    this.camera.updateProjectionMatrix();
  }

  getRankedRacers() {
    return [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
  }

  updateLeaderboard() {
    const ranked = this.getRankedRacers();
    const playerIndex = ranked.findIndex((racer) => racer.isPlayer);
    if (this.lastPlayerRank > 0 && this.raceState === 'racing' && playerIndex + 1 !== this.lastPlayerRank) {
      this.leaderboardFlash = (playerIndex + 1 < this.lastPlayerRank ? 'rank-up' : 'rank-down');
    }
    this.lastPlayerRank = playerIndex + 1;
    this.dom.leaderboard.innerHTML = ranked.map((racer, index) => `<li class="${racer.isPlayer ? `player-row ${this.leaderboardFlash}` : ''}"><span class="rank-no">${index + 1}</span><i class="color-dot" style="background:${colorToCss(racer.color)}"></i><span class="driver-name">${racer.name}</span><span class="driver-time">${racer.finished ? formatTime(racer.finishTime) : `L${Math.min(TOTAL_LAPS, racer.lap + 1)}`}</span></li>`).join('');
    this.leaderboardFlash = '';
  }

  updateMinimap() {
    const canvas = this.dom.minimap;
    const context = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = 'rgba(5, 54, 75, .56)';
    context.fillRect(0, 0, width, height);
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    for (const sample of this.track.samples) { minX = Math.min(minX, sample.point.x); maxX = Math.max(maxX, sample.point.x); minZ = Math.min(minZ, sample.point.z); maxZ = Math.max(maxZ, sample.point.z); }
    const padding = 18;
    const scale = Math.min((width - padding * 2) / (maxX - minX), (height - padding * 2) / (maxZ - minZ));
    const offsetX = (width - (maxX - minX) * scale) / 2;
    const offsetY = (height - (maxZ - minZ) * scale) / 2;
    const map = (point) => ({ x: offsetX + (point.x - minX) * scale, y: height - offsetY - (point.z - minZ) * scale });
    context.beginPath();
    for (let i = 0; i <= this.track.count; i += 1) {
      const p = map(this.track.sampleAt(i / this.track.count, {}).point);
      if (i === 0) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y);
    }
    context.closePath();
    context.strokeStyle = 'rgba(120, 237, 239, .25)';
    context.lineWidth = 9;
    context.lineJoin = 'round';
    context.stroke();
    context.strokeStyle = '#62dce4';
    context.lineWidth = 2;
    context.stroke();
    if (this.playerTrail.length > 1) {
      context.lineCap = 'round';
      context.lineJoin = 'round';
      for (let i = 1; i < this.playerTrail.length; i += 1) {
        const age = i / this.playerTrail.length;
        const from = map(this.playerTrail[i - 1]);
        const to = map(this.playerTrail[i]);
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.strokeStyle = `rgba(255, 177, 75, ${(age * age * .72).toFixed(3)})`;
        context.lineWidth = 1 + age * 2.6;
        context.stroke();
      }
      context.lineCap = 'butt';
    }
    CHECKPOINT_FRACTIONS.forEach((fraction) => {
      const p = map(this.track.sampleAt(fraction, {}).point);
      context.beginPath(); context.arc(p.x, p.y, 3.5, 0, TAU); context.fillStyle = '#ffe27a'; context.fill();
    });
    const ranked = this.getRankedRacers();
    ranked.forEach((racer) => {
      const p = map(racer.position);
      context.beginPath();
      context.arc(p.x, p.y, racer.isPlayer ? 4.8 : 3.2, 0, TAU);
      context.fillStyle = racer.isPlayer ? '#ffb14b' : colorToCss(racer.color);
      context.shadowColor = racer.isPlayer ? '#ff7048' : 'transparent';
      context.shadowBlur = racer.isPlayer ? 8 : 0;
      context.fill();
      context.shadowBlur = 0;
    });
    if (this.player) {
      const head = this.playerTrail[this.playerTrail.length - 1];
      if (!head || Math.hypot(head.x - this.player.position.x, head.z - this.player.position.z) > 1.6) {
        this.playerTrail.push({ x: this.player.position.x, z: this.player.position.z });
        if (this.playerTrail.length > 70) this.playerTrail.shift();
      }
    }
  }

  showResults() {
    this.raceState = 'finished';
    this.dom.countdownOverlay.hidden = true;
    this.dom.resultsOverlay.hidden = false;
    const ranked = this.getRankedRacers();
    const playerRank = ranked.findIndex((racer) => racer.isPlayer) + 1;
    this.dom.resultPosition.textContent = `P${playerRank}`;
    this.dom.resultTitle.textContent = playerRank === 1 ? '海岸线之王！' : playerRank <= 3 ? '冲线！ podium' : '冲线！';
    this.dom.resultSummary.textContent = playerRank === 1 ? '你把海风甩在了所有对手身后。' : '漂亮的漂移节奏，再来一场把差距抹掉。';
    this.dom.resultTotal.textContent = formatTime(this.player.finishTime);
    this.dom.resultBest.textContent = this.player.bestLap ? formatTime(this.player.bestLap) : '--:--.---';
    this.dom.resultList.innerHTML = ranked.map((racer, index) => `<li class="${racer.isPlayer ? 'player-row' : ''}"><span class="result-rank">P${index + 1}</span><span>${racer.name}</span><span class="result-time">${racer.finished ? formatTime(racer.finishTime) : `第 ${Math.min(TOTAL_LAPS, racer.lap + 1)} 圈`}</span></li>`).join('');
  }

  updateHud() {
    if (!this.player) return;
    const speedKmh = Math.min(999, Math.round(Math.abs(this.player.speed) * 3.6));
    const speedRatio = clamp(speedKmh / 235, 0, 1);
    this.dom.speed.textContent = String(speedKmh).padStart(3, '0');
    this.dom.gear.textContent = this.player.speed < -1 ? 'R' : speedKmh < 2 ? 'N' : String(clamp(1 + Math.floor(speedKmh / 34), 1, 6));
    this.dom.speedDial.style.setProperty('--speed-progress', `${speedRatio * 280}deg`);
    this.dom.speedDial.style.setProperty('--needle-angle', `${-140 + speedRatio * 280}deg`);
    const ranked = this.getRankedRacers();
    const rank = ranked.findIndex((racer) => racer.isPlayer) + 1;
    this.dom.position.innerHTML = `${rank}<span>/6</span>`;
    this.dom.lap.innerHTML = `${Math.min(TOTAL_LAPS, this.player.lap + 1)}<span>/${TOTAL_LAPS}</span>`;
    this.dom.totalTime.textContent = formatTime(this.raceTime);
    this.dom.currentTime.textContent = formatTime(Math.max(0, this.raceTime - this.player.lastLapStart));
    this.dom.bestTime.textContent = this.player.bestLap ? formatTime(this.player.bestLap) : '--:--.---';
    this.dom.nitro.textContent = `${Math.round(this.player.nitro)}%`;
    this.dom.nitroFill.style.width = `${this.player.nitro}%`;
    this.dom.nitroFill.classList.toggle('low', this.player.nitro < 25);
    this.dom.checkpoint.textContent = `${this.player.nextCheckpoint} / ${CHECKPOINT_FRACTIONS.length}`;
    this.dom.checkpointFill.style.width = `${this.player.nextCheckpoint / CHECKPOINT_FRACTIONS.length * 100}%`;
    this.dom.driftCharge.textContent = `${Math.round(this.player.driftCharge * 100)}%`;
    this.dom.driftFill.style.width = `${this.player.driftCharge * 100}%`;
    this.dom.driftHud.classList.toggle('active', this.player.driftActive || this.player.driftCharge > .02);
    this.dom.driftLabel.textContent = this.player.driftActive ? '漂移集气中' : this.player.driftReleaseCount > 0 ? '可再次漂移' : '漂移集气';
    const sequences = this.dom.driftHud.querySelectorAll('.seq');
    sequences[0].classList.toggle('active', this.player.driftActive);
    sequences[1].classList.toggle('active', this.player.driftReleaseCount > 0);
    sequences[2].classList.toggle('active', this.player.boostKind === 'break' && this.player.boostTimer > 0);
    if (this.boostToastTimer > 0) {
      this.boostToastTimer -= 1 / 60;
      if (this.boostToastTimer <= 0) this.dom.boostMessage.classList.remove('show');
    }
    const stateText = this.raceState === 'countdown' ? '发车倒计时' : this.raceState === 'paused' ? '已暂停' : this.raceState === 'cooldown' || this.raceState === 'finished' ? '冲线' : this.player.wrongWay ? '逆行警告' : this.player.driftActive ? '横滑控制' : this.player.boostTimer > 0 ? '推进爆发' : '抓地行驶';
    this.dom.driveState.textContent = stateText;
    this.dom.raceState.textContent = this.raceState === 'racing' ? 'RACE LIVE' : this.raceState === 'countdown' ? 'COUNTDOWN' : this.raceState === 'cooldown' ? 'FINISH' : this.raceState === 'paused' ? 'PAUSED' : 'READY';
    this.dom.speedLines.style.opacity = this.player.boostTimer > 0 ? '.42' : speedKmh > 170 ? '.18' : '0';
    this.dom.speedDial.classList.toggle('hot', speedRatio > .62);
    this.dom.nitroWrap.classList.toggle('ready', this.player.nitro >= 95);
    if (this.dom.shell) {
      this.dom.shell.classList.toggle('boosting', this.player.boostTimer > 0);
      this.dom.shell.classList.toggle('drifting', this.player.driftActive && Math.abs(this.player.speed) > 8);
    }
    this.updateLeaderboard();
    this.updateMinimap();
  }

  resize() {
    if (!this.renderer || !this.camera) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.isSoftwareRenderer ? 1 : Math.min(window.devicePixelRatio || 1, width < 760 ? 1.25 : 1.6));
    this.renderer.setSize(width, height, false);
    this.isNarrow = width < 760;
    this.dom.narrowNotice.hidden = !this.isNarrow;
    this.renderer.shadowMap.enabled = !this.isSoftwareRenderer && width >= 760;
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const now = performance.now() / 1000;
    const frameDt = Math.min(MAX_FRAME_DT, now - this.lastFrameTime);
    this.lastFrameTime = now;
    if (this.renderer && this.scene && this.camera && this.raceState !== 'paused') {
      this.accumulator += frameDt;
      while (this.accumulator >= FIXED_DT) {
        this.fixedUpdate(FIXED_DT);
        this.accumulator -= FIXED_DT;
      }
      this.updateCamera(frameDt);
      this.audio.update(Math.abs(this.player?.speed || 0), this.player?.nitroActive, this.player?.driftActive);
      this.updateHud();
      this.renderer.render(this.scene, this.camera);
    }
  }
}

try {
  const game = new SunnyCoastRacer();
  game.init();
  window.sunnyCoastRacer = game;
} catch (error) {
  console.error(error);
  const fallback = document.querySelector('#webgl-error');
  const start = document.querySelector('#start-overlay');
  if (fallback) fallback.hidden = false;
  if (start) start.hidden = true;
}
