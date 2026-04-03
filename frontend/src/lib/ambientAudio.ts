/**
 * Procedural ambient sound engine using Web Audio API.
 * Generates biome-appropriate ambient soundscapes without external audio files.
 */

type BiomeTheme =
  | "forest"
  | "dungeon"
  | "tavern"
  | "cave"
  | "coastal"
  | "mountain"
  | "ruins"
  | "city"
  | "silence";

interface AmbientLayer {
  stop: () => void;
}

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
const activeLayers: AmbientLayer[] = [];
let currentBiome: BiomeTheme | null = null;
let userVolume = 0.18; // subtle by default

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = userVolume;
    masterGain.connect(audioCtx.destination);
  }
  return audioCtx;
}

function getMaster(): GainNode {
  getCtx();
  return masterGain!;
}

/** Create brown noise buffer (deeper, more natural than white) */
function createNoiseBuffer(ctx: AudioContext, seconds = 3): AudioBuffer {
  const bufLen = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = 0; i < bufLen; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) / 7;
    b6 = white * 0.115926;
  }
  return buf;
}

function loopNoise(gain: number, filterFreq: number, q = 1): AmbientLayer {
  const ctx = getCtx();
  const buf = createNoiseBuffer(ctx);

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterFreq;
  filter.Q.value = q;

  const gainNode = ctx.createGain();
  gainNode.gain.value = gain;

  src.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(getMaster());
  src.start();

  return {
    stop: () => {
      try {
        src.stop();
        src.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}

function sineWave(freq: number, gain: number, detune = 0): AmbientLayer {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  osc.detune.value = detune;

  const gainNode = ctx.createGain();
  gainNode.gain.value = gain;

  // Slow tremolo
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07 + Math.random() * 0.05;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = gain * 0.3;
  lfo.connect(lfoGain);
  lfoGain.connect(gainNode.gain);

  osc.connect(gainNode);
  gainNode.connect(getMaster());
  osc.start();
  lfo.start();

  return {
    stop: () => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        /* ignore */
      }
      try {
        lfo.stop();
        lfo.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}

function randomDrip(interval: [number, number], gain: number): AmbientLayer {
  const ctx = getCtx();
  let alive = true;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    if (!alive) return;
    const ms = interval[0] + Math.random() * (interval[1] - interval[0]);
    timeout = setTimeout(() => {
      if (!alive) return;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 900 + Math.random() * 800;
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.15);

      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);

      osc.connect(g);
      g.connect(getMaster());
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
      schedule();
    }, ms);
  };
  schedule();

  return {
    stop: () => {
      alive = false;
      if (timeout) clearTimeout(timeout);
    },
  };
}

function windGust(interval: [number, number]): AmbientLayer {
  const ctx = getCtx();
  let alive = true;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    if (!alive) return;
    const ms = interval[0] + Math.random() * (interval[1] - interval[0]);
    timeout = setTimeout(() => {
      if (!alive) return;
      const buf = createNoiseBuffer(ctx, 2);
      const src = ctx.createBufferSource();
      src.buffer = buf;

      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 400 + Math.random() * 600;

      const g = ctx.createGain();
      const now = ctx.currentTime;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.04, now + 0.5);
      g.gain.linearRampToValueAtTime(0, now + 2);

      src.connect(filter);
      filter.connect(g);
      g.connect(getMaster());
      src.start();
      src.stop(now + 2.2);
      schedule();
    }, ms);
  };
  schedule();

  return {
    stop: () => {
      alive = false;
      if (timeout) clearTimeout(timeout);
    },
  };
}

/** Low-frequency rumble for caves/dungeons */
function rumble(freq: number, gain: number): AmbientLayer {
  return sineWave(freq, gain * 0.6, -5);
}

type LayerFactory = () => AmbientLayer[];

const BIOME_LAYERS: Record<BiomeTheme, LayerFactory> = {
  silence: () => [],

  forest: () => [
    loopNoise(0.012, 350, 2), // leaves rustling
    loopNoise(0.008, 800, 1.5), // higher wind
    windGust([4000, 12000]),
    sineWave(220, 0.004, 3), // very low ambient hum
  ],

  dungeon: () => [
    loopNoise(0.009, 120, 3), // deep rumble
    randomDrip([3000, 10000], 0.12), // water drips
    sineWave(55, 0.008), // subsonic presence
    sineWave(80, 0.005, -8),
  ],

  tavern: () => [
    loopNoise(0.025, 1200, 0.5), // crowd chatter
    loopNoise(0.015, 400, 2), // lower murmur
    sineWave(180, 0.006, 5), // distant instrument
  ],

  cave: () => [
    loopNoise(0.01, 100, 4), // cave resonance
    randomDrip([1500, 7000], 0.15),
    randomDrip([8000, 20000], 0.08),
    sineWave(40, 0.01),
    sineWave(65, 0.006, 12),
  ],

  coastal: () => [
    loopNoise(0.025, 200, 1), // waves
    loopNoise(0.018, 500, 0.8), // surf
    windGust([2000, 6000]),
    sineWave(0.5, 0.003), // ultra-low tide rhythm
  ],

  mountain: () => [
    loopNoise(0.014, 600, 1.2), // howling wind
    loopNoise(0.01, 250, 2),
    windGust([1500, 5000]),
    sineWave(88, 0.004),
  ],

  ruins: () => [
    loopNoise(0.01, 180, 3),
    windGust([6000, 16000]),
    randomDrip([15000, 40000], 0.07), // rare distant sounds
    sineWave(62, 0.005),
  ],

  city: () => [
    loopNoise(0.03, 900, 0.4), // ambient city noise
    loopNoise(0.02, 300, 1),
    sineWave(150, 0.004, 7),
  ],
};

const LOCATION_TO_BIOME: Record<string, BiomeTheme> = {
  tavern: "tavern",
  inn: "tavern",
  dungeon: "dungeon",
  castle: "dungeon",
  keep: "dungeon",
  fortress: "dungeon",
  cave: "cave",
  cavern: "cave",
  underground: "cave",
  sewer: "cave",
  crypt: "cave",
  coastal: "coastal",
  beach: "coastal",
  harbor: "coastal",
  port: "coastal",
  mountain: "mountain",
  mountain_pass: "mountain",
  cliffside: "mountain",
  ruins: "ruins",
  ancient_ruins: "ruins",
  temple_ruins: "ruins",
  temple: "ruins",
  shrine: "ruins",
  cathedral: "ruins",
  city_alley: "city",
  city: "city",
  town: "city",
  village: "city",
  forest: "forest",
  jungle: "forest",
  swamp: "forest",
  wetlands: "forest",
  plains: "forest",
  open_field: "forest",
};

const BIOME_TO_THEME: Record<string, BiomeTheme> = {
  underground: "cave",
  urban: "city",
  arctic: "mountain",
  tundra: "mountain",
  desert: "ruins",
  badlands: "ruins",
  swamp: "forest",
  wetland: "forest",
  grassland: "forest",
  temperate: "forest",
  tropical: "forest",
};

function mapLocationToBiome(
  location: string | undefined,
  biome: string | undefined,
): BiomeTheme {
  const loc = (location ?? "").toLowerCase();
  const bio = (biome ?? "").toLowerCase();
  return LOCATION_TO_BIOME[loc] ?? BIOME_TO_THEME[bio] ?? "silence";
}

function stopAll() {
  for (const layer of activeLayers) {
    try {
      layer.stop();
    } catch {
      /* ignore */
    }
  }
  activeLayers.length = 0;
}

function startBiome(theme: BiomeTheme) {
  stopAll();
  currentBiome = theme;
  const factory = BIOME_LAYERS[theme] ?? BIOME_LAYERS.silence;
  activeLayers.push(...factory());
}

function crossfadeTo(theme: BiomeTheme) {
  if (theme === currentBiome) return;
  if (!audioCtx || audioCtx.state === "closed") {
    startBiome(theme);
    return;
  }
  // Fade out master, swap layers, fade back in
  const m = getMaster();
  const now = audioCtx.currentTime;
  m.gain.setValueAtTime(userVolume, now);
  m.gain.linearRampToValueAtTime(0, now + 1.5);
  setTimeout(() => {
    startBiome(theme);
    if (!audioCtx) return;
    const m2 = getMaster();
    const t = audioCtx.currentTime;
    m2.gain.setValueAtTime(0, t);
    m2.gain.linearRampToValueAtTime(userVolume, t + 2);
  }, 1600);
}

export function setAmbientVolume(vol: number) {
  userVolume = Math.max(0, Math.min(1, vol));
  if (masterGain) {
    masterGain.gain.setTargetAtTime(userVolume, audioCtx!.currentTime, 0.3);
  }
}

export function getAmbientVolume(): number {
  return userVolume;
}

export function stopAmbient() {
  stopAll();
  currentBiome = null;
}

export function triggerAmbientFromMap(
  location: string | undefined,
  biome: string | undefined,
) {
  if (
    typeof window === "undefined" ||
    !("AudioContext" in window || "webkitAudioContext" in window)
  )
    return;

  const theme = mapLocationToBiome(location, biome);
  if (theme === "silence") {
    stopAll();
    currentBiome = "silence";
    return;
  }
  crossfadeTo(theme);
}
