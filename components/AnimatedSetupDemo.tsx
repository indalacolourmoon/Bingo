'use client'

import { useState, useEffect } from 'react'
import { Shuffle, Hand, Pointer, ArrowLeftRight } from 'lucide-react'

// --- SETUP DEMO ---
const SETUP_PHASES = [
    { id: 'drag', title: 'Drag to Fill', icon: Hand },
    { id: 'click', title: 'Manual Click', icon: Pointer },
    { id: 'random', title: 'Randomize', icon: Shuffle },
    { id: 'swap', title: 'Swap Numbers', icon: ArrowLeftRight }
]

function generateRandomBoard() {
    let nums = Array.from({ length: 25 }, (_, i) => i + 1)
    for (let i = nums.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [nums[i], nums[j]] = [nums[j], nums[i]];
    }
    return nums;
}

export function AnimatedSetupDemo() {
    const [phaseIdx, setPhaseIdx] = useState(0)
    const [board, setBoard] = useState<number[]>(Array(25).fill(0))
    const [pointerPos, setPointerPos] = useState({ x: 0, y: 0, opacity: 0, isClicking: false, transitionTime: 400 })
    const [step, setStep] = useState(0)

    const phase = SETUP_PHASES[phaseIdx]

    useEffect(() => {
        let timers: NodeJS.Timeout[] = [];
        const t = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));

        // Reset state for new phase
        if (step === 0) {
            if (phase.id === 'swap') {
                const full = Array.from({ length: 25 }, (_, i) => i + 1)
                setBoard(full)
            } else {
                setBoard(Array(25).fill(0))
            }
            setPointerPos({ x: 2, y: 5, opacity: 1, isClicking: false, transitionTime: 500 }) // Start off-screen bottom
            t(() => setStep(1), 500)
        }

        else if (phase.id === 'drag') {
            if (step === 1) { t(() => { setPointerPos({ x: 0, y: 0, opacity: 1, isClicking: false, transitionTime: 500 }); setStep(2) }, 500) }
            else if (step === 2) { t(() => { setPointerPos(p => ({ ...p, isClicking: true })); setStep(3) }, 300) }
            else if (step === 3) {
                t(() => {
                    setPointerPos({ x: 4, y: 0, opacity: 1, isClicking: true, transitionTime: 1200 });
                    setStep(4)
                }, 100)
            }
            else if (step === 4) {
                t(() => setBoard(b => { let nb = [...b]; nb[0] = 1; return nb }), 0)
                t(() => setBoard(b => { let nb = [...b]; nb[1] = 2; return nb }), 300)
                t(() => setBoard(b => { let nb = [...b]; nb[2] = 3; return nb }), 600)
                t(() => setBoard(b => { let nb = [...b]; nb[3] = 4; return nb }), 900)
                t(() => { setBoard(b => { let nb = [...b]; nb[4] = 5; return nb }); setStep(5) }, 1200)
            }
            else if (step === 5) { t(() => { setPointerPos(p => ({ ...p, isClicking: false, transitionTime: 300 })); setStep(6) }, 300) }
            else if (step === 6) { t(() => { setPointerPos(p => ({ ...p, opacity: 0 })); setStep(7) }, 500) }
            else if (step === 7) { t(() => { setStep(0); setPhaseIdx(1) }, 500) }
        }
        else if (phase.id === 'click') {
            if (step === 1) { t(() => { setPointerPos({ x: 1, y: 1, opacity: 1, isClicking: false, transitionTime: 400 }); setStep(2) }, 400) }
            else if (step === 2) { t(() => { setPointerPos(p => ({ ...p, isClicking: true })); setStep(3) }, 400) }
            else if (step === 3) { t(() => { setBoard(b => { let nb = [...b]; nb[6] = 1; return nb }); setPointerPos(p => ({ ...p, isClicking: false })); setStep(4) }, 200) }

            else if (step === 4) { t(() => { setPointerPos({ x: 3, y: 2, opacity: 1, isClicking: false, transitionTime: 400 }); setStep(5) }, 300) }
            else if (step === 5) { t(() => { setPointerPos(p => ({ ...p, isClicking: true })); setStep(6) }, 400) }
            else if (step === 6) { t(() => { setBoard(b => { let nb = [...b]; nb[13] = 2; return nb }); setPointerPos(p => ({ ...p, isClicking: false })); setStep(7) }, 200) }

            else if (step === 7) { t(() => { setPointerPos({ x: 2, y: 4, opacity: 1, isClicking: false, transitionTime: 400 }); setStep(8) }, 300) }
            else if (step === 8) { t(() => { setPointerPos(p => ({ ...p, isClicking: true })); setStep(9) }, 400) }
            else if (step === 9) { t(() => { setBoard(b => { let nb = [...b]; nb[22] = 3; return nb }); setPointerPos(p => ({ ...p, isClicking: false })); setStep(10) }, 200) }

            else if (step === 10) { t(() => { setPointerPos(p => ({ ...p, opacity: 0, transitionTime: 400 })); setStep(11) }, 500) }
            else if (step === 11) { t(() => { setStep(0); setPhaseIdx(2) }, 400) }
        }
        else if (phase.id === 'random') {
            if (step === 1) { t(() => { setPointerPos({ x: 2, y: 5.5, opacity: 1, isClicking: false, transitionTime: 500 }); setStep(2) }, 500) }
            else if (step === 2) { t(() => { setPointerPos(p => ({ ...p, isClicking: true })); setStep(3) }, 500) }
            else if (step === 3) {
                t(() => {
                    setBoard(generateRandomBoard());
                    setPointerPos(p => ({ ...p, isClicking: false }));
                    setStep(4)
                }, 200)
            }
            else if (step === 4) { t(() => { setPointerPos(p => ({ ...p, opacity: 0 })); setStep(5) }, 800) }
            else if (step === 5) { t(() => { setStep(0); setPhaseIdx(3) }, 500) }
        }
        else if (phase.id === 'swap') {
            if (step === 1) { t(() => { setPointerPos({ x: 0, y: 0, opacity: 1, isClicking: false, transitionTime: 500 }); setStep(2) }, 500) }
            else if (step === 2) { t(() => { setPointerPos(p => ({ ...p, isClicking: true })); setStep(3) }, 500) }
            else if (step === 3) { t(() => { setPointerPos(p => ({ ...p, isClicking: false })); setStep(4) }, 200) } // selects it
            else if (step === 4) { t(() => { setPointerPos({ x: 4, y: 4, opacity: 1, isClicking: false, transitionTime: 600 }); setStep(5) }, 400) }
            else if (step === 5) { t(() => { setPointerPos(p => ({ ...p, isClicking: true })); setStep(6) }, 600) }
            else if (step === 6) {
                t(() => {
                    setBoard(b => { let nb = [...b]; let temp = nb[0]; nb[0] = nb[24]; nb[24] = temp; return nb });
                    setPointerPos(p => ({ ...p, isClicking: false }));
                    setStep(7)
                }, 200)
            }
            else if (step === 7) { t(() => { setPointerPos(p => ({ ...p, opacity: 0 })); setStep(8) }, 800) }
            else if (step === 8) { t(() => { setStep(0); setPhaseIdx(0) }, 500) }
        }

        return () => timers.forEach(timer => clearTimeout(timer))
    }, [step, phase.id, phaseIdx])

    const IconComp = phase.icon

    return (
        <div className="bg-zinc-100 dark:bg-zinc-950 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-inner flex flex-col items-center justify-center space-y-4 w-full mx-auto relative overflow-hidden">
            {/* Playback UI Overlay */}
            <div className="absolute top-3 left-4 flex items-center gap-2 opacity-60">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Live Demo</span>
            </div>

            <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 mt-2">
                <IconComp className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-bold tracking-wider">{phase.title}</h3>
            </div>

            <div className="relative pb-6 w-full max-w-[320px] mx-auto flex flex-col items-center">
                <div className="grid grid-cols-5 gap-1 sm:gap-1.5 p-2 sm:p-4 bg-zinc-200 dark:bg-zinc-800/80 rounded-xl w-full aspect-square shadow-sm">
                    {board.map((num, i) => {
                        const isSelected = phase.id === 'swap' && step >= 3 && step <= 5 && i === 0;
                        return (
                            <div
                                key={i}
                                className={`flex items-center justify-center rounded-lg text-sm sm:text-lg font-bold transition-all duration-200 
                                ${num === 0
                                        ? 'bg-zinc-100 dark:bg-zinc-900 shadow-inner'
                                        : isSelected ? 'bg-amber-500 text-white shadow-md ring-2 ring-amber-400 scale-105 z-10' : 'bg-white dark:bg-zinc-700 text-amber-600 dark:text-amber-400 shadow-sm'}`}
                            >
                                <span className={num === 0 ? 'text-transparent' : 'scale-in'}>
                                    {num === 0 ? '-' : num}
                                </span>
                            </div>
                        )
                    })}
                </div>

                {/* Fake Button for Randomize */}
                {phase.id === 'random' && (
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-md z-0 transition-transform hover:scale-105">
                        Randomize
                    </div>
                )}

                {/* Fake Mouse Pointer */}
                <div
                    className={`absolute z-10 text-zinc-800 dark:text-zinc-200 transition-all ease-linear drop-shadow-lg ${pointerPos.isClicking ? 'scale-[0.80] opacity-90' : 'scale-100'}`}
                    style={{
                        top: `calc(10% + ${pointerPos.y * 18}%)`,
                        left: `calc(10% + ${pointerPos.x * 18}%)`,
                        opacity: pointerPos.opacity,
                        transitionDuration: `${pointerPos.transitionTime}ms`
                    }}
                >
                    {/* Pointer icon rotated to look like a standard mouse cursor, or using Pointer icon directly */}
                    <Pointer className="w-8 h-8 fill-zinc-100 stroke-[1.5]" />
                </div>
            </div>

            {/* Phase Dots */}
            <div className="flex gap-2">
                {SETUP_PHASES.map((p, i) => (
                    <div key={p.id} className={`w-2 h-2 rounded-full transition-all duration-300 ${i === phaseIdx ? 'bg-amber-500 w-4' : 'bg-zinc-300 dark:bg-zinc-700'}`} />
                ))}
            </div>
        </div>
    )
}
