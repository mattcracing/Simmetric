import { useState, useEffect, useRef } from 'react';
import { Activity, RefreshCw, AlertCircle, TrendingUp, Clock, Target } from 'lucide-react';

interface SessionStats {
    startTime: number;
    peakThrottle: number;
    peakBrake: number;
    peakSteering: number;
}

export default function SimagicPedalTelemetry() {
    const [throttle, setThrottle] = useState(0);
    const [brake, setBrake] = useState(0);
    const [steering, setSteering] = useState(0);
    const [history, setHistory] = useState([]);
    const [connectionStatus, setConnectionStatus] = useState('polling');
    const [lastUpdate, setLastUpdate] = useState(Date.now());
    const [debugInfo, setDebugInfo] = useState(null);
    const [sessionStats, setSessionStats] = useState<SessionStats>({
        startTime: Date.now(),
        peakThrottle: 0,
        peakBrake: 0,
        peakSteering: 0
    });
    const canvasRef = useRef(null);
    const maxHistory = 200;
    const pollInterval = useRef(null);
    const historyInterval = useRef(null);

    // Poll for gamepad input (SimPro devices appear as gamepads)
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

                    const throttleAxis = gamepad.axes[1] !== undefined ? gamepad.axes[1] : 0;
                    const brakeAxis = gamepad.axes[2] !== undefined ? gamepad.axes[2] : 0;
                    const steeringAxis = gamepad.axes[0] !== undefined ? gamepad.axes[0] : 0;

                    setDebugInfo({
                        name: gamepad.id,
                        axes: gamepad.axes.map((v, i) => ({ index: i, value: v.toFixed(3) }))
                    });

                    const newThrottle = ((throttleAxis + 1) / 2) * 100;
                    const newBrake = ((brakeAxis + 1) / 2) * 100;
                    const newSteering = Math.abs(steeringAxis) * 100;

                    setThrottle(newThrottle);
                    setBrake(newBrake);
                    setSteering(newSteering);

                    // Update session stats with peak values
                    setSessionStats(prev => ({
                        ...prev,
                        peakThrottle: Math.max(prev.peakThrottle, newThrottle),
                        peakBrake: Math.max(prev.peakBrake, newBrake),
                        peakSteering: Math.max(prev.peakSteering, newSteering)
                    }));

                    setLastUpdate(Date.now());
                    setConnectionStatus('connected');
                    break;
                }
            }

            if (!foundSimagic && gamepads.some(g => g !== null)) {
                const gamepad = gamepads.find(g => g !== null);
                if (gamepad && gamepad.axes.length >= 2) {
                    const tAxis = gamepad.axes[1] || 0;
                    const bAxis = gamepad.axes[2] || gamepad.axes[0] || 0;
                    const cAxis = gamepad.axes[0] || 0;
                    setThrottle(((1 - tAxis) / 2) * 100);
                    setBrake(((1 - bAxis) / 2) * 100);
                    setSteering(((1 - cAxis) / 2) * 100);
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

        // Background with subtle gradient
        const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
        bgGradient.addColorStop(0, '#0a0a0a');
        bgGradient.addColorStop(1, '#1a1a1a');
        ctx.fillStyle = bgGradient;
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

        // Helper to draw line with glow
        const drawGlowLine = (color: string, glowColor: string, dataKey: string) => {
            // Glow effect
            ctx.shadowBlur = 8;
            ctx.shadowColor = glowColor;
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
            ctx.shadowBlur = 0;
        };

        drawGlowLine('#10b981', 'rgba(16, 185, 129, 0.4)', 'throttle');
        drawGlowLine('#ef4444', 'rgba(239, 68, 68, 0.4)', 'brake');
        drawGlowLine('#3b82f6', 'rgba(59, 130, 246, 0.4)', 'steering');
    }, [history]);

    const refresh = () => {
        setConnectionStatus('polling');
        setLastUpdate(Date.now());
    };

    const formatSessionTime = () => {
        const elapsed = Math.floor((Date.now() - sessionStats.startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const isActive = throttle > 5 || brake > 5 || steering > 5;

    return (
        <div className="min-h-screen bg-black text-white p-4 md:p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8 animate-slide-up">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Activity className="w-10 h-10 text-red-500" />
                            {isActive && (
                                <div className="absolute inset-0 animate-pulse-glow">
                                    <Activity className="w-10 h-10 text-red-500 opacity-50" />
                                </div>
                            )}
                        </div>
                        <div>
                            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">SIMMETRIC</h1>
                            <p className="text-sm text-zinc-500">Simagic Pedal Telemetry</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full transition-smooth ${connectionStatus === 'connected' ? 'bg-green-500 shadow-lg shadow-green-500/50' :
                                connectionStatus === 'connected-generic' ? 'bg-yellow-500 shadow-lg shadow-yellow-500/50' :
                                    connectionStatus === 'polling' ? 'bg-blue-500 animate-pulse shadow-lg shadow-blue-500/50' :
                                        'bg-red-500 shadow-lg shadow-red-500/50'
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
                {connectionStatus === 'no-device' && (
                    <div className="mb-6 glass-strong rounded-2xl p-8 text-center animate-slide-up">
                        <div className="max-w-2xl mx-auto">
                            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-red-500 to-blue-500 flex items-center justify-center">
                                <Activity className="w-10 h-10 text-white" />
                            </div>
                            <h2 className="text-2xl md:text-3xl font-bold mb-3">Welcome to Simmetric</h2>
                            <p className="text-zinc-400 text-lg mb-6">
                                Professional real-time telemetry monitoring for your Simagic pedals
                            </p>
                            <div className="grid md:grid-cols-2 gap-4 text-left">
                                <div className="glass p-4 rounded-xl">
                                    <TrendingUp className="w-8 h-8 text-green-500 mb-2" />
                                    <h3 className="font-semibold mb-1">Live Performance</h3>
                                    <p className="text-sm text-zinc-400">Real-time pedal input visualization</p>
                                </div>
                                <div className="glass p-4 rounded-xl">
                                    <Target className="w-8 h-8 text-blue-500 mb-2" />
                                    <h3 className="font-semibold mb-1">Session Stats</h3>
                                    <p className="text-sm text-zinc-400">Track session time and peak values</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}


                {/* Session Stats Bar */}
                {connectionStatus !== 'no-device' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6 animate-slide-up">
                        <div className="glass-strong rounded-xl p-4 transition-smooth hover:scale-105">
                            <div className="flex items-center gap-2 mb-1">
                                <Clock className="w-4 h-4 text-zinc-400" />
                                <span className="text-xs text-zinc-500 uppercase tracking-wide">Session Time</span>
                            </div>
                            <p className="text-2xl font-bold font-mono">{formatSessionTime()}</p>
                        </div>
                        <div className="glass-strong rounded-xl p-4 transition-smooth hover:scale-105">
                            <div className="flex items-center gap-2 mb-1">
                                <Target className="w-4 h-4 text-green-400" />
                                <span className="text-xs text-zinc-500 uppercase tracking-wide">Peak Throttle</span>
                            </div>
                            <p className="text-2xl font-bold font-mono text-green-400">{sessionStats.peakThrottle.toFixed(0)}%</p>
                        </div>
                        <div className="glass-strong rounded-xl p-4 transition-smooth hover:scale-105">
                            <div className="flex items-center gap-2 mb-1">
                                <Target className="w-4 h-4 text-red-400" />
                                <span className="text-xs text-zinc-500 uppercase tracking-wide">Peak Brake</span>
                            </div>
                            <p className="text-2xl font-bold font-mono text-red-400">{sessionStats.peakBrake.toFixed(0)}%</p>
                        </div>
                    </div>
                )}

                {/* Main Telemetry Display */}
                <div className="glass-strong rounded-2xl p-6 border border-zinc-800/50 shadow-2xl animate-slide-up">
                    {/* Graph */}
                    <div className="bg-black rounded-xl p-3 mb-6 border border-zinc-900">
                        <canvas
                            ref={canvasRef}
                            width={1200}
                            height={300}
                            className="w-full"
                            style={{ imageRendering: 'crisp-edges' }}
                        />
                    </div>

                    {/* Pedal Bars */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Throttle */}
                        <div className="transition-smooth hover:scale-105">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-green-400 font-bold text-lg tracking-wide">THROTTLE</span>
                                <span className="text-green-400 font-mono text-2xl font-bold">
                                    {throttle.toFixed(0)}%
                                </span>
                            </div>
                            <div className="h-10 bg-zinc-900/50 rounded-xl overflow-hidden border border-zinc-800">
                                <div
                                    className="h-full bg-gradient-to-r from-green-600 to-green-400 transition-all duration-75 relative"
                                    style={{
                                        width: `${throttle}%`,
                                        boxShadow: throttle > 5 ? '0 0 20px rgba(16, 185, 129, 0.5)' : 'none'
                                    }}
                                >
                                    {throttle > 5 && (
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/20" />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Brake */}
                        <div className="transition-smooth hover:scale-105">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-red-400 font-bold text-lg tracking-wide">BRAKE</span>
                                <span className="text-red-400 font-mono text-2xl font-bold">
                                    {brake.toFixed(0)}%
                                </span>
                            </div>
                            <div className="h-10 bg-zinc-900/50 rounded-xl overflow-hidden border border-zinc-800">
                                <div
                                    className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-75 relative"
                                    style={{
                                        width: `${brake}%`,
                                        boxShadow: brake > 5 ? '0 0 20px rgba(239, 68, 68, 0.5)' : 'none'
                                    }}
                                >
                                    {brake > 5 && (
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/20" />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Clutch */}
                        <div className="transition-smooth hover:scale-105">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-blue-400 font-bold text-lg tracking-wide">STEERING</span>
                                <span className="text-blue-400 font-mono text-2xl font-bold">
                                    {steering.toFixed(0)}%
                                </span>
                            </div>
                            <div className="h-10 bg-zinc-900/50 rounded-xl overflow-hidden border border-zinc-800">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-75 relative"
                                    style={{
                                        width: `${steering}%`,
                                        boxShadow: steering > 5 ? '0 0 20px rgba(59, 130, 246, 0.5)' : 'none'
                                    }}
                                >
                                    {steering > 5 && (
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/20" />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

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
                            <span>This app reads pedal data via the browser's Gamepad API</span>
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