'use client'

import { useState, useEffect, useRef } from 'react'
import { Flame, Users, Pointer, ArrowLeftRight } from 'lucide-react'

// --- HELPER FUNCTIONS ---
function generateRandomBoard() {
    let nums = Array.from({ length: 25 }, (_, i) => i + 1)
    for (let i = nums.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [nums[i], nums[j]] = [nums[j], nums[i]];
    }
    return nums;
}

function getWinningCells(board: number[], called: number[]) {
    const winningLines = [
        [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
        [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
        [0, 6, 12, 18, 24], [4, 8, 12, 16, 20]
    ];
    let winningCells = new Set<number>();
    for (const line of winningLines) {
        if (line.every(idx => called.includes(board[idx]))) {
            line.forEach(idx => winningCells.add(idx));
        }
    }
    return winningCells;
}

function checkLineCount(board: number[], called: number[]) {
    let lines = 0;
    for (let r = 0; r < 5; r++) if ([0, 1, 2, 3, 4].every(c => called.includes(board[r * 5 + c]))) lines++;
    for (let c = 0; c < 5; c++) if ([0, 1, 2, 3, 4].every(r => called.includes(board[r * 5 + c]))) lines++;
    if ([0, 6, 12, 18, 24].every(i => called.includes(board[i]))) lines++;
    if ([4, 8, 12, 16, 20].every(i => called.includes(board[i]))) lines++;
    return lines;
}

function getBestMove(board: number[], called: number[]) {
    const winningLines = [
        [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
        [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
        [0, 6, 12, 18, 24], [4, 8, 12, 16, 20]
    ];
    let candidateOptions: number[] = [];
    let maxMarked = -1;
    for (const line of winningLines) {
        let marked = 0;
        let uncalled: number[] = [];
        for (const idx of line) {
            if (called.includes(board[idx])) marked++;
            else uncalled.push(board[idx]);
        }
        if (uncalled.length > 0) {
            if (marked > maxMarked) {
                maxMarked = marked;
                candidateOptions = uncalled;
            } else if (marked === maxMarked) {
                candidateOptions = [...candidateOptions, ...uncalled];
            }
        }
    }
    if (candidateOptions.length > 0) return candidateOptions[Math.floor(Math.random() * candidateOptions.length)];
    const available = board.filter(n => !called.includes(n));
    return available[Math.floor(Math.random() * available.length)];
}

export function AnimatedPlayingDemo() {
    const [board1, setBoard1] = useState<number[]>([])
    const [board2, setBoard2] = useState<number[]>([])
    const [calledNumbers, setCalledNumbers] = useState<number[]>([])
    const [turn, setTurn] = useState<1 | 2>(1)
    const [gameKey, setGameKey] = useState(0)
    const [winner, setWinner] = useState<1 | 2 | null>(null)

    const [p1Pointer, setP1Pointer] = useState({ x: 0, y: 0, opacity: 0, isClicking: false })
    const [p2Pointer, setP2Pointer] = useState({ x: 0, y: 0, opacity: 0, isClicking: false })

    const calledRef = useRef(calledNumbers)
    const winnerRef = useRef(winner)

    useEffect(() => { calledRef.current = calledNumbers }, [calledNumbers])
    useEffect(() => { winnerRef.current = winner }, [winner])

    useEffect(() => {
        setBoard1(generateRandomBoard())
        setBoard2(generateRandomBoard())
        setCalledNumbers([])
        setWinner(null)
        setTurn(1)
        setP1Pointer({ x: 0, y: 0, opacity: 0, isClicking: false })
        setP2Pointer({ x: 0, y: 0, opacity: 0, isClicking: false })
    }, [gameKey])

    const p1WinningCells = getWinningCells(board1, calledNumbers)
    const p2WinningCells = getWinningCells(board2, calledNumbers)
    const p1Lines = checkLineCount(board1, calledNumbers)
    const p2Lines = checkLineCount(board2, calledNumbers)

    // Win Check Effect
    useEffect(() => {
        if (winner !== null || board1.length === 0) return;
        if (p1Lines >= 5 || p2Lines >= 5) {
            setWinner(p1Lines >= 5 ? 1 : 2)
            setP1Pointer({ x: 0, y: 0, opacity: 0, isClicking: false })
            setP2Pointer({ x: 0, y: 0, opacity: 0, isClicking: false })
        }
    }, [p1Lines, p2Lines, board1.length, winner])

    // Restart Timer Effect
    useEffect(() => {
        if (winner !== null) {
            const timer = setTimeout(() => {
                setGameKey(k => k + 1)
            }, 6000)
            return () => clearTimeout(timer)
        }
    }, [winner])

    // Turn Logic Effect
    useEffect(() => {
        if (board1.length === 0 || winnerRef.current !== null) return;

        let isCancelled = false;
        const targetBoard = turn === 1 ? board1 : board2;
        const setPointer = turn === 1 ? setP1Pointer : setP2Pointer;
        const targetNum = getBestMove(targetBoard, calledRef.current);
        const targetIdx = targetBoard.indexOf(targetNum);

        if (targetIdx === -1) return;

        const targetX = targetIdx % 5;
        const targetY = Math.floor(targetIdx / 5);

        let t1: NodeJS.Timeout, t2: NodeJS.Timeout, t3: NodeJS.Timeout, t4: NodeJS.Timeout, t5: NodeJS.Timeout;

        t1 = setTimeout(() => {
            if (isCancelled) return;
            setPointer({ x: targetX, y: targetY, opacity: 1, isClicking: false })
        }, 800)

        t2 = setTimeout(() => {
            if (isCancelled) return;
            setPointer(p => ({ ...p, isClicking: true }))
        }, 1500)

        t3 = setTimeout(() => {
            if (isCancelled) return;
            setPointer(p => ({ ...p, isClicking: false }))
            setCalledNumbers(c => [...c, targetNum])
        }, 1700)

        t4 = setTimeout(() => {
            if (isCancelled) return;
            setPointer(p => ({ ...p, opacity: 0 }))
        }, 2200)

        t5 = setTimeout(() => {
            if (isCancelled) return;
            setTurn(turn === 1 ? 2 : 1)
        }, 2500)

        return () => {
            isCancelled = true;
            clearTimeout(t1)
            clearTimeout(t2)
            clearTimeout(t3)
            clearTimeout(t4)
            clearTimeout(t5)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [turn, gameKey, board1, board2])

    return (
        <div className="bg-amber-50 dark:bg-zinc-950 p-6 rounded-2xl border border-amber-200 dark:border-zinc-800 shadow-inner flex flex-col items-center justify-center space-y-6 w-full mx-auto relative overflow-hidden">
            {/* Playback UI Overlay */}
            <div className="absolute top-3 left-4 flex items-center gap-2 opacity-60">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest">Multiplayer Sync Demo</span>
            </div>

            <div className="flex flex-col items-center gap-1 mt-4">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-500">
                    <Users className="w-5 h-5" />
                    <h3 className="text-sm font-bold tracking-wider">Live Syncing</h3>
                </div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase">First to 5 Lines Wins!</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-6 w-full items-center justify-center">

                {/* Player 1 Board */}
                <div className="flex flex-col items-center gap-2 relative">
                    <div className="flex justify-between w-full px-1">
                        <span className="text-xs font-bold text-zinc-500">Player 1</span>
                        <span className={`text-xs font-black ${p1Lines >= 5 ? 'text-green-600' : 'text-amber-600 dark:text-amber-500'}`}>{p1Lines}/5 Lines</span>
                    </div>
                    <div className={`grid grid-cols-5 gap-1 p-2 bg-zinc-200 dark:bg-zinc-800/80 rounded-lg w-[160px] aspect-square shadow-sm relative transition-all duration-300 ${winner === 1 ? 'ring-4 ring-amber-500 scale-105' : ''}`}>
                        {/* Fake Mouse Pointer for Player 1 */}
                        {turn === 1 && !winner && (
                            <div
                                className={`absolute z-20 pointer-events-none transition-all duration-400 ease-in-out drop-shadow-md ${p1Pointer.isClicking ? 'scale-[0.80] opacity-90' : 'scale-100'}`}
                                style={{
                                    top: `${p1Pointer.y * 20}%`,
                                    left: `${p1Pointer.x * 20}%`,
                                    opacity: p1Pointer.opacity,
                                    color: '#27272a'
                                }}
                            >
                                <Pointer className="w-6 h-6 fill-zinc-100 dark:fill-zinc-800 stroke-[1.5]" />
                            </div>
                        )}

                        {board1.map((num, i) => {
                            const isMarked = calledNumbers.includes(num)
                            const isJustCalled = num === calledNumbers[calledNumbers.length - 1]
                            const isWinningCell = p1WinningCells.has(i);

                            return (
                                <div
                                    key={i}
                                    className={`flex items-center justify-center rounded text-xs font-bold transition-all duration-300 
                                    ${isWinningCell
                                            ? 'bg-green-500 text-white shadow-md ring-2 ring-green-400 scale-[1.02] z-10'
                                            : isMarked
                                                ? 'bg-amber-500 text-white shadow-md'
                                                : 'bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 shadow-sm'}
                                    ${isJustCalled && !isWinningCell ? 'ring-2 ring-amber-400 scale-110 z-10' : ''}    
                                `}
                                >
                                    {num}
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Sync Icon */}
                <div className="hidden sm:flex self-center text-amber-300 dark:text-amber-700/50">
                    <ArrowLeftRight className="w-8 h-8 animate-pulse" />
                </div>

                {/* Player 2 Board */}
                <div className="flex flex-col items-center gap-2">
                    <div className="flex justify-between w-full px-1">
                        <span className="text-xs font-bold text-zinc-500">Player 2</span>
                        <span className={`text-xs font-black ${p2Lines >= 5 ? 'text-green-600' : 'text-amber-600 dark:text-amber-500'}`}>{p2Lines}/5 Lines</span>
                    </div>
                    <div className={`grid grid-cols-5 gap-1 p-2 bg-zinc-200 dark:bg-zinc-800/80 rounded-lg w-[160px] aspect-square shadow-sm relative transition-all duration-300 ${winner === 2 ? 'ring-4 ring-amber-500 scale-105' : ''}`}>

                        {/* Fake Mouse Pointer for Player 2 */}
                        {turn === 2 && !winner && (
                            <div
                                className={`absolute z-20 pointer-events-none transition-all duration-400 ease-in-out drop-shadow-md ${p2Pointer.isClicking ? 'scale-[0.80] opacity-90' : 'scale-100'}`}
                                style={{
                                    top: `${p2Pointer.y * 20}%`,
                                    left: `${p2Pointer.x * 20}%`,
                                    opacity: p2Pointer.opacity,
                                    color: '#27272a'
                                }}
                            >
                                <Pointer className="w-6 h-6 fill-zinc-100 dark:fill-zinc-800 stroke-[1.5]" />
                            </div>
                        )}

                        {board2.map((num, i) => {
                            const isMarked = calledNumbers.includes(num)
                            const isJustCalled = num === calledNumbers[calledNumbers.length - 1]
                            const isWinningCell = p2WinningCells.has(i);

                            return (
                                <div
                                    key={i}
                                    className={`flex items-center justify-center rounded text-xs font-bold transition-all duration-300 
                                    ${isWinningCell
                                            ? 'bg-green-500 text-white shadow-md ring-2 ring-green-400 scale-[1.02] z-10'
                                            : isMarked
                                                ? 'bg-amber-500 text-white shadow-md'
                                                : 'bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 shadow-sm'}
                                    ${isJustCalled && !isWinningCell ? 'ring-2 ring-amber-400 scale-110 z-10' : ''}    
                                `}
                                >
                                    {num}
                                </div>
                            )
                        })}
                    </div>
                </div>

            </div>

            <div className="h-10 flex items-center justify-center p-2 rounded-lg bg-white/50 dark:bg-black/20 w-full max-w-[240px]">
                {winner ? (
                    <span className="text-amber-600 dark:text-amber-500 font-black text-2xl flex items-center gap-2 animate-bounce drop-shadow-sm">
                        <Flame className="w-8 h-8 fill-amber-500" /> PLAYER {winner} WINS!
                    </span>
                ) : (
                    <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                        <span className="font-bold text-sm tracking-wider">TURN:</span>
                        <span className="font-black">
                            Player {turn}
                        </span>
                        <span className="text-amber-600 dark:text-amber-500 ml-2 font-black">
                            {calledNumbers.length > 0 ? `(Called: ${calledNumbers[calledNumbers.length - 1]})` : '(Waiting)'}
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}
