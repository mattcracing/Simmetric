import { useState, useEffect, useRef } from 'react';
import { Activity, RefreshCw, AlertCircle } from 'lucide-react';

export default function SimagicPedalTelemetry() {
    const [throttle, setThrottle] = useState(0);
    const [brake, setBrake] = useState(0);
    const [clutch, setClutch] = useState(0);
    const [history, setHistory] = useState([]);
    const [connectionStatus, setConnectionStatus] = useState('polling');
    const [lastUpdate, setLastUpdate] = useState(Date.now());
    const [debugInfo, setDebugInfo] = useState(null);
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

                    // Simagic pedals map as:
                    // axes[1] = Throttle
                    // axes[2] = Brake
                    // axes[3] = Clutch

                    const throttleAxis = gamepad.axes[1] !== undefined ? gamepad.axes[1] : 0;
                    const brakeAxis = gamepad.axes[2] !== undefined ? gamepad.axes[2] : 0;
                    const clutchAxis = gamepad.axes[3] !== undefined ? gamepad.axes[3] : 0;

                    // Debug: show raw values
                    setDebugInfo({
                        name: gamepad.id,
                        axes: gamepad.axes.map((v, i) => ({ index: i, value: v.toFixed(3) }))
                    });

                    // Convert from -1...1 range to 0...100%
                    // -1 = not pressed (0%), 1 = fully pressed (100%)
                    setThrottle(((throttleAxis + 1) / 2) * 100);
                    setBrake(((brakeAxis + 1) / 2) * 100);
                    setClutch(((clutchAxis + 1) / 2) * 100);

                    setLastUpdate(Date.now());
                    setConnectionStatus('connected');
                    break;
                }
            }

            if (!foundSimagic && gamepads.some(g => g !== null)) {
                // Found gamepads but not Simagic - still try to read from first available
                const gamepad = gamepads.find(g => g !== null);
                if (gamepad && gamepad.axes.length >= 2) {
                    const tAxis = gamepad.axes[1] || 0;
                    const bAxis = gamepad.axes[2] || gamepad.axes[0] || 0;
                    const cAxis = gamepad.axes[0] || 0;
                    setThrottle(((1 - tAxis) / 2) * 100);
                    setBrake(((1 - bAxis) / 2) * 100);
                    setClutch(((1 - cAxis) / 2) * 100);
                    setLastUpdate(Date.now());
                    setConnectionStatus('connected-generic');
                }
            } else if (!foundSimagic) {
                // Check if connection timed out
                if (Date.now() - lastUpdate > 2000) {
                    setConnectionStatus('no-device');
                }
            }
        };

        // Poll at ~60fps for smooth updates
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
                const newHistory = [...prev, { throttle, brake, clutch }];
                if (newHistory.length > maxHistory) {
                    newHistory.shift();
                }
                return newHistory;
            });
        }, 16); // ~60fps for smooth rolling

        return () => {
            if (historyInterval.current) {
                clearInterval(historyInterval.current);
            }
        };
    }, [throttle, brake, clutch]);

    // Draw graph
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = '#333';
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

        // Draw throttle (green)
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        history.forEach((point, i) => {
            const x = i * xStep;
            const y = height - (point.throttle / 100) * height;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();

        // Draw brake (red)
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        history.forEach((point, i) => {
            const x = i * xStep;
            const y = height - (point.brake / 100) * height;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();

        // Draw clutch (blue)
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        history.forEach((point, i) => {
            const x = i * xStep;
            const y = height - (point.clutch / 100) * height;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
    }, [history]);

    const refresh = () => {
        setConnectionStatus('polling');
        setLastUpdate(Date.now());
    };

    return (
        <div className="min-h-screen bg-black text-white p-4">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Activity className="w-8 h-8 text-red-500" />
                        <h1 className="text-2xl font-bold">SIMMETRIC</h1>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' :
                                connectionStatus === 'connected-generic' ? 'bg-yellow-500' :
                                    connectionStatus === 'polling' ? 'bg-blue-500 animate-pulse' :
                                        'bg-red-500'
                                }`} />
                            <span className="text-sm text-zinc-400">
                                {connectionStatus === 'connected' ? 'Pedals Connected' :
                                    connectionStatus === 'connected-generic' ? 'Gamepad Connected' :
                                        connectionStatus === 'polling' ? 'Searching...' :
                                            'No Device'}
                            </span>
                        </div>

                        <button
                            onClick={refresh}
                            className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded"
                            title="Refresh connection"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {connectionStatus === 'no-device' && (
                    <div className="mb-4 p-4 bg-yellow-900/30 border border-yellow-700 rounded flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-yellow-200">
                            <p className="font-semibold mb-1">No pedals detected</p>
                            <p>Make sure SimPro Manager is running and your pedals are connected. Press any pedal to activate the connection.</p>
                        </div>
                    </div>
                )}

                <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
                    <div className="bg-black rounded p-2 mb-4">
                        <canvas
                            ref={canvasRef}
                            width={1200}
                            height={300}
                            className="w-full"
                            style={{ imageRendering: 'crisp-edges' }}
                        />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        {/* Throttle */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-green-400 font-semibold">THROTTLE</span>
                                <span className="text-green-400 font-mono text-xl">
                                    {throttle.toFixed(0)}%
                                </span>
                            </div>
                            <div className="h-8 bg-zinc-800 rounded overflow-hidden">
                                <div
                                    className="h-full bg-green-500 transition-all duration-75"
                                    style={{ width: `${throttle}%` }}
                                />
                            </div>
                        </div>

                        {/* Brake */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-red-400 font-semibold">BRAKE</span>
                                <span className="text-red-400 font-mono text-xl">
                                    {brake.toFixed(0)}%
                                </span>
                            </div>
                            <div className="h-8 bg-zinc-800 rounded overflow-hidden">
                                <div
                                    className="h-full bg-red-500 transition-all duration-75"
                                    style={{ width: `${brake}%` }}
                                />
                            </div>
                        </div>

                        {/* Clutch */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-blue-400 font-semibold">CLUTCH</span>
                                <span className="text-blue-400 font-mono text-xl">
                                    {clutch.toFixed(0)}%
                                </span>
                            </div>
                            <div className="h-8 bg-zinc-800 rounded overflow-hidden">
                                <div
                                    className="h-full bg-blue-500 transition-all duration-75"
                                    style={{ width: `${clutch}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-4 text-sm text-zinc-500">
                    <p className="font-semibold text-zinc-400 mb-2">Setup Instructions:</p>
                    <ul className="space-y-1 list-disc list-inside">
                        <li>Press any pedal to activate the gamepad interface</li>
                        <li>This app reads pedal data via the browser's Gamepad API</li>
                    </ul>

                    {debugInfo && (
                        <div className="mt-4 p-3 bg-zinc-800 rounded">
                            <p className="font-semibold text-zinc-300 mb-2">Debug Info:</p>
                            <p className="text-xs text-zinc-400 mb-1">Device: {debugInfo.name}</p>
                            <p className="text-xs text-zinc-400">Raw Axes Values:</p>
                            <div className="grid grid-cols-4 gap-2 mt-1">
                                {debugInfo.axes.map(axis => (
                                    <div key={axis.index} className="text-xs">
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