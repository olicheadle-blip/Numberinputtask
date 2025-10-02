import { useEffect, useMemo, useRef, useState } from "react";

// ========================
// Voice utilities
// ========================
function usePreferredVoice() {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return;

      // Prefer Google UK English Male explicitly if available
      const exact = voices.find((v) => v.name === "Google UK English Male");
      const nameContains = voices.find((v) => /Google.*UK.*English.*Male/i.test(v.name));
      const gbMale = voices.find((v) => /en-GB/i.test(v.lang) && /male/i.test(v.name));
      const gbAny = voices.find((v) => /en-GB/i.test(v.lang));
      const usMale = voices.find((v) => /en-US/i.test(v.lang) && /male/i.test(v.name));
      const fallback = voices[0] || null;

      setVoice(exact || nameContains || gbMale || gbAny || usMale || fallback);
    };
    // Initial try + when voices populate
    pick();
    const prev = window.speechSynthesis.onvoiceschanged;
    window.speechSynthesis.onvoiceschanged = pick;
    return () => {
      window.speechSynthesis.onvoiceschanged = prev as any;
    };
  }, []);

  return voice;
}

function speak(text: string, voice: SpeechSynthesisVoice | null, rate = 0.9, volume = 1.0) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.rate = rate;
    u.pitch = 1.0;
    u.volume = Math.max(0, Math.min(1, volume));
    window.speechSynthesis.speak(u);
  } catch {}
}

// ========================
// Audio feedback
// ========================
// Pleasant two-note chime for correct answers
function playCorrectChime() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const g = ctx.createGain();
    g.gain.value = 0.065;
    g.connect(ctx.destination);

    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = 660; // E5
    o1.connect(g);
    o1.start();

    setTimeout(() => {
      o1.stop();
      const o2 = ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = 880; // A5 up-step
      o2.connect(g);
      o2.start();
      setTimeout(() => {
        o2.stop();
        ctx.close();
      }, 140);
    }, 140);
  } catch {}
}

// Short low buzz for incorrect answers
function playErrorTone() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = 220; // low A
    g.gain.value = 0.04;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 180);
  } catch {}
}

// ========================
// Helpers
// ========================
// Convert 0–999 to British English words (with "and")
function toWords(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 999) return String(n);
  const ones = [
    "zero","one","two","three","four","five","six","seven","eight","nine",
    "ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"
  ];
  const tens = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  if (n < 20) return ones[n];
  if (n < 100) {
    const t = Math.floor(n/10), r = n%10;
    return r ? `${tens[t]} ${ones[r]}` : tens[t];
  }
  const h = Math.floor(n/100), r = n%100;
  const head = `${ones[h]} hundred`;
  if (r === 0) return head;
  if (r < 20) return `${head} and ${ones[r]}`;
  const t = Math.floor(r/10), u = r%10;
  return u ? `${head} and ${tens[t]} ${ones[u]}` : `${head} and ${tens[t]}`;
}

// Hyphenate compound numbers like "twenty one" -> "twenty-one"
function hyphenateCompoundWords(s: string): string {
  const re = new RegExp(
    String.raw`(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s(one|two|three|four|five|six|seven|eight|nine)`,
    "g"
  );
  // Replace with "$1-$2" (tens-ones)
  return s.replace(re, "$1-$2");
}

function capitaliseFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function randomTarget(digits: number): string {
  if (digits === 1) return String(Math.floor(Math.random() * 10)); // 0-9 (allows 0)
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

function classNames(...v: (string | false | null | undefined)[]) {
  return v.filter(Boolean).join(" ");
}

// ========================
// UI bits
// ========================
function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { label: string; value: any }[];
  value: any;
  onChange: (v: any) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-500 select-none">{label}</span>
      <div className="flex rounded-full bg-slate-100 p-1 dark:bg-slate-800">
        {options.map((o) => (
          <button
            key={o.value}
            className={classNames(
              "px-3 py-1 rounded-full text-sm transition focus:outline-none",
              o.value === value
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow"
                : "text-slate-700 hover:bg-white/60 dark:text-slate-200 dark:hover:bg-slate-700/60"
            )}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Key({ label, onClick, disabled, highlighted }: { label: string; onClick: () => void; disabled?: boolean; highlighted?: boolean }) {
  return (
    <button
      className={classNames(
        "h-16 text-xl rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700",
        "hover:shadow transition active:scale-[0.98] bg-white dark:bg-slate-900",
        highlighted && "ring-2 ring-amber-400 border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-400",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      {label}
    </button>
  );
}

// ========================
// Main app
// ========================
export default function App() {
  const voice = usePreferredVoice();

  const [level, setLevel] = useState(1); // 1/2/3 digits
  const [totalTrials, setTotalTrials] = useState(10); // 10/25/50

  const [trialIdx, setTrialIdx] = useState(0); // number of targets started so far (0..total)
  const [target, setTarget] = useState("");
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "listening" | "correct" | "incorrect" | "complete">("idle");
  const [results, setResults] = useState<{ target: string; response: string; correct: boolean; timeMs: number }[]>(
    []
  );
  const [volume, setVolume] = useState(1); // 0–1 speech volume
  const [score, setScore] = useState(0); // first-try corrects
  const [hadErrorThisTarget, setHadErrorThisTarget] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const trialStartRef = useRef<number | null>(null);

  const accuracy = useMemo(() => {
    if (trialIdx === 0) return 0;
    return Math.round((100 * score) / trialIdx);
  }, [score, trialIdx]);

  // --- Speech text selection ---
  const speechTextForTarget = (tgt: string, lvl: number) => {
    const n = Number(tgt);
    if (lvl >= 2) return toWords(n); // whole-number phrasing for 2–3 digits
    // single digit as word
    const map: Record<string, string> = {
      "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
      "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
    };
    return map[tgt] ?? tgt;
  };

  // --- Start/Reset/Advance ---
  const startNextTrial = (lvl = level) => {
    if (trialIdx >= totalTrials) {
      setShowGuide(false);
      setStatus("complete");
      return;
    }
    const newIdx = trialIdx + 1; // increment trial count when presenting a new target
    setTrialIdx(newIdx);

    const t = randomTarget(lvl);
    setTarget(t);
    setInput("");
    setStatus("listening");
    setShowHint(false);
    setHadErrorThisTarget(false);
    trialStartRef.current = performance.now();

    const phrase = speechTextForTarget(t, lvl);
    speak(phrase, voice, 0.9, volume);
  };

  const resetAll = () => {
    window.speechSynthesis.cancel();
    setResults([]);
    setScore(0);
    setTrialIdx(0);
    setStatus("idle");
    setInput("");
    setShowHint(false);
    setShowGuide(false);
    setHadErrorThisTarget(false);
    // Start immediately to avoid extra click for speech
    setTimeout(() => startNextTrial(level), 100);
  };

  const backspace = () => {
    if (status !== "listening") return;
    if (input.length === 0) return;
    setInput((s) => s.slice(0, -1));
  };

  const clear = () => {
    if (status !== "listening") return;
    setInput("");
  };

  const listen = () => {
    if (!target) return;
    const phrase = speechTextForTarget(target, level);
    speak(phrase, voice, 0.9, volume);
  };

  // If level changes, reset metrics and return to idle (do NOT auto-start)
  useEffect(() => {
    // Reset counts/metrics/UI without starting a new trial
    window.speechSynthesis.cancel();
    setResults([]);
    setScore(0);
    setTrialIdx(0);
    setStatus("idle");
    setInput("");
    setShowHint(false);
    setHadErrorThisTarget(false);
    // intentionally do NOT change showGuide; user preference persists across level change
  }, [level]);

  // If trial length changes during a run, restart fresh and auto-start
  useEffect(() => {
    if (status !== "idle" || results.length > 0 || trialIdx > 0) {
      resetAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalTrials]);

  // --- Handle keypad & keyboard ---
  const handleDigit = (d: string) => {
    if (status !== "listening") return;
    if (input.length >= String(target).length) return;
    const next = input + d;
    setInput(next);

    const need = String(target).length;
    if (next.length === need) {
      const correct = next === target;
      const started = trialStartRef.current ?? performance.now();
      const timeMs = performance.now() - started;
      setResults((r) => [...r, { target, response: next, correct, timeMs }]);
      setStatus(correct ? "correct" : "incorrect");

      if (correct) {
        playCorrectChime();
        // show ✓ for 2s, then advance; +1 only if first attempt
        setTimeout(() => {
          if (!hadErrorThisTarget) setScore((s) => s + 1);
          // If we've already presented all trials, mark complete
          if (trialIdx >= totalTrials) {
            setShowGuide(false);
            setStatus("complete");
            return;
          }
          startNextTrial();
        }, 2000);
      } else {
        playErrorTone();
        setHadErrorThisTarget(true);
        // keep ✗ for 2s, then allow another attempt on SAME target
        setTimeout(() => {
          setInput("");
          setStatus("listening");
          const phrase = speechTextForTarget(target, level);
          speak(phrase, voice, 0.9, volume);
        }, 2000);
      }
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) handleDigit(e.key);
      else if (e.key === "Backspace") backspace();
      else if (e.key.toLowerCase() === "l") listen();
      else if (e.key.toLowerCase() === "c") clear();
      else if (e.key.toLowerCase() === "n") startNextTrial();
      else if (e.key.toLowerCase() === "s") resetAll(); // Start shortcut
      else if (e.key.toLowerCase() === "h") setShowHint(true);
      else if (e.key.toLowerCase() === "g") setShowGuide((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, input, target, level, totalTrials, volume, hadErrorThisTarget]);

  // Keypad grid
  const keypad = (
    <div className="grid grid-cols-3 gap-3 w-full max-w-sm mx-auto mt-6">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <Key
          key={d}
          label={d}
          onClick={() => handleDigit(d)}
          disabled={status !== "listening"}
          highlighted={showGuide && status === "listening" && d === String(target)[input.length]}
        />
      ))}
      <Key label="⌫" onClick={backspace} disabled={status !== "listening"} />
      <Key label="0" onClick={() => handleDigit("0")} disabled={status !== "listening"} highlighted={showGuide && status === "listening" && "0" === String(target)[input.length]} />
      <Key label="Clear" onClick={clear} disabled={status !== "listening"} />
    </div>
  );

  // --- Dev/runtime sanity tests ---
  useEffect(() => {
    // Length checks single run
    const d1 = randomTarget(1);
    const d2 = randomTarget(2);
    const d3 = randomTarget(3);
    console.assert(/^\d$/.test(d1), "randomTarget(1) should produce 1 digit", d1);
    console.assert(/^\d{2}$/.test(d2), "randomTarget(2) should produce 2 digits", d2);
    console.assert(/^\d{3}$/.test(d3), "randomTarget(3) should produce 3 digits", d3);
    console.assert(!/^0/.test(d2), "randomTarget(2) should not start with 0", d2);
    console.assert(!/^0/.test(d3), "randomTarget(3) should not start with 0", d3);
    // Fuzz: run 100 trials for 1–3 digits
    for (let k = 0; k < 100; k++) {
      const a = randomTarget(1);
      const b = randomTarget(2);
      const c = randomTarget(3);
      console.assert(/^\d$/.test(a), "fuzz: len1 wrong", a);
      console.assert(/^\d{2}$/.test(b) && !/^0/.test(b), "fuzz: len2 wrong", b);
      console.assert(/^\d{3}$/.test(c) && !/^0/.test(c), "fuzz: len3 wrong", c);
    }
    // toWords() quick checks
    const W: [number,string][] = [
      [0, "zero"],
      [7, "seven"],
      [10, "ten"],
      [19, "nineteen"],
      [20, "twenty"],
      [21, "twenty one"],
      [34, "thirty four"],
      [43, "forty three"],
      [70, "seventy"],
      [80, "eighty"],
      [99, "ninety nine"],
      [100, "one hundred"],
      [101, "one hundred and one"],
      [110, "one hundred and ten"],
      [219, "two hundred and nineteen"],
      [305, "three hundred and five"],
      [340, "three hundred and forty"],
      [400, "four hundred"],
      [999, "nine hundred and ninety nine"],
    ];
    for (const [n, expect] of W) {
      const got = toWords(n);
      console.assert(got === expect, `toWords(${n}) => ${got} (expected ${expect})`);
    }
  }, []);

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-white">
      {/* Top Bar Controls */}
      <div className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-white/60 bg-white/80 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-5">
            <Segmented
              label="Level"
              options={[
                { label: "1", value: 1 },
                { label: "2", value: 2 },
                { label: "3", value: 3 },
              ]}
              value={level}
              onChange={setLevel}
            />
            <Segmented
              label="Len"
              options={[
                { label: "10", value: 10 },
                { label: "25", value: 25 },
                { label: "50", value: 50 },
              ]}
              value={totalTrials}
              onChange={setTotalTrials}
            />
            {/* Volume */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500 select-none">Vol</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-32"
                aria-label="Volume"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className={classNames(
                "px-4 py-2 rounded-full border hover:bg-slate-100 dark:hover:bg-slate-800",
                showGuide
                  ? "bg-amber-500 text-white border-amber-500 hover:bg-amber-600"
                  : "border-slate-300 dark:border-slate-700"
              )}
              onClick={() => setShowGuide((v) => !v)}
              aria-pressed={showGuide}
              disabled={!target}
            >
              Guide
            </button>
            <button
              className="px-4 py-2 rounded-full border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={() => setShowHint(true)}
              disabled={!target}
            >
              Hint
            </button>
            <button
              className="px-4 py-2 rounded-full bg-emerald-600 text-white shadow hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={listen}
              disabled={!target}
            >
              Listen
            </button>
            <button
              className="px-4 py-2 rounded-full border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => startNextTrial()}
              disabled={status === "complete"}
            >
              Next
            </button>
            <button
              className="px-4 py-2 rounded-full border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={resetAll}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Number Input Task</h1>
            <p className="text-slate-500 mt-1">Listen to the number, then enter it on the keypad.</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-slate-500">Trial</div>
            <div className="text-xl font-semibold">{trialIdx} / {totalTrials}</div>
          </div>
        </div>

        {/* Start screen (centered) */}
        {status === "idle" && (
          <div className="h-[60vh] flex items-center justify-center">
            <button
              className="px-8 py-4 rounded-2xl bg-emerald-600 text-white text-lg shadow hover:bg-emerald-700"
              onClick={resetAll}
            >
              Start
            </button>
          </div>
        )}

        {/* Input panel & keypad only after Start */}
        {status !== "idle" && (
          <>
            <div className="mt-6">
              <div className="rounded-2xl p-6 bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800">
                <div
                  className={classNames(
                    "mt-1 text-3xl font-mono tracking-widest min-h-[2.5rem] text-center flex flex-col items-center",
                    status === "correct" && "text-emerald-600",
                    status === "incorrect" && "text-rose-600"
                  )}
                >
                  <div className="flex items-center justify-center gap-3 min-h-[2.5rem]">
                    <span>{input}</span>
                    {status === "correct" && <span aria-label="correct" className="text-emerald-600 text-3xl">✓</span>}
                    {status === "incorrect" && <span aria-label="incorrect" className="text-rose-600 text-3xl">✗</span>}
                  </div>
                  {showHint && target && (
                    <div className="mt-3 text-2xl font-semibold text-slate-900 dark:text-white text-center">
                      {capitaliseFirst(hyphenateCompoundWords(speechTextForTarget(target, level)))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {keypad}
          </>
        )}

        {/* Live stats */}
        <div className="mt-8 grid sm:grid-cols-3 gap-4">
          <div className="rounded-2xl p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
            <div className="text-sm text-slate-500">Accuracy</div>
            <div className="text-2xl font-semibold">{accuracy}%</div>
          </div>
          <div className="rounded-2xl p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
            <div className="text-sm text-slate-500">Correct (1st try)</div>
            <div className="text-2xl font-semibold">{score}</div>
          </div>
          <div className="rounded-2xl p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
            <div className="text-sm text-slate-500">Trials Complete</div>
            <div className="text-2xl font-semibold">{trialIdx} / {totalTrials}</div>
          </div>
        </div>
      </div>

      {/* Completion modal */}
      {status === "complete" && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl p-6 bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800 text-center">
            <h2 className="text-xl font-semibold">Session complete</h2>
            <div className="mt-3 text-slate-700 dark:text-slate-300">
              <div className="text-lg">Level: <span className="font-semibold">{level}</span></div>
              <div className="text-lg">Trials: <span className="font-semibold">{totalTrials}</span></div>
              <div className="text-lg">Accuracy: <span className="font-semibold">{accuracy}%</span></div>
            </div>
            <div className="mt-5 flex gap-2 justify-center">
              <button
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => {
                  setStatus("idle");
                  resetAll();
                }}
              >
                Restart
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                onClick={() => {
                  setStatus("idle");
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
