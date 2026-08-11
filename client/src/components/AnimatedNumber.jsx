import React, { useState, useEffect } from 'react';

export default function AnimatedNumber({ target, className = '', style }) {
  const [val, setVal] = useState(0);

  useEffect(() => {
    let raf;
    const start = performance.now();
    const from = val; // animate from previous value
    const to = target;
    const dur = 500;

    function tick(now) {
      const t = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out
      setVal(Math.round(from + (to - from) * ease));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); };
  }, [target]);

  return <span className={className} style={style}>{val}</span>;
}