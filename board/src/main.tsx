import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { App } from "./App.js";
import { Landing } from "./landing/Landing.js";
import { Login, Signup } from "./landing/Auth.js";

import { RouteRipple } from "./landing/RippleTransition.js";
import { applyStoredTheme } from "./landing/theme.js";
import "./theme.css";
import "./styles.css";
import "./landing/landing.css";

// Apply any stored theme override before first paint so there's no flash.
applyStoredTheme();

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/board" element={<App />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Routes>
      <RouteRipple />
    </BrowserRouter>
  </StrictMode>,
);
