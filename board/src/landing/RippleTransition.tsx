// Watches the route and fires a brief ripple flourish only on the "/" → "/board"
// step, reusing the hero water shader. The heavy flourish (three.js) is lazy so
// it never touches the initial bundle. Skipped under reduced motion / no WebGL.

import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { richMotionAllowed } from "./motion.js";

const RippleFlourish = lazy(() =>
  import("./RippleFlourish.js").then((m) => ({ default: m.RippleFlourish })),
);

export function RouteRipple() {
  const location = useLocation();
  const prevPath = useRef(location.pathname);
  const [token, setToken] = useState(0);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const from = prevPath.current;
    const to = location.pathname;
    prevPath.current = to;
    const isTargetBoard = to === "/board" || to.endsWith("/board");
    const isSourceLandingOrConnect = from === "/" || from.endsWith("/connect");
    if (isSourceLandingOrConnect && isTargetBoard && richMotionAllowed()) {
      setToken((t) => t + 1);
      setActive(true);
    }
  }, [location.pathname]);

  if (!active) return null;
  return (
    <Suspense fallback={null}>
      <RippleFlourish key={token} onDone={() => setActive(false)} />
    </Suspense>
  );
}
