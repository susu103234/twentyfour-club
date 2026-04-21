import { useEffect } from "react";
import { motion } from "motion/react";
import { useGame } from "@/store/gameStore";
import { Cards } from "./Cards";
import { ExpressionInput } from "./ExpressionInput";
import { ClickBuilder } from "./ClickBuilder";
import { ReduceBoard } from "./ReduceBoard";
import { BubbleBoard } from "./BubbleBoard";
import { HintPanel } from "./HintPanel";
import { Scoreboard } from "./Scoreboard";
import { TimerBar } from "./TimerBar";
import { ModeToggle } from "./ModeToggle";

export function ExpandedView() {
  const hand = useGame((s) => s.hand);
  const startNewHand = useGame((s) => s.startNewHand);
  const submit = useGame((s) => s.submit);
  const requestHint = useGame((s) => s.requestHint);
  const reveal = useGame((s) => s.reveal);
  const nextHand = useGame((s) => s.nextHand);
  const undoReduce = useGame((s) => s.undoReduce);
  const resetReduce = useGame((s) => s.resetReduce);
  const inputMode = useGame((s) => s.preferences.inputMode);
  const bubbleDrag = useGame((s) => s.preferences.bubbleDrag);
  const mode = useGame((s) => s.mode);
  const rushActive = useGame((s) => s.rushActive);
  const rushTimeMs = useGame((s) => s.rushTimeMs);
  const historyLen = useGame((s) => s.reduceHistory.length);

  useEffect(() => {
    if (!hand) startNewHand();
  }, [hand, startNewHand]);

  const rushEnded = mode === "rush" && !rushActive && rushTimeMs === 0;
  const isReduce = inputMode === "reduce";

  return (
    <div
      className="relative flex-1 flex flex-col gap-3 px-3.5 pb-3.5 pt-2"
      data-no-drag
    >
      <div className="flex items-center justify-between">
        <Scoreboard />
        <ModeToggle />
      </div>

      <TimerBar />

      {rushEnded ? (
        <RushEnd />
      ) : (
        <>
          <motion.div
            key={hand?.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="flex flex-col gap-2.5"
          >
            {isReduce ? (
              bubbleDrag ? <BubbleBoard /> : <ReduceBoard />
            ) : (
              <>
                <Cards />
                <ExpressionInput />
                <ClickBuilder />
              </>
            )}
            <HintPanel />
          </motion.div>

          {isReduce ? (
            <div className="mt-auto grid grid-cols-5 gap-1.5">
              <button type="button" onClick={requestHint} className="btn-ghost">
                Hint
              </button>
              <button type="button" onClick={reveal} className="btn-ghost">
                Reveal
              </button>
              <button
                type="button"
                onClick={resetReduce}
                disabled={historyLen === 0}
                className="btn-ghost"
                style={{ opacity: historyLen === 0 ? 0.4 : 1 }}
              >
                Reset
              </button>
              <button type="button" onClick={nextHand} className="btn-ghost">
                Next
              </button>
              <button
                type="button"
                onClick={undoReduce}
                disabled={historyLen === 0}
                className="btn-primary"
                style={{ opacity: historyLen === 0 ? 0.4 : 1 }}
              >
                Undo
              </button>
            </div>
          ) : (
            <div className="mt-auto grid grid-cols-4 gap-1.5">
              <button type="button" onClick={requestHint} className="btn-ghost">
                Hint
              </button>
              <button type="button" onClick={reveal} className="btn-ghost">
                Reveal
              </button>
              <button type="button" onClick={nextHand} className="btn-ghost">
                Next
              </button>
              <button type="button" onClick={submit} className="btn-primary">
                Solve
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RushEnd() {
  const score = useGame((s) => s.score);
  const startRush = useGame((s) => s.startRush);
  const setMode = useGame((s) => s.setMode);
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center py-6">
      <div className="text-2xs uppercase tracking-widest text-ink-400">
        Rush · Session
      </div>
      <div className="text-3xl font-light text-ink-50 tabular-nums">{score}</div>
      <div className="text-xs text-ink-300">points</div>
      <div className="flex gap-2 mt-3">
        <button onClick={() => setMode("chill")} className="btn-ghost">
          Chill
        </button>
        <button onClick={startRush} className="btn-primary">
          Play again
        </button>
      </div>
    </div>
  );
}
