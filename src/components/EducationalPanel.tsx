import React, { useState } from 'react';
import { TelemetryPoint, Challenge } from '../types';
import { HelpCircle, ChevronRight, Calculator, RefreshCw, Trophy, LineChart, Award, AlertCircle } from 'lucide-react';

interface EducationalPanelProps {
  activeChallenge: Challenge;
  telemetryPoints: TelemetryPoint[];
  challengeEvaluation: { success: boolean; progress: number; message: string };
  onResetChallenge: () => void;
  onSelectTimeRange?: (t1: number, t2: number) => void;
}

export default function EducationalPanel({
  activeChallenge,
  telemetryPoints,
  challengeEvaluation,
  onResetChallenge,
}: EducationalPanelProps) {
  const [selectedT1, setSelectedT1] = useState<number>(0);
  const [selectedT2, setSelectedT2] = useState<number>(Math.min(5, Math.ceil(telemetryPoints.length * 0.15)));
  const [showSlopeCalc, setShowSlopeCalc] = useState(true);

  // Filter valid choices
  const maxTime = telemetryPoints.length > 0 ? telemetryPoints[telemetryPoints.length - 1].time : 0;
  
  // Find point closest to t
  const getPointAtTime = (t: number) => {
    if (telemetryPoints.length === 0) return null;
    return telemetryPoints.reduce((prev, curr) => {
      return Math.abs(curr.time - t) < Math.abs(prev.time - t) ? curr : prev;
    });
  };

  const p1 = getPointAtTime(selectedT1);
  const p2 = getPointAtTime(selectedT2);

  // Slope / average velocity calculation
  let avgVelocity = 0;
  let d_diff = 0;
  let t_diff = 0;
  const canCalculate = p1 && p2 && p1.id !== p2.id && selectedT2 > selectedT1;

  if (canCalculate && p1 && p2) {
    d_diff = p2.distance - p1.distance;
    t_diff = p2.time - p1.time;
    avgVelocity = d_diff / t_diff;
  }

  // Handle setting nice defaults when telemetry mounts
  React.useEffect(() => {
    if (telemetryPoints.length > 5 && maxTime > 0) {
      setSelectedT1(Math.max(0, Math.floor(maxTime * 0.25)));
      setSelectedT2(Math.floor(maxTime * 0.75));
    }
  }, [telemetryPoints.length === 0]);

  return (
    <div className="flex flex-col h-full bg-slate-900/60 border border-white/10 rounded-2xl overflow-hidden shadow-2xl p-6 text-slate-200 font-sans backdrop-blur-md" id="educational-sidebar">
      {/* Challenge Status Top Area */}
      <div className="mb-6 bg-slate-950/60 p-4 border border-cyan-505 border-cyan-500/25 rounded-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Trophy className={`h-5 w-5 ${challengeEvaluation.success ? 'text-cyan-400 fill-cyan-400/20' : 'text-slate-400'}`} />
            <h3 className="font-semibold text-sm tracking-wider uppercase text-cyan-400 font-mono text-[11px]">Current Objective</h3>
          </div>
          {challengeEvaluation.success && (
            <span className="bg-emerald-500/10 text-emerald-400 text-xs px-2.5 py-0.5 rounded-full font-medium border border-emerald-500/20 flex items-center gap-1 animate-pulse">
              <Award className="h-3.5 w-3.5" />
              Completed!
            </span>
          )}
        </div>
        
        <h4 className="text-lg font-bold text-white mb-1 uppercase tracking-tight">{activeChallenge.title}</h4>
        <p className="text-slate-300 text-xs leading-relaxed mb-3">{activeChallenge.description}</p>
        
        <div className="bg-slate-900/80 rounded-lg p-3 border border-white/5 text-xs mb-3 text-slate-300 leading-normal">
          <span className="font-semibold text-cyan-400 font-mono block mb-1">STEERING TASK:</span>
          {activeChallenge.instruction}
        </div>

        {/* Challenge Progress */}
        <div className="space-y-2 mt-4">
          <div className="flex justify-between items-center text-xs text-slate-400 font-mono">
            <span>CHALLENGE EVALUATION</span>
            <span>{challengeEvaluation.progress}%</span>
          </div>
          <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-white/5">
            <div 
              className={`h-full transition-all duration-300 ${challengeEvaluation.success ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]'}`}
              style={{ width: `${challengeEvaluation.progress}%` }}
            />
          </div>
          <p className={`text-xs mt-1.5 font-medium ${challengeEvaluation.success ? 'text-emerald-400 animate-fadeIn' : 'text-slate-300'} flex items-start gap-1.5 leading-normal`}>
            {challengeEvaluation.success ? (
              <Trophy className="h-4 w-4 shrink-0 text-yellow-400" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-cyan-400" />
            )}
            <span>{challengeEvaluation.message}</span>
          </p>
        </div>
      </div>

      {/* Physics and Graph Theory Section */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-1 custom-scrollbar">
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3 font-mono">
            <LineChart className="h-4 w-4 text-cyan-400" />
            The Slope Theorem
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed font-sans">
            In any <span className="text-cyan-400 font-semibold font-mono">Distance vs. Time graph</span>, standard time is placed on the horizontal {`(x)`} axis, and distance is on the vertical {`(y)`} axis. 
          </p>
          <p className="text-xs text-slate-300 leading-relaxed mt-2 font-sans">
            The <span className="text-cyan-300 font-semibold underline decoration-wavy decoration-cyan-500/50">slope of the line</span> represents the <span className="font-semibold text-white">Rate of Change</span>—which matches the car&apos;s physical velocity:
          </p>
          <ul className="mt-3 space-y-2 text-xs text-slate-300 bg-slate-950/40 p-3 rounded-lg border border-white/5">
            <li className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 mt-1.5 shrink-0 shadow-[0_0_6px_rgba(6,182,212,0.8)]" />
              <span><strong>Steep Curve:</strong> High velocity (car is driving fast).</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
              <span><strong>Gentle/Shallow:</strong> Low velocity (slowed down in mud or grass).</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0" />
              <span><strong>Flat Line:</strong> Zero velocity (the car is perfectly still!).</span>
            </li>
          </ul>
        </div>

        {/* Concept Box */}
        <div className="p-4 bg-cyan-950/10 rounded-xl border border-cyan-500/20 text-xs text-slate-300 leading-relaxed font-sans">
          <h4 className="text-cyan-400 font-bold uppercase mb-1.5 flex items-center gap-1.5 font-mono">
            <HelpCircle className="h-4 w-4 shrink-0 text-cyan-400" />
            Rate of Change Explained
          </h4>
          Velocity is mathematically defined as <span className="font-mono text-white">v = Δd / Δt</span>. This is the exact definition of a <strong>derivative</strong> in calculus. By studying the steepness of the curves, you are seeing mathematics and physics instantly map onto physical kinetics!
        </div>

        {/* Live Slope Calculator */}
        <div className="bg-slate-950/70 p-4 rounded-xl border border-white/5">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-bold text-xs uppercase text-white flex items-center gap-1.5 font-mono">
              <Calculator className="h-4 w-4 text-cyan-400" />
              Slope Calculator Tool
            </h4>
            <button 
              onClick={() => {
                setSelectedT1(0);
                setSelectedT2(Math.floor(maxTime));
              }}
              disabled={maxTime === 0}
              className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 px-1.5 py-0.5 bg-slate-900 rounded border border-white/5 disabled:opacity-40"
            >
              <RefreshCw className="h-2.5 w-2.5" />
              Reset Range
            </button>
          </div>

          {telemetryPoints.length < 5 ? (
            <p className="text-slate-400 text-xs text-center py-4 italic font-sans font-normal">
              Drive and record telemetry to activate the Slope Calculator!
            </p>
          ) : (
            <div className="space-y-3.5">
              <p className="text-[11px] text-slate-400">
                Select two timestamps on your recorded graph to calculate the **average velocity** (slope of the chord) between them:
              </p>

              {/* Sliders */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono text-slate-400">
                  <span>Start Time (t₁):</span>
                  <span className="text-cyan-300 font-bold">{selectedT1.toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={Math.max(1, maxTime).toString()}
                  step="0.5"
                  value={selectedT1}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setSelectedT1(val);
                    if (val >= selectedT2) setSelectedT2(Math.min(maxTime, val + 1));
                  }}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />

                <div className="flex justify-between text-xs font-mono text-slate-400 mt-2">
                  <span>End Time (t₂):</span>
                  <span className="text-emerald-300 font-bold">{selectedT2.toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={Math.max(1, maxTime).toString()}
                  step="0.5"
                  value={selectedT2}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setSelectedT2(val);
                    if (val <= selectedT1) setSelectedT1(Math.max(0, val - 1));
                  }}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                />
              </div>

              {/* Math Display */}
              {canCalculate && p1 && p2 ? (
                <div className="bg-slate-950/90 p-3 rounded-lg border border-white/5 space-y-2 text-xs font-mono font-medium">
                  <div className="flex justify-between text-slate-400">
                    <span>Point 1 (t₁):</span>
                    <span>d₁ = {p1.distance.toFixed(1)}m at {p1.time.toFixed(1)}s</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Point 2 (t₂):</span>
                    <span>d₂ = {p2.distance.toFixed(1)}m at {p2.time.toFixed(1)}s</span>
                  </div>
                  <div className="h-[1px] bg-white/5 w-full" />
                  
                  <div className="text-center py-2 text-slate-100 font-mono">
                    <div className="text-[10px] text-slate-500 mb-1 flex items-center justify-center gap-1">
                      <span>Slope Equation:</span>
                      <span className="text-cyan-400">Δd / Δt = (d₂ - d₁) / (t₂ - t₁)</span>
                    </div>
                    <div className="font-bold text-sm text-cyan-400 flex items-center justify-center gap-1.5">
                      <span>({p2.distance.toFixed(1)} - {p1.distance.toFixed(1)})m</span>
                      <span>/</span>
                      <span>({p2.time.toFixed(1)} - {p1.time.toFixed(1)})s</span>
                    </div>
                    <div className="text-md font-bold text-white mt-1.5 text-center bg-slate-900 px-2 py-1.5 rounded border border-white/5 flex justify-center items-center gap-2">
                      <span className="text-slate-500 text-[10px] uppercase font-sans">Avg Velocity = </span>
                      <span className="text-cyan-300 font-mono tracking-tight font-black">{avgVelocity.toFixed(2)} m/s</span>
                    </div>
                  </div>
                  
                  <p className="text-[9px] text-slate-500 text-center leading-normal italic font-sans font-normal">
                    This represents the constant velocity the car would need to maintain to cover that exact distance in the same time!
                  </p>
                </div>
              ) : (
                <p className="text-slate-500 text-[10px] italic text-center py-2 font-sans font-normal">
                  Select t₂ strictly greater than t₁ to calculate rates.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
