import { trpc } from "@/lib/trpc";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────
type PetState = "thriving" | "happy" | "okay" | "sick" | "dead";
type Evolution = "egg" | "baby" | "teen" | "adult" | "legendary";

interface PetSave {
  name: string;
  xp: number;
  evolution: Evolution;
  streak: number; // consecutive "happy or above" checks
  bestStreak: number;
  moodLog: { ts: number; state: PetState }[]; // last 20 snapshots
  achievements: string[];
  totalPets: number;
  totalFeeds: number;
  birthTs: number;
  lastCheckTs: number;
}

const STORAGE_KEY = "selfheal-tamagotchi";
const MAX_MOOD_LOG = 24;

// ─── Sprites (8x8 grids, 1 = filled) ────────────────────────────────
const SPRITES: Record<Evolution, Record<PetState, number[][]>> = {
  egg: {
    thriving: [
      [0,0,0,1,1,0,0,0],
      [0,0,1,1,1,1,0,0],
      [0,1,1,1,1,1,1,0],
      [0,1,1,0,0,1,1,0],
      [0,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,0],
      [0,0,1,1,1,1,0,0],
      [0,0,0,1,1,0,0,0],
    ],
    happy: [
      [0,0,0,1,1,0,0,0],
      [0,0,1,1,1,1,0,0],
      [0,1,1,1,1,1,1,0],
      [0,1,1,0,0,1,1,0],
      [0,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,0],
      [0,0,1,1,1,1,0,0],
      [0,0,0,1,1,0,0,0],
    ],
    okay: [
      [0,0,0,1,1,0,0,0],
      [0,0,1,1,1,1,0,0],
      [0,1,1,1,1,1,1,0],
      [0,1,1,0,0,1,1,0],
      [0,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,0],
      [0,0,1,1,1,1,0,0],
      [0,0,0,1,1,0,0,0],
    ],
    sick: [
      [0,0,0,1,1,0,0,0],
      [0,0,1,1,1,1,0,0],
      [0,1,1,0,0,1,1,0],
      [0,1,1,1,1,1,1,0],
      [0,1,0,1,1,0,1,0],
      [0,1,1,1,1,1,1,0],
      [0,0,1,1,1,1,0,0],
      [0,0,0,1,1,0,0,0],
    ],
    dead: [
      [0,0,0,1,1,0,0,0],
      [0,0,1,1,1,1,0,0],
      [0,1,1,0,0,1,1,0],
      [0,1,0,1,1,0,1,0],
      [0,1,1,0,0,1,1,0],
      [0,1,1,1,1,1,1,0],
      [0,0,1,1,1,1,0,0],
      [0,0,0,1,1,0,0,0],
    ],
  },
  baby: {
    thriving: [
      [0,0,1,1,1,1,0,0],
      [0,1,0,1,0,1,1,0],
      [0,1,0,1,0,1,1,0],
      [0,1,1,1,1,1,1,0],
      [0,1,0,1,1,0,1,0],
      [0,1,1,0,0,1,1,0],
      [0,0,1,1,1,1,0,0],
      [0,0,0,1,1,0,0,0],
    ],
    happy: [
      [0,0,1,1,1,1,0,0],
      [0,1,0,1,0,1,1,0],
      [0,1,0,1,0,1,1,0],
      [0,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,0],
      [0,1,0,1,1,0,1,0],
      [0,0,1,1,1,1,0,0],
      [0,0,0,1,1,0,0,0],
    ],
    okay: [
      [0,0,1,1,1,1,0,0],
      [0,1,0,1,0,1,1,0],
      [0,1,0,1,0,1,1,0],
      [0,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,0],
      [0,0,1,1,1,1,0,0],
      [0,0,0,1,1,0,0,0],
    ],
    sick: [
      [0,0,1,1,1,1,0,0],
      [0,1,1,1,1,1,1,0],
      [0,1,0,1,0,1,1,0],
      [0,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,0],
      [0,1,1,0,0,1,1,0],
      [0,0,1,1,1,1,0,0],
      [0,0,0,1,1,0,0,0],
    ],
    dead: [
      [0,0,1,1,1,1,0,0],
      [0,1,1,0,1,0,1,0],
      [0,1,0,1,0,1,1,0],
      [0,1,1,1,1,1,1,0],
      [0,1,1,0,0,1,1,0],
      [0,1,0,1,1,0,1,0],
      [0,0,1,1,1,1,0,0],
      [0,0,0,1,1,0,0,0],
    ],
  },
  teen: {
    thriving: [
      [0,1,0,0,0,0,1,0],
      [0,0,1,1,1,1,0,0],
      [0,1,0,1,0,1,1,0],
      [0,1,0,1,0,1,1,0],
      [0,1,1,1,1,1,1,0],
      [0,0,1,0,0,1,0,0],
      [0,1,1,1,1,1,1,0],
      [0,1,0,0,0,0,1,0],
    ],
    happy: [
      [0,1,0,0,0,0,1,0],
      [0,0,1,1,1,1,0,0],
      [0,1,0,1,0,1,1,0],
      [0,1,0,1,0,1,1,0],
      [0,1,0,1,1,0,1,0],
      [0,0,1,1,1,1,0,0],
      [0,1,1,1,1,1,1,0],
      [0,1,0,0,0,0,1,0],
    ],
    okay: [
      [0,1,0,0,0,0,1,0],
      [0,0,1,1,1,1,0,0],
      [0,1,0,1,0,1,1,0],
      [0,1,0,1,0,1,1,0],
      [0,1,1,1,1,1,1,0],
      [0,0,1,1,1,1,0,0],
      [0,1,1,1,1,1,1,0],
      [0,1,0,0,0,0,1,0],
    ],
    sick: [
      [0,1,0,0,0,0,1,0],
      [0,0,1,1,1,1,0,0],
      [0,1,1,1,1,1,1,0],
      [0,1,0,1,0,1,1,0],
      [0,1,1,0,0,1,1,0],
      [0,0,1,1,1,1,0,0],
      [0,1,1,1,1,1,1,0],
      [0,1,0,0,0,0,1,0],
    ],
    dead: [
      [0,1,0,0,0,0,1,0],
      [0,0,1,1,1,1,0,0],
      [0,1,1,0,1,0,1,0],
      [0,1,0,1,0,1,1,0],
      [0,1,1,0,0,1,1,0],
      [0,0,1,1,1,1,0,0],
      [0,0,0,1,1,0,0,0],
      [0,0,1,0,0,1,0,0],
    ],
  },
  adult: {
    thriving: [
      [0,0,1,0,0,1,0,0],
      [0,1,1,1,1,1,1,0],
      [1,1,0,1,0,1,1,1],
      [1,1,0,1,0,1,1,1],
      [1,1,1,1,1,1,1,1],
      [0,1,0,1,1,0,1,0],
      [0,0,1,1,1,1,0,0],
      [0,1,0,0,0,0,1,0],
    ],
    happy: [
      [0,0,1,0,0,1,0,0],
      [0,1,1,1,1,1,1,0],
      [1,1,0,1,0,1,1,1],
      [1,1,0,1,0,1,1,1],
      [1,1,0,1,1,0,1,1],
      [0,1,1,1,1,1,1,0],
      [0,0,1,1,1,1,0,0],
      [0,1,0,0,0,0,1,0],
    ],
    okay: [
      [0,0,1,0,0,1,0,0],
      [0,1,1,1,1,1,1,0],
      [1,1,0,1,0,1,1,1],
      [1,1,0,1,0,1,1,1],
      [1,1,1,1,1,1,1,1],
      [0,1,1,1,1,1,1,0],
      [0,0,1,1,1,1,0,0],
      [0,1,0,0,0,0,1,0],
    ],
    sick: [
      [0,0,1,0,0,1,0,0],
      [0,1,1,1,1,1,1,0],
      [1,1,1,1,1,1,1,1],
      [1,1,0,1,0,1,1,1],
      [1,1,1,0,0,1,1,1],
      [0,1,0,1,1,0,1,0],
      [0,0,1,1,1,1,0,0],
      [0,1,0,0,0,0,1,0],
    ],
    dead: [
      [0,0,1,0,0,1,0,0],
      [0,1,1,1,1,1,1,0],
      [1,1,1,0,1,0,1,1],
      [1,1,0,1,0,1,1,1],
      [1,1,1,0,0,1,1,1],
      [0,1,0,1,1,0,1,0],
      [0,0,1,1,1,1,0,0],
      [0,0,0,1,1,0,0,0],
    ],
  },
  legendary: {
    thriving: [
      [1,0,0,1,1,0,0,1],
      [0,1,1,1,1,1,1,0],
      [1,1,0,1,0,1,1,1],
      [1,1,0,1,0,1,1,1],
      [1,1,1,1,1,1,1,1],
      [0,1,0,1,1,0,1,0],
      [1,0,1,1,1,1,0,1],
      [0,1,0,0,0,0,1,0],
    ],
    happy: [
      [1,0,0,1,1,0,0,1],
      [0,1,1,1,1,1,1,0],
      [1,1,0,1,0,1,1,1],
      [1,1,0,1,0,1,1,1],
      [1,1,0,1,1,0,1,1],
      [0,1,1,1,1,1,1,0],
      [1,0,1,1,1,1,0,1],
      [0,1,0,0,0,0,1,0],
    ],
    okay: [
      [1,0,0,1,1,0,0,1],
      [0,1,1,1,1,1,1,0],
      [1,1,0,1,0,1,1,1],
      [1,1,0,1,0,1,1,1],
      [1,1,1,1,1,1,1,1],
      [0,1,1,1,1,1,1,0],
      [1,0,1,1,1,1,0,1],
      [0,1,0,0,0,0,1,0],
    ],
    sick: [
      [1,0,0,1,1,0,0,1],
      [0,1,1,1,1,1,1,0],
      [1,1,1,1,1,1,1,1],
      [1,1,0,1,0,1,1,1],
      [1,1,1,0,0,1,1,1],
      [0,1,0,1,1,0,1,0],
      [1,0,1,1,1,1,0,1],
      [0,1,0,0,0,0,1,0],
    ],
    dead: [
      [1,0,0,1,1,0,0,1],
      [0,1,1,1,1,1,1,0],
      [1,1,1,0,1,0,1,1],
      [1,1,0,1,0,1,1,1],
      [1,1,1,0,0,1,1,1],
      [0,1,0,1,1,0,1,0],
      [1,0,1,1,1,1,0,1],
      [0,0,0,1,1,0,0,0],
    ],
  },
};

// ─── Config ──────────────────────────────────────────────────────────
interface PetConfig {
  bg: string;
  border: string;
  label: string;
  messages: string[];
  anim: string;
  color: string;
}

const PET_CONFIGS: Record<PetState, PetConfig> = {
  thriving: {
    bg: "from-emerald-500/20 to-emerald-500/5",
    border: "border-emerald-500/40",
    label: "Thriving!",
    messages: [
      "Zero errors. I'm living my best life.",
      "Is this what peak performance feels like?",
      "All systems nominal, captain!",
      "I could do this forever.",
    ],
    anim: "tama-bounce",
    color: "#34d399",
  },
  happy: {
    bg: "from-green-500/20 to-green-500/5",
    border: "border-green-500/40",
    label: "Happy",
    messages: [
      "APIs are looking healthy!",
      "Smooth sailing out here.",
      "Keep it up, we're cruising.",
    ],
    anim: "tama-bounce",
    color: "#4ade80",
  },
  okay: {
    bg: "from-yellow-500/20 to-yellow-500/5",
    border: "border-yellow-500/40",
    label: "Meh...",
    messages: [
      "Some errors creeping in. Feed me a deploy?",
      "I've seen better days...",
      "Getting a little queasy over here.",
    ],
    anim: "tama-wobble",
    color: "#facc15",
  },
  sick: {
    bg: "from-orange-500/20 to-orange-500/5",
    border: "border-orange-500/40",
    label: "Sick!",
    messages: [
      "Too many errors! I need a hotfix!",
      "It hurts... make it stop...",
      "Is anyone watching the monitors?!",
    ],
    anim: "tama-shake",
    color: "#fb923c",
  },
  dead: {
    bg: "from-red-500/20 to-red-500/5",
    border: "border-red-500/40",
    label: "Dead",
    messages: [
      "Uptime collapsed. Deploy to revive me!",
      "x_x ... I see the light...",
      "Tell my logs... I loved them...",
    ],
    anim: "tama-dead",
    color: "#f87171",
  },
};

const EVOLUTION_THRESHOLDS: Record<Evolution, number> = {
  egg: 0,
  baby: 50,
  teen: 200,
  adult: 500,
  legendary: 1500,
};

const EVOLUTION_LABELS: Record<Evolution, string> = {
  egg: "Egg",
  baby: "Hatchling",
  teen: "Apprentice",
  adult: "Guardian",
  legendary: "Legendary",
};

// ─── Achievements ────────────────────────────────────────────────────
interface Achievement {
  id: string;
  icon: string;
  name: string;
  desc: string;
  check: (save: PetSave, stats: DashStats) => boolean;
}

interface DashStats {
  totalRequests: number;
  interceptedRequests: number;
  successRate: number;
  autoRetries: number;
  retrySuccesses: number;
  sentryEvents: number;
}

const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_pet",
    icon: "~",
    name: "First Touch",
    desc: "Pet your API pet for the first time",
    check: (s) => s.totalPets >= 1,
  },
  {
    id: "pet_10",
    icon: "!",
    name: "Pet Whisperer",
    desc: "Pet 10 times",
    check: (s) => s.totalPets >= 10,
  },
  {
    id: "streak_3",
    icon: "*",
    name: "Hat Trick",
    desc: "3 healthy checks in a row",
    check: (s) => s.bestStreak >= 3,
  },
  {
    id: "streak_7",
    icon: "#",
    name: "Lucky Seven",
    desc: "7 healthy checks in a row",
    check: (s) => s.bestStreak >= 7,
  },
  {
    id: "req_100",
    icon: ">",
    name: "First Hundred",
    desc: "100 total requests proxied",
    check: (_s, st) => st.totalRequests >= 100,
  },
  {
    id: "req_1000",
    icon: "^",
    name: "Thousand Club",
    desc: "1,000 total requests proxied",
    check: (_s, st) => st.totalRequests >= 1000,
  },
  {
    id: "zero_errors",
    icon: "+",
    name: "Flawless",
    desc: "100% pass-through rate",
    check: (_s, st) => st.totalRequests > 0 && st.successRate >= 100,
  },
  {
    id: "evolved_teen",
    icon: "T",
    name: "Growing Up",
    desc: "Evolve to Apprentice",
    check: (s) => EVOLUTION_THRESHOLDS[s.evolution] >= EVOLUTION_THRESHOLDS.teen,
  },
  {
    id: "evolved_legend",
    icon: "L",
    name: "LEGENDARY",
    desc: "Reach Legendary evolution",
    check: (s) => s.evolution === "legendary",
  },
  {
    id: "feed_5",
    icon: "F",
    name: "Well Fed",
    desc: "Feed your pet 5 times",
    check: (s) => s.totalFeeds >= 5,
  },
];

// ─── Persistence ─────────────────────────────────────────────────────
function loadSave(): PetSave {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {
    name: "",
    xp: 0,
    evolution: "egg",
    streak: 0,
    bestStreak: 0,
    moodLog: [],
    achievements: [],
    totalPets: 0,
    totalFeeds: 0,
    birthTs: Date.now(),
    lastCheckTs: 0,
  };
}

function persistSave(save: PetSave) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
}

function computeEvolution(xp: number): Evolution {
  if (xp >= EVOLUTION_THRESHOLDS.legendary) return "legendary";
  if (xp >= EVOLUTION_THRESHOLDS.adult) return "adult";
  if (xp >= EVOLUTION_THRESHOLDS.teen) return "teen";
  if (xp >= EVOLUTION_THRESHOLDS.baby) return "baby";
  return "egg";
}

function derivePetState(successRate: number, total: number): PetState {
  if (total === 0) return "happy";
  if (successRate >= 99) return "thriving";
  if (successRate >= 95) return "happy";
  if (successRate >= 85) return "okay";
  if (successRate >= 70) return "sick";
  return "dead";
}

// ─── Pixel Sprite Renderer ──────────────────────────────────────────
function PixelSprite({
  grid,
  color,
  size = 4,
}: {
  grid: number[][];
  color: string;
  size?: number;
}) {
  return (
    <div className="flex flex-col items-center" style={{ gap: 0, lineHeight: 0 }}>
      {grid.map((row, ri) => (
        <div key={ri} style={{ display: "flex", gap: 0 }}>
          {row.map((cell, ci) => (
            <div
              key={ci}
              style={{
                width: size,
                height: size,
                backgroundColor: cell ? color : "transparent",
                borderRadius: cell ? 1 : 0,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Sparkline ───────────────────────────────────────────────────────
const STATE_VALUE: Record<PetState, number> = {
  dead: 0,
  sick: 1,
  okay: 2,
  happy: 3,
  thriving: 4,
};

function MoodSparkline({ log }: { log: { ts: number; state: PetState }[] }) {
  if (log.length < 2) return null;
  const w = 120;
  const h = 28;
  const pad = 2;
  const points = log.map((entry, i) => {
    const x = pad + (i / (log.length - 1)) * (w - pad * 2);
    const y = h - pad - (STATE_VALUE[entry.state] / 4) * (h - pad * 2);
    return `${x},${y}`;
  });
  const last = log[log.length - 1];
  const stateColor = PET_CONFIGS[last.state].color;

  return (
    <svg width={w} height={h} className="opacity-60">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={stateColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* dot on the latest */}
      {points.length > 0 && (
        <circle
          cx={parseFloat(points[points.length - 1].split(",")[0])}
          cy={parseFloat(points[points.length - 1].split(",")[1])}
          r={2.5}
          fill={stateColor}
        />
      )}
    </svg>
  );
}

// ─── Particle Burst ──────────────────────────────────────────────────
function ParticleBurst({ emoji, onDone }: { emoji: string; onDone: () => void }) {
  const particles = Array.from({ length: 6 }, (_, i) => {
    const angle = (i / 6) * Math.PI * 2;
    const dist = 30 + Math.random() * 20;
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      delay: Math.random() * 0.1,
    };
  });

  useEffect(() => {
    const t = setTimeout(onDone, 800);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible">
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute text-xs"
          style={{
            left: "50%",
            top: "50%",
            animation: `tama-particle 0.7s ${p.delay}s ease-out forwards`,
            ["--px" as string]: `${p.x}px`,
            ["--py" as string]: `${p.y}px`,
            opacity: 0,
          }}
        >
          {emoji}
        </span>
      ))}
    </div>
  );
}

// ─── XP Bar ──────────────────────────────────────────────────────────
function XpBar({ xp, evolution }: { xp: number; evolution: Evolution }) {
  const evolutions: Evolution[] = ["egg", "baby", "teen", "adult", "legendary"];
  const idx = evolutions.indexOf(evolution);
  const nextEvo = idx < evolutions.length - 1 ? evolutions[idx + 1] : null;
  const currentThreshold = EVOLUTION_THRESHOLDS[evolution];
  const nextThreshold = nextEvo ? EVOLUTION_THRESHOLDS[nextEvo] : xp;
  const progress = nextEvo
    ? ((xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100
    : 100;

  return (
    <div>
      <div className="flex justify-between text-[9px] text-muted-foreground mb-0.5">
        <span>{EVOLUTION_LABELS[evolution]}</span>
        <span>
          {nextEvo
            ? `${xp - currentThreshold}/${nextThreshold - currentThreshold} XP`
            : `MAX`}
        </span>
      </div>
      <div className="w-full h-1.5 bg-foreground/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
      {nextEvo && (
        <p className="text-[8px] text-muted-foreground/60 mt-0.5">
          Next: {EVOLUTION_LABELS[nextEvo]}
        </p>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────
export default function Tamagotchi() {
  const { data: stats } = trpc.dashboard.stats.useQuery(undefined, {
    refetchInterval: 30_000, // poll every 30s for live updates
  });

  const [save, setSave] = useState<PetSave>(loadSave);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [naming, setNaming] = useState(false);
  const [nameInput, setNameInput] = useState(save.name);
  const [particles, setParticles] = useState<{ id: number; emoji: string } | null>(null);
  const [newAchievement, setNewAchievement] = useState<Achievement | null>(null);
  const [tab, setTab] = useState<"status" | "achievements">("status");
  const particleId = useRef(0);

  const persist = useCallback((next: PetSave) => {
    setSave(next);
    persistSave(next);
  }, []);

  // Derive current state
  const successRate = stats?.successRate ?? 100;
  const total = stats?.totalRequests ?? 0;
  const state = derivePetState(successRate, total);
  const config = PET_CONFIGS[state];
  const sprite = SPRITES[save.evolution]?.[state] ?? SPRITES.egg[state];
  const message = config.messages[Math.floor(Date.now() / 60000) % config.messages.length];

  // Update mood log + XP on state changes (throttled to once per minute)
  useEffect(() => {
    if (!stats) return;
    const now = Date.now();
    if (now - save.lastCheckTs < 55_000) return; // debounce

    const isHealthy = state === "thriving" || state === "happy";
    const newStreak = isHealthy ? save.streak + 1 : 0;
    const xpGain = state === "thriving" ? 10 : state === "happy" ? 5 : state === "okay" ? 1 : 0;

    const newMoodLog = [
      ...save.moodLog.slice(-(MAX_MOOD_LOG - 1)),
      { ts: now, state },
    ];

    const newXp = save.xp + xpGain;
    const newEvolution = computeEvolution(newXp);

    const next: PetSave = {
      ...save,
      xp: newXp,
      evolution: newEvolution,
      streak: newStreak,
      bestStreak: Math.max(save.bestStreak, newStreak),
      moodLog: newMoodLog,
      lastCheckTs: now,
    };

    // Check achievements
    const dashStats: DashStats = {
      totalRequests: stats.totalRequests ?? 0,
      interceptedRequests: stats.interceptedRequests ?? 0,
      successRate: stats.successRate ?? 100,
      autoRetries: stats.autoRetries ?? 0,
      retrySuccesses: stats.retrySuccesses ?? 0,
      sentryEvents: stats.sentryEvents ?? 0,
    };

    for (const ach of ACHIEVEMENTS) {
      if (!next.achievements.includes(ach.id) && ach.check(next, dashStats)) {
        next.achievements.push(ach.id);
        setNewAchievement(ach);
        setTimeout(() => setNewAchievement(null), 3000);
      }
    }

    persist(next);
  }, [stats, state]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePet = () => {
    const next = { ...save, totalPets: save.totalPets + 1 };

    // check pet achievements
    for (const ach of ACHIEVEMENTS) {
      if (!next.achievements.includes(ach.id) && ach.check(next, {
        totalRequests: stats?.totalRequests ?? 0,
        interceptedRequests: stats?.interceptedRequests ?? 0,
        successRate: stats?.successRate ?? 100,
        autoRetries: stats?.autoRetries ?? 0,
        retrySuccesses: stats?.retrySuccesses ?? 0,
        sentryEvents: stats?.sentryEvents ?? 0,
      })) {
        next.achievements.push(ach.id);
        setNewAchievement(ach);
        setTimeout(() => setNewAchievement(null), 3000);
      }
    }

    persist(next);
    particleId.current += 1;
    setParticles({ id: particleId.current, emoji: state === "dead" ? "x" : "+" });
  };

  const handleFeed = () => {
    const xpBonus = 5;
    const newXp = save.xp + xpBonus;
    const next: PetSave = {
      ...save,
      totalFeeds: save.totalFeeds + 1,
      xp: newXp,
      evolution: computeEvolution(newXp),
    };

    for (const ach of ACHIEVEMENTS) {
      if (!next.achievements.includes(ach.id) && ach.check(next, {
        totalRequests: stats?.totalRequests ?? 0,
        interceptedRequests: stats?.interceptedRequests ?? 0,
        successRate: stats?.successRate ?? 100,
        autoRetries: stats?.autoRetries ?? 0,
        retrySuccesses: stats?.retrySuccesses ?? 0,
        sentryEvents: stats?.sentryEvents ?? 0,
      })) {
        next.achievements.push(ach.id);
        setNewAchievement(ach);
        setTimeout(() => setNewAchievement(null), 3000);
      }
    }

    persist(next);
    particleId.current += 1;
    setParticles({ id: particleId.current, emoji: "o" });
  };

  const handleNameSave = () => {
    persist({ ...save, name: nameInput.trim().slice(0, 16) });
    setNaming(false);
  };

  const petAge = Math.floor((Date.now() - save.birthTs) / 86400000);

  if (dismissed) return null;

  return (
    <>
      <style>{`
        @keyframes tama-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes tama-wobble {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-3deg); }
          75% { transform: rotate(3deg); }
        }
        @keyframes tama-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-3px); }
          40% { transform: translateX(3px); }
          60% { transform: translateX(-2px); }
          80% { transform: translateX(2px); }
        }
        @keyframes tama-dead {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.3; }
        }
        @keyframes tama-particle {
          0% { transform: translate(-50%, -50%) translate(0, 0); opacity: 1; }
          100% { transform: translate(-50%, -50%) translate(var(--px), var(--py)); opacity: 0; }
        }
        @keyframes tama-achievement-in {
          0% { transform: translateY(8px) scale(0.9); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes tama-glow {
          0%, 100% { box-shadow: 0 0 8px rgba(255,255,255,0.1); }
          50% { box-shadow: 0 0 16px rgba(255,255,255,0.25); }
        }
        .tama-bounce { animation: tama-bounce 2s ease-in-out infinite; }
        .tama-wobble { animation: tama-wobble 2s ease-in-out infinite; }
        .tama-shake { animation: tama-shake 0.5s ease-in-out infinite; }
        .tama-dead { animation: tama-dead 3s ease-in-out infinite; }
        .tama-glow { animation: tama-glow 2s ease-in-out infinite; }
      `}</style>

      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
        {/* Achievement toast */}
        {newAchievement && (
          <div
            className="bg-primary/20 border border-primary/40 rounded-lg px-3 py-2 shadow-lg backdrop-blur-sm"
            style={{ animation: "tama-achievement-in 0.3s ease-out" }}
          >
            <p className="text-[10px] text-primary font-semibold">Achievement Unlocked!</p>
            <p className="text-xs text-foreground font-medium">
              [{newAchievement.icon}] {newAchievement.name}
            </p>
            <p className="text-[9px] text-muted-foreground">{newAchievement.desc}</p>
          </div>
        )}

        {/* Expanded card */}
        {expanded && (
          <div
            className={`bg-gradient-to-br ${config.bg} backdrop-blur-md border ${config.border} rounded-xl shadow-xl w-64 animate-in fade-in slide-in-from-bottom-2 duration-200 overflow-hidden`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 pt-3 pb-2">
              <div className="flex items-center gap-2">
                {naming ? (
                  <form
                    onSubmit={(e) => { e.preventDefault(); handleNameSave(); }}
                    className="flex gap-1"
                  >
                    <input
                      autoFocus
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      maxLength={16}
                      className="text-xs font-semibold bg-transparent border-b border-foreground/30 outline-none w-20 text-foreground"
                      placeholder="Name me..."
                    />
                    <button type="submit" className="text-[10px] text-primary">ok</button>
                  </form>
                ) : (
                  <button
                    onClick={() => { setNaming(true); setNameInput(save.name); }}
                    className="text-xs font-semibold text-foreground hover:text-primary transition-colors"
                    title="Click to rename"
                  >
                    {save.name || "Name me!"}
                  </button>
                )}
                <span className="text-[9px] text-muted-foreground/60">
                  Day {petAge + 1}
                </span>
              </div>
              <button
                onClick={() => setDismissed(true)}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                hide
              </button>
            </div>

            {/* Tabs */}
            <div className="flex px-3 gap-1 mb-2">
              {(["status", "achievements"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                    tab === t
                      ? "bg-foreground/15 text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "status" ? "Status" : `Badges ${save.achievements.length}/${ACHIEVEMENTS.length}`}
                </button>
              ))}
            </div>

            {tab === "status" ? (
              <div className="px-3 pb-3">
                {/* Pet + info */}
                <div className="flex items-center gap-3 mb-3">
                  <div className={`relative ${config.anim}`}>
                    <PixelSprite grid={sprite} color={config.color} size={5} />
                    {particles && (
                      <ParticleBurst
                        key={particles.id}
                        emoji={particles.emoji}
                        onDone={() => setParticles(null)}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">{config.label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {successRate}% pass-through
                      {save.streak > 0 && ` / ${save.streak} streak`}
                    </p>
                  </div>
                </div>

                {/* Speech bubble */}
                <div className="bg-foreground/5 rounded-lg px-2.5 py-1.5 mb-3">
                  <p className="text-[11px] text-muted-foreground italic">"{message}"</p>
                </div>

                {/* XP bar */}
                <div className="mb-3">
                  <XpBar xp={save.xp} evolution={save.evolution} />
                </div>

                {/* Mood sparkline */}
                {save.moodLog.length >= 2 && (
                  <div className="mb-3">
                    <p className="text-[9px] text-muted-foreground/60 mb-1">Mood history</p>
                    <MoodSparkline log={save.moodLog} />
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-1.5">
                  <button
                    onClick={handlePet}
                    className="flex-1 text-[10px] py-1.5 rounded-md bg-foreground/10 hover:bg-foreground/20 text-foreground transition-colors font-medium"
                  >
                    Pet
                  </button>
                  <button
                    onClick={handleFeed}
                    className="flex-1 text-[10px] py-1.5 rounded-md bg-foreground/10 hover:bg-foreground/20 text-foreground transition-colors font-medium"
                  >
                    Feed (+5 XP)
                  </button>
                </div>

                {/* Health bar */}
                <div className="mt-3 flex gap-0.5">
                  {(["thriving", "happy", "okay", "sick", "dead"] as PetState[]).map((s) => (
                    <div
                      key={s}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        s === state ? "bg-foreground/60" : "bg-foreground/10"
                      }`}
                      title={s}
                    />
                  ))}
                </div>
              </div>
            ) : (
              /* Achievements tab */
              <div className="px-3 pb-3 max-h-48 overflow-y-auto">
                <div className="space-y-1.5">
                  {ACHIEVEMENTS.map((ach) => {
                    const unlocked = save.achievements.includes(ach.id);
                    return (
                      <div
                        key={ach.id}
                        className={`flex items-center gap-2 p-1.5 rounded-md transition-colors ${
                          unlocked ? "bg-foreground/10" : "opacity-40"
                        }`}
                      >
                        <div
                          className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-mono font-bold shrink-0 ${
                            unlocked
                              ? "bg-primary/20 text-primary"
                              : "bg-foreground/5 text-muted-foreground"
                          }`}
                        >
                          {unlocked ? ach.icon : "?"}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-medium text-foreground truncate">
                            {unlocked ? ach.name : "???"}
                          </p>
                          <p className="text-[9px] text-muted-foreground truncate">
                            {ach.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Floating orb */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={`w-12 h-12 rounded-full bg-gradient-to-br ${config.bg} border ${config.border} shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95 ${config.anim} ${save.evolution === "legendary" ? "tama-glow" : ""}`}
          title={save.name || "API Pet"}
        >
          <PixelSprite grid={sprite} color={config.color} />
        </button>
      </div>
    </>
  );
}
