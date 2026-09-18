import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** OS-level "Reduce Motion" setting — RN's equivalent of the web's
 *  prefers-reduced-motion media query. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (active) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
