import { useState, useEffect, useRef } from 'react';
import { Activity, RefreshCw, AlertCircle, Tv2Icon, LineChartIcon, ChevronsUp, ChevronsDown, Mountain } from 'lucide-react';

interface SessionStats {
    startTime: number;
    peakThrottle: number;
    peakBrake: number;
    peakSteering: number;
}

interface HistoryItem {
    throttle: number;
    brake: number;
    steering: number;
}

const SteeringWheel = ({ angle }: { angle: number }) => (
    <div className="relative w-full aspect-square max-w-[200px] mx-auto flex items-center justify-center">

        {/* Rotating Wheel */}
        <div
            className="relative w-4/5 h-4/5 transition-transform duration-75 ease-out flex items-center justify-center"
            style={{ transform: `rotate(${angle}deg)` }}
        >
            <svg viewBox="0 0 100 100" className="w-full h-full absolute inset-0">
                {/* Simplified Outer Ring */}
                <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" className="text-zinc-1000" />
                {/* Top Marker Line */}
                <rect x="48" y="1" width="4" height="8" rx="1" fill="currentColor" className="text-red-600" />
            </svg>
            <Activity className="w-8 h-8 text-red-600 relative z-10" />
        </div>

    </div>
);

export default function SimagicPedalTelemetry() {
    const [throttle, setThrottle] = useState(0);
    const [brake, setBrake] = useState(0);
    const [steering, setSteering] = useState(0);
    const [steeringAngle, setSteeringAngle] = useState(0);
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [connectionStatus, setConnectionStatus] = useState('polling');
    const [lastUpdate, setLastUpdate] = useState(Date.now());
    const [debugInfo, setDebugInfo] = useState<{ name: string; axes: { index: number; value: string }[] } | null>(null);
    const [sessionStats, setSessionStats] = useState<SessionStats>({
        startTime: Date.now(),
        peakThrottle: 0,
        peakBrake: 0,
        peakSteering: 0
    });
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const maxHistory = 200;
    const pollInterval = useRef<number | null>(null);
    const historyInterval = useRef<number | null>(null);

    // Poll for gamepad input
    useEffect(() => {
        const pollGamepads = () => {
            const gamepads = navigator.getGamepads();
            let foundSimagic = false;

            for (let i = 0; i < gamepads.length; i++) {
                const gamepad = gamepads[i];
                if (gamepad && (
                    gamepad.id.toLowerCase().includes('simagic') ||
                    gamepad.id.toLowerCase().includes('p1000') ||
                    gamepad.id.toLowerCase().includes('p2000') ||
                    gamepad.axes.length >= 3 // Likely has pedals
                )) {
                    foundSimagic = true;

                    const throttleAxis = gamepad.axes[1] !== undefined ? gamepad.axes[1] : -1;
                    const brakeAxis = gamepad.axes[2] !== undefined ? gamepad.axes[2] : -1;
                    const steeringAxis = gamepad.axes[0] !== undefined ? gamepad.axes[0] : 0;

                    setDebugInfo({
                        name: gamepad.id,
                        axes: gamepad.axes.map((v, i) => ({ index: i, value: v.toFixed(3) }))
                    });

                    // Avoid 50% initial state if axis hasn't moved yet (0 is default but maps to 50%)
                    const newThrottle = throttleAxis === 0 && throttle === 0 ? 0 : ((throttleAxis + 1) / 2) * 100;
                    const newBrake = brakeAxis === 0 && brake === 0 ? 0 : ((brakeAxis + 1) / 2) * 100;
                    const rawSteeringAngle = steeringAxis * 450;
                    const newSteering = Math.abs(steeringAxis) * 100;

                    setThrottle(newThrottle);
                    setBrake(newBrake);
                    setSteering(newSteering);
                    setSteeringAngle(rawSteeringAngle);

                    // Update session stats with peak values
                    setSessionStats(prev => ({
                        ...prev,
                        peakThrottle: Math.max(prev.peakThrottle, newThrottle),
                        peakBrake: Math.max(prev.peakBrake, newBrake),
                        peakSteering: Math.max(prev.peakSteering, Math.abs(rawSteeringAngle))
                    }));

                    setLastUpdate(Date.now());
                    setConnectionStatus('connected');
                    break;
                }
            }

            if (!foundSimagic && gamepads.some(g => g !== null)) {
                const gamepad = gamepads.find(g => g !== null);
                if (gamepad && gamepad.axes.length >= 2) {
                    const tAxis = gamepad.axes[1] || -1;
                    const bAxis = gamepad.axes[2] || gamepad.axes[0] || 0;
                    const cAxis = gamepad.axes[0] || 0;
                    setThrottle(((1 - tAxis) / 2) * 100);
                    setBrake(((1 - bAxis) / 2) * 100);
                    setSteering(((1 - cAxis) / 2) * 100);
                    setSteeringAngle(cAxis * 450);
                    setLastUpdate(Date.now());
                    setConnectionStatus('connected-generic');
                }
            } else if (!foundSimagic) {
                if (Date.now() - lastUpdate > 2000) {
                    setConnectionStatus('no-device');
                }
            }
        };

        pollInterval.current = setInterval(pollGamepads, 16);

        return () => {
            if (pollInterval.current) {
                clearInterval(pollInterval.current);
            }
        };
    }, [lastUpdate]);

    // Update history continuously for rolling graph
    useEffect(() => {
        historyInterval.current = setInterval(() => {
            setHistory(prev => {
                const newHistory = [...prev, { throttle, brake, steering }];
                if (newHistory.length > maxHistory) {
                    newHistory.shift();
                }
                return newHistory;
            });
        }, 16);

        return () => {
            if (historyInterval.current) {
                clearInterval(historyInterval.current);
            }
        };
    }, [throttle, brake, steering]);

    // Draw enhanced graph with gradients
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Background
        if (ctx) {
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(0, 0, width, height);

            // Grid lines
            ctx.strokeStyle = '#2a2a2a';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 4; i++) {
                const y = (height / 4) * i;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }

            if (history.length < 2) return;
            const xStep = width / (maxHistory - 1);
            const drawAxis = (color: string, dataKey: keyof HistoryItem) => {
                ctx.strokeStyle = color;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                history.forEach((point, i) => {
                    const x = i * xStep;
                    const y = height - (point[dataKey] / 100) * height;
                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                });
                ctx.stroke();
            };

            drawAxis('#00c73cff', 'throttle');
            drawAxis('#ef4444', 'brake');
            drawAxis('#3b82f6', 'steering');
        }
    }, [history]);

    const refresh = () => {
        setConnectionStatus('polling');
        setLastUpdate(Date.now());
    };

    return (
        <div className="min-h-screen bg-black text-white p-4 md:p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8 animate-slide-up">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Activity className="w-10 h-10 text-red-500" />
                        </div>
                        <div>
                            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">SIMMETRIC</h1>
                            <p className="text-sm text-zinc-500">Simagic Pedal Telemetry</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full transition-smooth ${connectionStatus === 'connected' ? 'bg-green-500' :
                                connectionStatus === 'connected-generic' ? 'bg-yellow-500' :
                                    connectionStatus === 'polling' ? 'bg-blue-500 animate-pulse' :
                                        'bg-red-500'
                                }`} />
                            <span className="text-sm text-zinc-400 hidden md:inline">
                                {connectionStatus === 'connected' ? 'Pedals Connected' :
                                    connectionStatus === 'connected-generic' ? 'Gamepad Connected' :
                                        connectionStatus === 'polling' ? 'Searching...' :
                                            'No Device'}
                            </span>
                        </div>

                        <button
                            onClick={refresh}
                            className="p-2.5 glass-strong hover:bg-zinc-700/50 rounded-lg transition-smooth hover:scale-105"
                            title="Refresh connection"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                    </div>
                </div>


                {/* Welcome State - Only show when no device */}
                {connectionStatus !== 'connected' && (
                    <div className="mb-6 glass-strong rounded-2xl p-8 text-center animate-slide-up">
                        <div className="max-w-2xl mx-auto">
                            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-red-500 flex items-center justify-center">
                                <Activity className="w-10 h-10 text-white" />
                            </div>
                            <h2 className="text-2xl md:text-3xl font-bold mb-3">Welcome to Simmetric</h2>
                            <p className="text-zinc-400 text-lg mb-6">
                                Professional real-time telemetry monitoring for your Simagic pedals
                            </p>
                            <div className="grid md:grid-cols-2 gap-4 text-left">
                                <div className="glass p-4 rounded-xl">
                                    <Tv2Icon className="w-8 h-8 text-green-500 mb-2" />
                                    <h3 className="font-semibold mb-1">Live Performance</h3>
                                    <p className="text-sm text-zinc-400">Real-time pedal input visualization</p>
                                </div>
                                <div className="glass p-4 rounded-xl">
                                    <LineChartIcon className="w-8 h-8 text-blue-500 mb-2" />
                                    <h3 className="font-semibold mb-1">Session Stats</h3>
                                    <p className="text-sm text-zinc-400">Track session time and peak values</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}


                {/* Session Stats Bar */}
                {connectionStatus !== 'no-device' && connectionStatus !== 'polling' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6 animate-slide-up">
                        <div className="glass-strong rounded-xl p-4 transition-smooth">
                            <div className="flex items-center gap-2 mb-1">
                                <ChevronsUp className="w-4 h-4 text-green-500" />
                                <span className="text-xs text-zinc-500 uppercase tracking-wide">Peak Throttle</span>
                            </div>
                            <p className="text-2xl font-bold font-mono text-green-500">{sessionStats.peakThrottle.toFixed(0)}%</p>
                        </div>
                        <div className="glass-strong rounded-xl p-4 transition-smooth">
                            <div className="flex items-center gap-2 mb-1">
                                <ChevronsDown className="w-4 h-4 text-red-500" />
                                <span className="text-xs text-zinc-500 uppercase tracking-wide">Peak Brake</span>
                            </div>
                            <p className="text-2xl font-bold font-mono text-red-500">{sessionStats.peakBrake.toFixed(0)}%</p>
                        </div>
                        <div className="glass-strong rounded-xl p-4 transition-smooth">
                            <div className="flex items-center gap-2 mb-1">
                                <Mountain className="w-4 h-4 text-white" />
                                <span className="text-xs text-zinc-500 uppercase tracking-wide">Peak Steering Angle</span>
                            </div>
                            <p className="text-2xl font-bold font-mono text-blue-500">{sessionStats.peakSteering.toFixed(0)}°</p>
                        </div>
                    </div>
                )}

                {/* Main Telemetry Display */}
                {connectionStatus === 'connected' && (
                    <div className="glass-strong rounded-2xl p-6 border border-zinc-800/50 animate-slide-up">
                        {/* Graph and Steering Section */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
                            {/* Graph */}
                            <div className="lg:col-span-9 rounded-xl p-3 overflow-hidden min-h-[300px]">
                                <canvas
                                    ref={canvasRef}
                                    width={1200}
                                    height={300}
                                    className="w-full h-full"
                                    style={{ imageRendering: 'crisp-edges' }}
                                />
                            </div>

                            {/* Steering Wheel */}
                            <div className="lg:col-span-3  p-4 flex flex-col items-center justify-center">
                                <SteeringWheel angle={steeringAngle} />
                                <div className="mt-6 w-full space-y-2">
                                    <div className="flex justify-between text-[10px] text-zinc-500 uppercase font-bold px-1">
                                        <span>L</span>
                                        <span>Center</span>
                                        <span>R</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden border border-zinc-700/50 relative">
                                        <div
                                            className="absolute top-0 bottom-0 bg-blue-500 transition-all duration-75"
                                            style={{
                                                left: steeringAngle < 0 ? `${50 + (steeringAngle / 9)}%` : '50%',
                                                right: steeringAngle > 0 ? `${50 - (steeringAngle / 9)}%` : '50%'
                                            }}
                                        />
                                        <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-zinc-600 -translate-x-1/2" />
                                    </div>
                                </div>
                            </div>
                        </div>


                        {/* Pedal Bars */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Throttle */}
                            <div className="transition-smooth">
                                <div className="flex justify-between items-center mb-3">
                                    <span className="text-green-500 font-bold text-lg tracking-wide">THROTTLE</span>
                                    <span className="text-green-500 font-mono text-2xl font-bold">
                                        {throttle.toFixed(0)}%
                                    </span>
                                </div>
                                <div className="h-10 bg-zinc-900/50 rounded-xl overflow-hidden border border-zinc-800">
                                    <div
                                        className="h-full bg-green-500 transition-all duration-75 relative"
                                        style={{
                                            width: `${throttle}%`
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Brake */}
                            <div className="transition-smooth">
                                <div className="flex justify-between items-center mb-3">
                                    <span className="text-red-500 font-bold text-lg tracking-wide">BRAKE</span>
                                    <span className="text-red-500 font-mono text-2xl font-bold">
                                        {brake.toFixed(0)}%
                                    </span>
                                </div>
                                <div className="h-10 bg-zinc-900/50 rounded-xl overflow-hidden border border-zinc-800">
                                    <div
                                        className="h-full bg-red-500 transition-all duration-75 relative"
                                        style={{
                                            width: `${brake}%`
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Steering */}
                            <div className="transition-smooth">
                                <div className="flex justify-between items-center mb-3">
                                    <span className="text-blue-500 font-bold text-lg tracking-wide">STEERING</span>
                                    <span className="text-blue-500 font-mono text-2xl font-bold">
                                        {steering.toFixed(0)}%
                                    </span>
                                </div>
                                <div className="h-10 w-full bg-zinc-800 rounded-full overflow-hidden border border-zinc-700/50 relative">
                                    <div
                                        className="absolute top-0 bottom-0 bg-blue-500 transition-all duration-75"
                                        style={{
                                            left: steeringAngle < 0 ? `${50 + (steeringAngle / 9)}%` : '50%',
                                            right: steeringAngle > 0 ? `${50 - (steeringAngle / 9)}%` : '50%'
                                        }}
                                    />
                                    <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-zinc-600 -translate-x-1/2" />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Setup Instructions */}
                <div className="mt-6 glass rounded-xl p-5 animate-slide-up">
                    <p className="font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Setup Instructions
                    </p>
                    <ul className="space-y-2 text-sm text-zinc-400">
                        <li className="flex items-start gap-2">
                            <span className="text-green-500 mt-0.5">▸</span>
                            <span>Press any pedal to activate the gamepad interface</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-green-500 mt-0.5">▸</span>
                            <span>Go race!</span>
                        </li>
                    </ul>

                    {debugInfo && (
                        <div className="mt-4 pt-4 border-t border-zinc-700">
                            <p className="font-semibold text-zinc-400 mb-2 text-xs uppercase tracking-wide">Debug Info</p>
                            <p className="text-xs text-zinc-500 mb-1">Device: {debugInfo.name}</p>
                            <p className="text-xs text-zinc-500 mb-2">Raw Axes Values:</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {debugInfo.axes.map(axis => (
                                    <div key={axis.index} className="text-xs bg-zinc-900/50 px-2 py-1 rounded">
                                        <span className="text-zinc-500">Axis {axis.index}:</span>{' '}
                                        <span className="text-white font-mono">{axis.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}