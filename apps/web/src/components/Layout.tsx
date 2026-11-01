import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { SimulationBanner } from "./SimulationBanner";

const LINKS = [["/investigate", "Investigate"], ["/scripts", "Scripts"], ["/compare", "Compare"], ["/transparency", "Transparency"]] as const;

export function Layout() {
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);

  // Client-side navigation does not move focus, so keyboard and screen reader users would be left behind.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    main.current?.focus();
    window.scrollTo?.(0, 0);
  }, [pathname]);

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <SimulationBanner />
        <div className="site-header-inner">
          <NavLink to="/" className="brand">ScriptEcho</NavLink>
          <nav aria-label="Main">
            <ul>{LINKS.map(([to, label]) => <li key={to}><NavLink to={to}>{label}</NavLink></li>)}</ul>
          </nav>
        </div>
      </header>
      <main id="main" ref={main} tabIndex={-1}><Outlet /></main>
      <footer className="site-footer">
        <p>ScriptEcho is a research aid. It does not authenticate, date, or value objects. Consult a specialist before relying on a result.</p>
      </footer>
    </>
  );
}
