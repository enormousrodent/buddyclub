'use client';

import { useEffect, useState } from 'react';

/**
 * Types one word after another in place: type, hold, delete, next. Screen readers get the
 * first word as plain text; the animation is aria-hidden. Reduced motion shows the first word
 * and never moves.
 */
export function RotatingWord({
  words,
  className = '',
  typeMs = 95,
  deleteMs = 55,
  holdMs = 3400,
}: {
  words: readonly string[];
  className?: string;
  typeMs?: number;
  deleteMs?: number;
  holdMs?: number;
}) {
  const first = words[0] ?? '';
  const [text, setText] = useState(first);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches || words.length < 2) return;
    setAnimate(true);
    let index = 0;
    let shown = first.length;
    let deleting = false;
    let timer = 0;
    const tick = () => {
      const word = words[index] ?? '';
      if (!deleting) {
        shown += 1;
        setText(word.slice(0, shown));
        if (shown >= word.length) {
          deleting = true;
          timer = window.setTimeout(tick, holdMs);
          return;
        }
        timer = window.setTimeout(tick, typeMs);
      } else {
        shown -= 1;
        setText(word.slice(0, shown));
        if (shown <= 0) {
          deleting = false;
          index = (index + 1) % words.length;
          timer = window.setTimeout(tick, typeMs * 3);
          return;
        }
        timer = window.setTimeout(tick, deleteMs);
      }
    };
    timer = window.setTimeout(tick, holdMs);
    return () => window.clearTimeout(timer);
  }, [words, first, typeMs, deleteMs, holdMs]);

  return (
    <>
      <span className="sr-only">{first}.</span>
      <span aria-hidden="true" className={className}>
        {text}
        <span className={animate ? 'caret' : 'caret caret-still'} />.
      </span>
    </>
  );
}
