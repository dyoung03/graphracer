import React, { useRef, useState } from 'react';
import { TelemetryPoint, CarState } from '../types';
import { LineChart, Gauge, Target, Compass, Sparkles, Sliders } from 'lucide-react';

interface TelemetryGraphsProps {
  points: TelemetryPoint[];
  hoveredIndex: number | null;
  onHoverIndex: (index: number | null) => void;
  carState: CarState;
  currentVelocity: number;
  currentDistance: number;
  currentDisplacement: number;
  onClearData: () => void;
  isRecording: boolean;
  onToggleRecording: () => void;
  hasSensorNoise: boolean;
  onToggleSensorNoise: () => void;
}

export default function TelemetryGraphs({
  points,
  hoveredIndex,
  onHoverIndex,
  carState,
  currentVelocity,
  currentDistance,
  currentDisplacement,
  onClearData,
  isRecording,
  onToggleRecording,
  hasSensorNoise,
  onToggleSensorNoise
}: TelemetryGraphsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'distance' | 'displacement' | 'velocity'>('all');

  // Colors mapping for car states
  const getStateColor = (state: CarState, opacity: number = 1): string => {
    switch (state) {
      case 'boost':
        return `rgba(16, 185, 129, ${opacity})`; // emerald-500
      case 'mud':
        return `rgba(180, 83, 9, ${opacity})`; // amber-700 / brown
      case 'offtrack':
        return `rgba(245, 158, 11, ${opacity})`; // amber-500
      case 'stopped':
        return `rgba(239, 68, 68, ${opacity})`; // red-500
      case 'normal':
      default:
        return `rgba(6, 182, 212, ${opacity})`; // cyan-500 (Cruising)
    }
  };

  const getStateLabel = (state: CarState): string => {
    switch (state) {
      case 'boost': return 'Speed Rocket (Boosted)';
      case 'mud': return 'Mud Pit (High Friction)';
      case 'offtrack': return 'Off-Track (Grass)';
      case 'stopped': return 'Stopped (Zero Velocity)';
      case 'normal':
      default:
        return 'Cruising (Paved Asphalt)';
    }
  };

  // Dimensions
  const padding = { top: 20, right: 30, bottom: 35, left: 55 };
  const width = 640;
  const height = activeTab === 'all' ? 140 : 280; // height for a single plot

  // Calculate scales based on current data
  const maxTime = Math.max(15, points.length > 0 ? points[points.length - 1].time : 15);
  const maxDist = Math.max(50, points.length > 0 ? points[points.length - 1].distance : 50);
  const maxVel = 10.5; // Fixed so scale doesn't bounce, gives instant visual calibration

  // Scaling helper functions
  const getX = (t: number) => {
    return padding.left + (t / maxTime) * (width - padding.left - padding.right);
  };

  const getYDist = (d: number) => {
    const plotHeight = height - padding.top - padding.bottom;
    return padding.top + plotHeight - (d / maxDist) * plotHeight;
  };

  const getYDisp = (disp: number) => {
    const plotHeight = height - padding.top - padding.bottom;
    const clampedDisp = Math.max(0, Math.min(35, disp));
    return padding.top + plotHeight - (clampedDisp / 35) * plotHeight;
  };

  const getYVel = (v: number) => {
    const plotHeight = height - padding.top - padding.bottom;
    const clampedV = Math.max(0, Math.min(maxVel, v));
    return padding.top + plotHeight - (clampedV / maxVel) * plotHeight;
  };

  // Noise perturbation for visualization if toggled
  const addNoise = (val: number, amp: number = 0.25): number => {
    if (!hasSensorNoise) return val;
    // Pseudorandom static seed based on coordinates and index to avoid re-renders spinning wildly
    return val + (Math.sin(val * 4.3 + amp * 12.5) * amp);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>, plotType: 'dist' | 'disp' | 'vel') => {
    if (points.length === 0) return;
    const svgRect = e.currentTarget.getBoundingClientRect();
    const cursorX = e.clientX - svgRect.left;

    // Map physical SVG X back to time
    const plotWidth = width - padding.left - padding.right;
    const percentage = (cursorX - padding.left) / plotWidth;
    const targetTime = percentage * maxTime;

    // Find the point closest in time
    let closestIndex = 0;
    let minDiff = Infinity;

    for (let i = 0; i < points.length; i++) {
      const diff = Math.abs(points[i].time - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }

    // Safety bounds check
    if (cursorX >= padding.left && cursorX <= width - padding.right) {
      onHoverIndex(closestIndex);
    } else {
      onHoverIndex(null);
    }
  };

  const handleMouseLeave = () => {
    onHoverIndex(null);
  };

  // Render Grid Lines
  const renderGridLines = (scaleType: 'dist' | 'disp' | 'vel') => {
    const lines = [];
    const ticksX = 6;
    const ticksY = 5;
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    // Vertical time gridlines
    for (let i = 0; i <= ticksX; i++) {
      const xVal = (i / ticksX) * maxTime;
      const x = getX(xVal);
      lines.push(
        <g key={`x-${scaleType}-${i}`} className="opacity-15">
          <line
            x1={x}
            y1={padding.top}
            x2={x}
            y2={height - padding.bottom}
            stroke="#94a3b8"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <text
            x={x}
            y={height - padding.bottom + 18}
            fill="#94a3b8"
            fontSize="10"
            fontFamily="monospace"
            textAnchor="middle"
          >
            {xVal.toFixed(0)}s
          </text>
        </g>
      );
    }

    // Horizontal Y gridlines
    for (let i = 0; i <= ticksY; i++) {
      const ratio = i / ticksY;
      const y = padding.top + plotHeight - ratio * plotHeight;
      let yValLabel = '';
      if (scaleType === 'dist') {
        yValLabel = (ratio * maxDist).toFixed(0) + ' m';
      } else if (scaleType === 'disp') {
        yValLabel = (ratio * 35).toFixed(0) + ' m';
      } else {
        yValLabel = (ratio * maxVel).toFixed(1) + ' m/s';
      }

      lines.push(
        <g key={`y-${scaleType}-${i}`} className="opacity-15">
          <line
            x1={padding.left}
            y1={y}
            x2={width - padding.right}
            y2={y}
            stroke="#94a3b8"
            strokeWidth="1"
          />
          <text
            x={padding.left - 8}
            y={y + 4}
            fill="#94a3b8"
            fontSize="10"
            fontFamily="monospace"
            textAnchor="end"
          >
            {yValLabel}
          </text>
        </g>
      );
    }

    return lines;
  };

  const hoveredPoint = hoveredIndex !== null && hoveredIndex >= 0 && hoveredIndex < points.length ? points[hoveredIndex] : null;

  return (
    <div className="flex flex-col bg-slate-900/60 border border-white/10 rounded-2xl overflow-hidden shadow-2xl p-6 backdrop-blur-md" id="telemetry-dashboard">
      {/* Header controls & dashboard readouts */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-white/5 pb-4 mb-4 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-white tracking-tight uppercase font-sans">Telemetry Analytical Engine</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Linked Real-time Graphing & Calculus Workspace</p>
        </div>

        {/* Live dials */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 bg-slate-950/40 p-2.5 rounded-xl border border-white/5 self-stretch sm:self-auto justify-around">
          <div className="text-center px-2">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5 font-mono">Distance</span>
            <span className="text-sm font-bold text-cyan-400 font-mono">
              {currentDistance.toFixed(1)} <span className="text-[10px] text-slate-500">m</span>
            </span>
          </div>
          <div className="w-[1px] h-6 bg-white/10" />
          <div className="text-center px-2">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5 font-mono">Displac. (Vector)</span>
            <span className="text-sm font-bold text-purple-400 font-mono">
              {currentDisplacement.toFixed(1)} <span className="text-[10px] text-slate-500">m</span>
            </span>
          </div>
          <div className="w-[1px] h-6 bg-white/10" />
          <div className="text-center px-2">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5 font-mono">Velocity</span>
            <span className="text-sm font-bold text-emerald-400 font-mono flex items-center gap-1 justify-center">
              <span className="h-2 w-2 rounded-full inline-block animate-pulse shrink-0" style={{ backgroundColor: getStateColor(carState) }} />
              {currentVelocity.toFixed(1)} <span className="text-[10px] text-slate-500">m/s</span>
            </span>
          </div>
          <div className="w-[1px] h-6 bg-white/10" />
          <div className="text-center px-1.5 min-w-[70px]">
            <span className="text-[11px] font-bold text-amber-500 font-mono block leading-none">
              {carState === 'normal' ? 'ASPHALT' : carState.toUpperCase()}
            </span>
            <span className="text-[9px] text-slate-500 block mt-0.5 font-sans">Surface</span>
          </div>
        </div>
      </div>

      {/* Buttons toolbar */}
      <div className="flex flex-wrap items-center justify-between mb-4 gap-3 bg-slate-950/20 p-2 rounded-lg border border-white/5">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleRecording}
            className={`cursor-pointer px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              isRecording
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-lg shadow-cyan-500/5'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <span className={`h-2 w-2 rounded-full bg-cyan-400 grow-0 shrink-0 ${isRecording ? 'animate-pulse shadow-[0_0_8px_rgba(6,182,212,1)]' : ''}`} />
            {isRecording ? 'Pause Graph' : 'Record Graph'}
          </button>
          
          <button
            onClick={onClearData}
            disabled={points.length === 0}
            className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-950 hover:bg-slate-900 border border-white/5 text-slate-300 disabled:opacity-40 transition-all"
          >
            Clear Data
          </button>
        </div>

        {/* Graph Tabs */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-950 rounded-md p-1 border border-white/5">
          <button
            onClick={() => setActiveTab('all')}
            className={`cursor-pointer px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${activeTab === 'all' ? 'bg-cyan-500/25 text-cyan-300' : 'text-slate-400 hover:text-white'}`}
          >
            All Plots
          </button>
          <button
            onClick={() => setActiveTab('distance')}
            className={`cursor-pointer px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${activeTab === 'distance' ? 'bg-cyan-500/25 text-cyan-300' : 'text-slate-400 hover:text-white'}`}
          >
            Distance-Time
          </button>
          <button
            onClick={() => setActiveTab('displacement')}
            className={`cursor-pointer px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${activeTab === 'displacement' ? 'bg-cyan-500/25 text-cyan-300' : 'text-slate-400 hover:text-white'}`}
          >
            Displacement-Time
          </button>
          <button
            onClick={() => setActiveTab('velocity')}
            className={`cursor-pointer px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${activeTab === 'velocity' ? 'bg-cyan-500/25 text-cyan-300' : 'text-slate-400 hover:text-white'}`}
          >
            Velocity-Time
          </button>
        </div>

        {/* GPS Noise Toggle */}
        <button
          onClick={onToggleSensorNoise}
          className={`cursor-pointer p-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 border transition-all ${
            hasSensorNoise
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/35'
              : 'bg-slate-950 text-slate-400 border-white/5 hover:bg-slate-900 hover:border-white/10'
          }`}
          title="Add artificial high-frequency telemetry jitter representing realistic GPS / sensor noise."
        >
          <Sliders className="h-3.5 w-3.5 text-cyan-400" strokeWidth={2.5} />
          <span className="hidden sm:inline font-sans text-[11px] font-semibold">Sensor Noise Jitter</span>
          <span className="text-[10px] px-1 bg-slate-900 rounded font-bold border border-white/5 font-mono text-cyan-400">
            {hasSensorNoise ? 'Active' : 'Off'}
          </span>
        </button>
      </div>

      {/* Drawing the charts */}
      <div className="flex-1 w-full bg-slate-950 rounded-xl border border-white/5 overflow-hidden select-none" ref={containerRef}>
        {/* SVG Container wrapping rendering */}
        <div className="relative w-full overflow-x-auto custom-scrollbar flex flex-col items-center">
          <svg
            width={width}
            height={activeTab === 'all' ? height * 3 : height}
            viewBox={`0 0 ${width} ${activeTab === 'all' ? height * 3 : height}`}
            className="block"
          >
            {/* DEF definitions for glows / gradients */}
            <defs>
              <linearGradient id="grid-glow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#0f172a" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* PLOT 1: DISTANCE VS TIME */}
            {(activeTab === 'all' || activeTab === 'distance') && (
              <g transform="translate(0, 0)" onMouseMove={(e) => handleMouseMove(e, 'dist')} onMouseLeave={handleMouseLeave}>
                {/* Background tint */}
                <rect x={padding.left} y={padding.top} width={width - padding.left - padding.right} height={height - padding.top - padding.bottom} fill="url(#grid-glow)" />
                
                {/* Gridlines */}
                {renderGridLines('dist')}

                {/* Plot Title */}
                <text x={padding.left + 10} y={padding.top + 18} fill="#ffffff" fontWeight="bold" fontSize="11" opacity="0.65">
                  y: Distance Travelled (m) VS x: Elapsed Time (s)
                </text>

                {/* Multi-Colored Segmented Distance Line */}
                {points.length > 1 && (
                  <g>
                    {points.slice(0, -1).map((p, i) => {
                      const nextPoint = points[i + 1];
                      const x1 = getX(p.time);
                      const y1 = getYDist(addNoise(p.distance, 0.4));
                      const x2 = getX(nextPoint.time);
                      const y2 = getYDist(addNoise(nextPoint.distance, 0.4));
                      const stateColor = getStateColor(p.state);

                      return (
                        <line
                          key={`dist-line-${i}`}
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke={stateColor}
                          strokeWidth="3.2"
                          strokeLinecap="round"
                        />
                      );
                    })}
                  </g>
                )}

                {/* Zero State Hint */}
                {points.length === 0 && (
                  <text x={width / 2 + 10} y={height / 2} fill="#64748b" fontSize="12" textAnchor="middle" fontStyle="italic">
                    Drive around the track to draw graphs in real-time!
                  </text>
                )}

                {/* Sub-indicator/Crosshair */}
                {hoveredPoint && (
                  <g>
                    <line
                      x1={getX(hoveredPoint.time)}
                      y1={padding.top}
                      x2={getX(hoveredPoint.time)}
                      y2={height - padding.bottom}
                      stroke="#06b6d4"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                      className="opacity-70"
                    />
                    <circle
                      cx={getX(hoveredPoint.time)}
                      cy={getYDist(hoveredPoint.distance)}
                      r="6.5"
                      fill={getStateColor(hoveredPoint.state)}
                      stroke="#ffffff"
                      strokeWidth="2.5"
                      className="shadow-lg"
                    />
                  </g>
                )}
              </g>
            )}

            {/* PLOT 3: DISPLACEMENT VS TIME */}
            {(activeTab === 'all' || activeTab === 'displacement') && (
              <g 
                transform={activeTab === 'all' ? `translate(0, ${height})` : 'translate(0, 0)'}
                onMouseMove={(e) => handleMouseMove(e, 'disp')}
                onMouseLeave={handleMouseLeave}
              >
                {/* Background tint */}
                <rect x={padding.left} y={padding.top} width={width - padding.left - padding.right} height={height - padding.top - padding.bottom} fill="url(#grid-glow)" />
                
                {/* Gridlines */}
                {renderGridLines('disp')}

                {/* Plot Title */}
                <text x={padding.left + 10} y={padding.top + 18} fill="#ffffff" fontWeight="bold" fontSize="11" opacity="0.65">
                  y: Straight-line Displacement from Start Coordinate (m) VS x: Time (s)
                </text>

                {/* Displacement Line */}
                {points.length > 1 && (
                  <g>
                    {points.slice(0, -1).map((p, i) => {
                      const nextPoint = points[i + 1];
                      const x1 = getX(p.time);
                      const y1 = getYDisp(addNoise(p.displacement ?? 0, 0.4));
                      const x2 = getX(nextPoint.time);
                      const y2 = getYDisp(addNoise(nextPoint.displacement ?? 0, 0.4));
                      
                      // Highlight surface modifications, styling displacement with bright purple hues
                      const baseColor = getStateColor(p.state);
                      const strokeColor = p.state === 'normal' ? '#a855f7' : baseColor;

                      return (
                        <line
                          key={`disp-line-${i}`}
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke={strokeColor}
                          strokeWidth="3.2"
                          strokeLinecap="round"
                        />
                      );
                    })}
                  </g>
                )}

                {/* Zero State Hint */}
                {points.length === 0 && (
                  <text x={width / 2 + 10} y={height / 2} fill="#64748b" fontSize="12" textAnchor="middle" fontStyle="italic">
                    Displacement tracks distance straight back to the original start-line coordinates.
                  </text>
                )}

                {/* Sub-indicator/Crosshair */}
                {hoveredPoint && (
                  <g>
                    <line
                      x1={getX(hoveredPoint.time)}
                      y1={padding.top}
                      x2={getX(hoveredPoint.time)}
                      y2={height - padding.bottom}
                      stroke="#06b6d4"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                      className="opacity-70"
                    />
                    <circle
                      cx={getX(hoveredPoint.time)}
                      cy={getYDisp(hoveredPoint.displacement ?? 0)}
                      r="6.5"
                      fill={hoveredPoint.state === 'normal' ? '#a855f7' : getStateColor(hoveredPoint.state)}
                      stroke="#ffffff"
                      strokeWidth="2.5"
                      className="shadow-lg"
                    />
                  </g>
                )}
              </g>
            )}

            {/* PLOT 2: VELOCITY VS TIME */}
            {(activeTab === 'all' || activeTab === 'velocity') && (
              <g 
                transform={activeTab === 'all' ? `translate(0, ${height * 2})` : 'translate(0, 0)'}
                onMouseMove={(e) => handleMouseMove(e, 'vel')}
                onMouseLeave={handleMouseLeave}
              >
                {/* Background tint */}
                <rect x={padding.left} y={padding.top} width={width - padding.left - padding.right} height={height - padding.top - padding.bottom} fill="url(#grid-glow)" />

                {/* Gridlines */}
                {renderGridLines('vel')}

                {/* Plot Title */}
                <text x={padding.left + 10} y={padding.top + 18} fill="#ffffff" fontWeight="bold" fontSize="11" opacity="0.65">
                  y: Velocity rate of change (m/s) VS x: Elapsed Time (s)
                </text>

                {/* Multi-Colored Segmented Velocity Line */}
                {points.length > 1 && (
                  <g>
                    {points.slice(0, -1).map((p, i) => {
                      const nextPoint = points[i + 1];
                      const x1 = getX(p.time);
                      const y1 = getYVel(addNoise(p.velocity, 0.12));
                      const x2 = getX(nextPoint.time);
                      const y2 = getYVel(addNoise(nextPoint.velocity, 0.12));
                      const stateColor = getStateColor(p.state);

                      return (
                        <line
                          key={`vel-line-${i}`}
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke={stateColor}
                          strokeWidth="3.2"
                          strokeLinecap="round"
                        />
                      );
                    })}
                  </g>
                )}

                {/* Zero State Hint */}
                {points.length === 0 && (
                  <text x={width / 2 + 10} y={height / 2} fill="#64748b" fontSize="12" textAnchor="middle" fontStyle="italic">
                    Velocity (speed) will map the slope of the distance curve.
                  </text>
                )}

                {/* Crosshair linkages */}
                {hoveredPoint && (
                  <g>
                    <line
                      x1={getX(hoveredPoint.time)}
                      y1={padding.top}
                      x2={getX(hoveredPoint.time)}
                      y2={height - padding.bottom}
                      stroke="#06b6d4"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                      className="opacity-70"
                    />
                    <circle
                      cx={getX(hoveredPoint.time)}
                      cy={getYVel(hoveredPoint.velocity)}
                      r="6.5"
                      fill={getStateColor(hoveredPoint.state)}
                      stroke="#ffffff"
                      strokeWidth="2.5"
                      className="shadow"
                    />
                  </g>
                )}
              </g>
            )}
          </svg>
        </div>
      </div>

      {/* Link Hover Info Cards */}
      {hoveredPoint ? (
        <div className="mt-3.5 bg-slate-950 p-4 rounded-xl border border-cyan-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 animate-fadeIn">
          {/* Linked coordinates readout */}
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs bg-cyan-500/20 text-cyan-300 font-bold px-2 py-0.5 rounded-full font-mono">
                TELEMETRY SLOP CLAMP
              </span>
              <span className="text-xs font-semibold" style={{ color: getStateColor(hoveredPoint.state) }}>
                {getStateLabel(hoveredPoint.state)}
              </span>
            </div>
            
            <div className="flex flex-wrap items-center gap-4 text-xs tracking-wide">
              <span>Time: <strong className="font-mono text-white text-sm">{hoveredPoint.time.toFixed(2)}s</strong></span>
              <span className="text-slate-600">|</span>
              <span>Distance: <strong className="font-mono text-white text-sm">{hoveredPoint.distance.toFixed(1)}m</strong></span>
              <span className="text-slate-600">|</span>
              <span>Displacement: <strong className="font-mono text-purple-300 text-sm">{hoveredPoint.displacement?.toFixed(1) ?? '0.0'}m</strong></span>
              <span className="text-slate-600">|</span>
              <span>Velocity (Slope): <strong className="font-mono text-white text-sm">{hoveredPoint.velocity.toFixed(2)} m/s</strong></span>
              <span className="text-slate-600">|</span>
              <span>Acc: <strong className="font-mono text-white text-sm">{hoveredPoint.acceleration.toFixed(2)} m/s²</strong></span>
            </div>
          </div>

          {/* Calculus explanation tooltip for point */}
          <div className="text-xs bg-slate-900 p-2.5 rounded-lg border border-white/5 max-w-sm shrink-0 font-normal leading-relaxed">
            <span className="font-semibold text-cyan-400 block mb-0.5 font-mono text-[10px] uppercase">Calculus Insight:</span>
            At time <span className="font-mono text-white">{hoveredPoint.time.toFixed(1)}s</span>, the instantaneous velocity (slope) of the distance curve is <span className="font-mono text-white font-bold">{hoveredPoint.velocity.toFixed(2)} m/s</span>. While distance accumulates continuously, the vector displacement tracks direct straight-line distance back to the start.
          </div>
        </div>
      ) : (
        <div className="mt-3.5 text-center bg-slate-950/40 py-3 rounded-xl border border-white/5 text-xs text-slate-400 font-sans">
          💡 Pro-tip: Hover your cursor over the telemetry line to see linked tangent curves!
        </div>
      )}

      {/* Legend Map */}
      <div className="flex flex-wrap justify-center items-center gap-4 mt-4 text-xs font-medium border-t border-white/5 pt-3">
        <span className="text-slate-400 uppercase tracking-wider text-[10px] font-mono">Legend:</span>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-1.5 rounded bg-cyan-400 inline-block shadow-[0_0_6px_rgba(6,182,212,0.6)]" />
          <span className="text-slate-300 font-mono text-[11px]">Asphalt (Normal)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-1.5 rounded bg-purple-500 inline-block shadow-[0_0_6px_rgba(168,85,247,0.6)]" />
          <span className="text-slate-300 font-mono text-[11px]">Vector Displacement</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-1.5 rounded bg-amber-750 inline-block" style={{ backgroundColor: 'rgb(180, 83, 9)' }} />
          <span className="text-slate-300 font-mono text-[11px]">Mud (High Friction)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-1.5 rounded bg-emerald-500 inline-block" />
          <span className="text-slate-300 font-mono text-[11px]">Speed Booster</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-1.5 rounded bg-amber-500 inline-block" />
          <span className="text-slate-300 font-mono text-[11px]">Off-track Grass</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-1.5 rounded bg-red-500 inline-block" />
          <span className="text-slate-300 font-mono text-[11px]">Stopped</span>
        </div>
      </div>
    </div>
  );
}
