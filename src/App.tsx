import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Compass,
  Zap,
  Gauge,
  HelpCircle,
  TrendingUp,
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  Info,
  BookOpen,
  Trophy,
  Sliders,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';

import { CarState, TelemetryPoint, Obstacle, ChallengeId } from './types';
import { CHALLENGES } from './challenges';
import TrackCanvas from './components/TrackCanvas';
import TelemetryGraphs from './components/TelemetryGraphs';
import EducationalPanel from './components/EducationalPanel';

// Obstacles positioned around track dimensions of 800x400
const SIMULATION_OBSTACLES: Obstacle[] = [
  // Mud Pits (increased radius to 22, empty labels as requested)
  {
    id: 'mud-1',
    type: 'mud',
    x: 485,
    y: 320,
    radius: 22,
    label: ''
  },
  {
    id: 'mud-2',
    type: 'mud',
    x: 180,
    y: 135,
    radius: 22,
    label: ''
  },
  // Speed Boosters with custom driving directions pointing along the track
  {
    id: 'boost-1',
    type: 'booster',
    x: 470,
    y: 80,
    width: 40,
    height: 25,
    angle: 0, // Points horizontally left-to-right inline with top straightaway
    label: 'BOOST'
  },
  {
    id: 'boost-2',
    type: 'booster',
    x: 620,
    y: 140,
    width: 35,
    height: 35,
    angle: Math.PI * 0.28, // Points tangentially along right track curve
    label: 'BOOST'
  }
];

export default function App() {
  const [activeChallengeId, setActiveChallengeId] = useState<ChallengeId>('free');
  const [telemetryPoints, setTelemetryPoints] = useState<TelemetryPoint[]>([]);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  
  // Driving States
  const [isRecording, setIsRecording] = useState<boolean>(false); // Starts as false until user starts driving
  const [currentCarState, setCurrentCarState] = useState<CarState>('stopped');
  const [currentVelocity, setCurrentVelocity] = useState<number>(0);
  const [currentDistance, setCurrentDistance] = useState<number>(0);
  const [currentDisplacement, setCurrentDisplacement] = useState<number>(0);
  const [hasSensorNoise, setHasSensorNoise] = useState<boolean>(false);
  const [lapsCount, setLapsCount] = useState<number>(0);

  // Active Educational Challenge
  const activeChallenge = useMemo(() => {
    return CHALLENGES.find((c) => c.id === activeChallengeId) || CHALLENGES[0];
  }, [activeChallengeId]);

  // Evaluate active challenge progress in real-time
  const challengeEvaluation = useMemo(() => {
    return activeChallenge.evaluate(telemetryPoints);
  }, [activeChallenge, telemetryPoints]);

  // Handle telemetry emitted from Track physics loop
  const handleEmitTelemetry = React.useCallback(
    (distance: number, velocity: number, acceleration: number, state: CarState, x: number, y: number) => {
      setCurrentDistance(distance);
      setCurrentVelocity(velocity);
      setCurrentCarState(state);

      // Compute displacement from start position (420, 320) styled with 0.1 multiplier
      const dx = x - 420;
      const dy = y - 320;
      const displayDisplacement = Math.sqrt(dx * dx + dy * dy) * 0.1;
      setCurrentDisplacement(displayDisplacement);

      if (!isRecording) {
        // If the player starts driving (velocity exceeds threshold), auto-start recording!
        if (Math.abs(velocity) > 0.15 && lapsCount < 3) {
          setIsRecording(true);
        } else {
          return;
        }
      }

      setTelemetryPoints((prev) => {
        const lastPoint = prev[prev.length - 1];
        const nextTime = lastPoint ? lastPoint.time + 0.15 : 0; // Each telemetry interval is ~150ms
        
        const newPoint: TelemetryPoint = {
          id: Math.random().toString(36).substring(2, 9),
          time: Number(nextTime.toFixed(2)),
          distance: Number(distance.toFixed(1)),
          displacement: Number(displayDisplacement.toFixed(1)),
          velocity: Number(velocity.toFixed(2)),
          acceleration: Number(acceleration.toFixed(2)),
          state,
          x,
          y
        };
        return [...prev, newPoint];
      });
    },
    [isRecording]
  );

  // Auto-pause telemetry stream and graph on completing 3 laps
  useEffect(() => {
    if (lapsCount >= 3) {
      setIsRecording(false);
    }
  }, [lapsCount]);

  // Clear graphing logs and wait for the player to begin driving to resume recording
  const handleClearData = () => {
    setTelemetryPoints([]);
    setHoveredIndex(null);
    setIsRecording(false);
  };

  // Change challenge mode & clear active graphs for fair tests
  const handleSelectChallenge = (id: ChallengeId) => {
    setActiveChallengeId(id);
    handleClearData();
  };

  // Reset challenge parameters
  const handleResetChallenge = () => {
    handleClearData();
  };

  // Extract hovered coordinate of vehicle
  const hoveredPoint = useMemo(() => {
    if (hoveredIndex === null || hoveredIndex < 0 || hoveredIndex >= telemetryPoints.length) {
      return null;
    }
    return telemetryPoints[hoveredIndex];
  }, [hoveredIndex, telemetryPoints]);

  return (
    <div className="min-h-screen bg-slate-950 bg-grid-pattern text-slate-200 flex flex-col justify-between select-none p-4 md:p-6" id="root-app">
      
      {/* Dynamic Background Glow Rings */}
      <div className="absolute top-0 left-0 w-full h-[600px] overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-250px] left-[15%] w-[550px] h-[550px] bg-cyan-600/15 rounded-full blur-[140px]" />
        <div className="absolute top-[-100px] right-[20%] w-[450px] h-[450px] bg-emerald-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col gap-6">
        
        {/* Main Title Header Workspace - Immersive UI HUD Bar */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-900/60 border border-white/10 rounded-2xl p-6 gap-6 shadow-xl relative overflow-hidden backdrop-blur-md">
          
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-cyan-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.45)] shrink-0 border border-white/20">
              <Compass className="w-7 h-7 text-slate-950 animate-spin-slow" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="bg-cyan-500/10 text-cyan-400 text-[10px] px-2 py-0.5 rounded-full font-bold border border-cyan-500/25 tracking-widest uppercase flex items-center gap-1">
                  <Gauge className="h-3 w-3" />
                  Kinetics Engine v2.0
                </span>
                <span className="bg-emerald-500/10 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-bold border border-emerald-500/25 tracking-widest uppercase flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Live Derivative
                </span>
              </div>
              <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight text-white leading-none">
                Velocity <span className="text-cyan-400 shadow-sm">Lab</span>
              </h1>
            </div>
          </div>

          {/* Immersive HUD stats dashboard */}
          <div className="flex items-center gap-8 bg-slate-950/60 border border-white/5 py-2.5 px-6 rounded-xl shrink-0 self-stretch md:self-auto justify-around md:justify-end">
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-extrabold font-sans">Live Distance</span>
              <span className="text-2xl font-semibold font-mono text-cyan-400 tracking-tight">
                {currentDistance.toFixed(2)}<span className="text-xs ml-0.5 opacity-60">m</span>
              </span>
            </div>
            <div className="w-[1.5px] h-9 bg-white/10" />
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-extrabold font-sans">Simulation Time</span>
              <span className="text-2xl font-semibold font-mono text-white tracking-tight">
                {(telemetryPoints.length > 0 ? telemetryPoints[telemetryPoints.length - 1].time : 0).toFixed(2)}<span className="text-xs ml-0.5 opacity-60">s</span>
              </span>
            </div>
          </div>
        </header>

        {/* Activity Selection Row Tabs - Cyan Themed */}
        <nav className="bg-slate-900/45 border border-white/5 rounded-2xl p-2.5 shadow-md flex overflow-x-auto justify-start gap-1 custom-scrollbar" id="challenge-navigator">
          <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider px-3.5 self-center mr-1 hidden sm:inline">
            Learning Labs:
          </span>
          {CHALLENGES.map((challenge) => {
            const isSelected = activeChallengeId === challenge.id;
            
            // Icon mapping
            let tabIcon = <Compass className="h-4 w-4 shrink-0" />;
            if (challenge.id === 'constant') tabIcon = <Gauge className="h-4 w-4 shrink-0" />;
            if (challenge.id === 'slogger') tabIcon = <AlertTriangle className="h-4 w-4 shrink-0" />;
            if (challenge.id === 'speedy') tabIcon = <Zap className="h-4 w-4 shrink-0" />;
            if (challenge.id === 'stopgo') tabIcon = <Sparkles className="h-4 w-4 shrink-0" />;

            return (
              <button
                key={challenge.id}
                onClick={() => handleSelectChallenge(challenge.id)}
                className={`cursor-pointer px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shrink-0 border uppercase font-mono tracking-wider ${
                  isSelected
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-lg shadow-cyan-500/5'
                    : 'bg-slate-900/20 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border-transparent hover:border-white/5'
                }`}
              >
                {tabIcon}
                <span>{challenge.title}</span>
                {challenge.id !== 'free' && (
                  <span className={`text-[9px] px-1 bg-slate-950/60 rounded border ${
                    isSelected ? 'text-cyan-200 border-cyan-400/30' : 'text-slate-500 border-slate-800'
                  }`}>
                    Test
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Play Area / Telemetry Grid Layout - Desktop bento split flow */}
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" id="simulation-mesh">
          
          {/* Main Visual Arena column spanning 8 of 12 grid blocks */}
          <section className="lg:col-span-8 flex flex-col gap-6" id="canvas-and-charts">
            
            {/* Top-Down Race Track Canvas */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
            >
              <TrackCanvas
                onEmitTelemetry={handleEmitTelemetry}
                hoveredPoint={hoveredPoint}
                obstacles={SIMULATION_OBSTACLES}
                isRecording={isRecording}
                onSetLaps={setLapsCount}
                lapsCount={lapsCount}
                onReset={handleClearData}
              />
            </motion.div>

            {/* Dynamic Real-time Telemetry Graphs */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.08 }}
            >
              <TelemetryGraphs
                points={telemetryPoints}
                hoveredIndex={hoveredIndex}
                onHoverIndex={setHoveredIndex}
                carState={currentCarState}
                currentVelocity={currentVelocity}
                currentDistance={currentDistance}
                currentDisplacement={currentDisplacement}
                onClearData={handleClearData}
                isRecording={isRecording}
                onToggleRecording={() => setIsRecording(!isRecording)}
                hasSensorNoise={hasSensorNoise}
                onToggleSensorNoise={() => setHasSensorNoise(!hasSensorNoise)}
              />
            </motion.div>
          </section>

          {/* Educational & Theoretical Side column spanning 4 coordinates */}
          <section className="lg:col-span-4 h-full" id="academic-panel">
            <EducationalPanel
              activeChallenge={activeChallenge}
              telemetryPoints={telemetryPoints}
              challengeEvaluation={challengeEvaluation}
              onResetChallenge={handleResetChallenge}
            />
          </section>
        </main>
      </div>

      {/* Tactile instrument status bar footer */}
      <footer className="mt-12 bg-slate-900/40 border border-white/5 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-500 font-medium gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.9)]" />
            <span className="text-[10px] tracking-wider font-bold text-slate-400 uppercase font-mono">Telemetry Grip: 100%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
            <span className="text-[10px] tracking-wider font-bold text-slate-400 uppercase font-mono">Engine: Nominal</span>
          </div>
        </div>
        <div className="text-center sm:text-right font-mono text-[10px] text-slate-400">
          Velocity Lab &bull; top-down vectors &bull; rate of change solver
        </div>
      </footer>
    </div>
  );
}
