import Link from "next/link";
import { Gamepad2, MousePointerClick, Trophy, Settings } from "lucide-react";
import { AnimatedSetupDemo } from "@/components/AnimatedSetupDemo";
import { AnimatedPlayingDemo } from "@/components/AnimatedPlayingDemo";

export default function HowToPlay() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-start bg-zinc-50 font-sans dark:bg-zinc-950 px-4 py-10 md:py-20">
            <main className="flex w-full max-w-3xl flex-col bg-white dark:bg-zinc-900 shadow-xl border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden animate-in fade-in zoom-in duration-700">

                {/* Header Section */}
                <div className="bg-amber-100 dark:bg-amber-900/40 p-10 text-center border-b border-zinc-200 dark:border-zinc-800">
                    <div className="flex justify-center mb-6">
                        <div className="bg-white dark:bg-zinc-800 p-4 rounded-full shadow-md">
                            <Gamepad2 className="w-12 h-12 text-amber-500" strokeWidth={1.5} />
                        </div>
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4 bg-linear-to-r from-amber-500 to-orange-600 inline-block text-transparent bg-clip-text">
                        How to Play Bingo
                    </h1>
                    <p className="text-zinc-600 dark:text-zinc-400 text-lg">
                        Master the classic game and dominate your friends in real-time multiplayer!
                    </p>
                </div>

                {/* Content Section */}
                <div className="p-8 md:p-12 space-y-12 text-left">

                    <section className="space-y-4">
                        <div className="flex items-center gap-3 text-amber-600 dark:text-amber-500 mb-2">
                            <Trophy className="w-6 h-6" />
                            <h2 className="text-2xl font-bold tracking-tight text-zinc-800 dark:text-zinc-100">The Objective</h2>
                        </div>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed text-lg">
                            The goal of Classic Bingo is to be the first player to complete <strong className="text-amber-600 dark:text-amber-500">5 lines</strong> on your 5x5 board. A line can be completed horizontally, vertically, or diagonally by marking off called numbers.
                        </p>
                    </section>

                    <section className="space-y-4">
                        <div className="flex items-center gap-3 text-amber-600 dark:text-amber-500 mb-2">
                            <Settings className="w-6 h-6" />
                            <h2 className="text-2xl font-bold tracking-tight text-zinc-800 dark:text-zinc-100">Phase 1: Setup</h2>
                        </div>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            Before the game begins, you must place the numbers 1 through 25 onto your 5x5 grid in any order you choose.
                        </p>
                        <ul className="list-disc list-inside space-y-2 text-zinc-600 dark:text-zinc-300 ml-2">
                            <li><strong>Click an empty box</strong> to place the next available number.</li>
                            <li><strong>Drag across the board</strong> to swiftly auto-fill consecutive numbers!</li>
                            <li><strong>Click an already placed number</strong> to select it, then click another to swap their positions.</li>
                            <li>Not feeling creative? Hit the <strong>Randomize</strong> button to instantly generate a scrambled board.</li>
                        </ul>
                        <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl text-sm text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
                            <strong>Tip:</strong> You must place all 25 numbers before you can click "I'm Ready".
                        </div>

                        {/* Setup Demo Component */}
                        <div className="pt-6 flex justify-center">
                            <AnimatedSetupDemo />
                        </div>
                    </section>

                    <section className="space-y-4">
                        <div className="flex items-center gap-3 text-amber-600 dark:text-amber-500 mb-2">
                            <MousePointerClick className="w-6 h-6" />
                            <h2 className="text-2xl font-bold tracking-tight text-zinc-800 dark:text-zinc-100">Phase 2: Playing</h2>
                        </div>
                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            Once both players are ready, the 5-second countdown begins. Players take turns calling out numbers.
                        </p>
                        <ul className="list-disc list-inside space-y-2 text-zinc-600 dark:text-zinc-300 ml-2">
                            <li>When it's <strong>YOUR TURN</strong>, click any unmarked number on your board.</li>
                            <li>That number will instantly be marked off on <strong className="underline">both</strong> your board and your opponent's board!</li>
                        </ul>

                        {/* Playing Demo Component */}
                        <div className="pt-6 flex justify-center">
                            <AnimatedPlayingDemo />
                        </div>
                    </section>

                    {/* Back Button */}
                    <div className="pt-8 border-t border-zinc-200 dark:border-zinc-800 flex justify-center">
                        <Link
                            href="/"
                            className="inline-flex h-12 items-center justify-center rounded-lg bg-zinc-900 dark:bg-white px-8 font-bold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-lg"
                        >
                            Back to Home
                        </Link>
                    </div>

                </div>
            </main>
        </div>
    );
}
