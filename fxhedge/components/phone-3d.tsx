"use client";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window { THREE: any }
}

const THREE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

type PhoneTheme = "dark" | "light";

interface Palette {
  bgTop: string; bgBot: string; notch: string;
  fg: string; fgSoft: string; muted: string; faint: string; hint: string;
  cardBg: string; cardBorder: string; rowBg: string;
  avatarInactive: string; homeIndicator: string;
  bodyColor: number; bodyRoughness: number;
}

const DARK: Palette = {
  bgTop: "#0b1024", bgBot: "#05060f", notch: "#000",
  fg: "#F5F7FF", fgSoft: "rgba(245,247,255,.7)", muted: "rgba(245,247,255,.5)",
  faint: "rgba(245,247,255,.3)", hint: "rgba(245,247,255,.35)",
  cardBg: "rgba(255,255,255,.03)", cardBorder: "rgba(255,255,255,.09)",
  rowBg: "rgba(255,255,255,.02)", avatarInactive: "rgba(255,255,255,.08)",
  homeIndicator: "rgba(245,247,255,.4)",
  bodyColor: 0x0d0e11, bodyRoughness: 0.30,
};

const LIGHT: Palette = {
  bgTop: "#FDFAF3", bgBot: "#F5EFE4", notch: "#0A0A0A",
  fg: "#0A0A0A", fgSoft: "rgba(10,10,10,.75)", muted: "rgba(10,10,10,.55)",
  faint: "rgba(10,10,10,.35)", hint: "rgba(10,10,10,.40)",
  cardBg: "rgba(0,0,0,.025)", cardBorder: "rgba(0,0,0,.09)",
  rowBg: "rgba(0,0,0,.02)", avatarInactive: "rgba(0,0,0,.06)",
  homeIndicator: "rgba(10,10,10,.35)",
  bodyColor: 0xd6cfc0, bodyRoughness: 0.38,
};

export function Phone3D({
  onLiveValueChange,
  theme = "dark",
}: {
  onLiveValueChange?: (v: string) => void;
  theme?: PhoneTheme;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const themeRef  = useRef<PhoneTheme>(theme);
  themeRef.current = theme;

  // Ref to the redraw function so we can trigger it on theme change
  const redrawRef = useRef<(() => void) | null>(null);
  const bodyMatRef = useRef<any>(null);

  useEffect(() => {
    // Push new theme into the running scene when it changes
    redrawRef.current?.();
    if (bodyMatRef.current) {
      const p = theme === "light" ? LIGHT : DARK;
      bodyMatRef.current.color.setHex(p.bodyColor);
      bodyMatRef.current.roughness = p.bodyRoughness;
      bodyMatRef.current.needsUpdate = true;
    }
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cleanup: (() => void) | null = null;

    function init() {
      const THREE = window.THREE;
      if (!THREE || !canvas) { setFailed(true); return; }

      let renderer: any;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      } catch { setFailed(true); return; }

      const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
      camera.position.set(0, 0, 28);

      // Studio environment for titanium reflections
      try {
        const envC = document.createElement("canvas"); envC.width = 512; envC.height = 256;
        const ec = envC.getContext("2d")!;
        const grd = ec.createLinearGradient(0, 0, 0, 256);
        grd.addColorStop(0, "#c3ccdf"); grd.addColorStop(0.45, "#41496a"); grd.addColorStop(1, "#04050d");
        ec.fillStyle = grd; ec.fillRect(0, 0, 512, 256);
        ec.fillStyle = "rgba(255,255,255,0.95)"; ec.fillRect(0, 34, 512, 12);
        ec.fillStyle = "rgba(190,215,255,0.6)";  ec.fillRect(0, 78, 512, 7);
        ec.fillStyle = "rgba(180,255,210,0.35)"; ec.fillRect(0, 120, 512, 10);
        ec.fillStyle = "rgba(255,245,225,0.4)";  ec.fillRect(0, 164, 512, 16);
        const envTex = new THREE.CanvasTexture(envC); envTex.mapping = THREE.EquirectangularReflectionMapping;
        const pmrem = new THREE.PMREMGenerator(renderer); pmrem.compileEquirectangularShader();
        const envRT = pmrem.fromEquirectangular(envTex);
        scene.environment = envRT.texture; envTex.dispose(); pmrem.dispose();
      } catch {}

      scene.add(new THREE.AmbientLight(0x556088, 0.4));
      const key  = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(6, 9, 10); scene.add(key);
      const rimB = new THREE.DirectionalLight(0x3B82F6, 0.8); rimB.position.set(-9, 3, 4); scene.add(rimB);
      const rimG = new THREE.PointLight(0x22C55E, 0.6, 60);   rimG.position.set(7, -5, 7); scene.add(rimG);

      // Phone screen texture — two canvases: static UI + composite with gloss sweep
      const sc = document.createElement("canvas"); sc.width = 560; sc.height = 1200;
      const gc = sc.getContext("2d")!;
      const ui = document.createElement("canvas"); ui.width = 560; ui.height = 1200;
      const g  = ui.getContext("2d")!;
      const tex = new THREE.CanvasTexture(sc);
      if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;

      const vals = { save: 0, live: 0 };
      function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
        c.beginPath();
        c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
        c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
      }
      function money(n: number) { return "$" + Math.round(n).toLocaleString(); }

      function drawScreen() {
        const p = themeRef.current === "light" ? LIGHT : DARK;
        const W = sc.width, H = sc.height;

        // Background
        g.fillStyle = p.bgBot; rr(g, 0, 0, W, H, 54); g.fill();
        const bg = g.createLinearGradient(0, 0, 0, H * 0.6);
        bg.addColorStop(0, p.bgTop); bg.addColorStop(1, p.bgBot);
        g.fillStyle = bg; rr(g, 0, 0, W, H, 54); g.fill();

        // Dynamic Island (always dark for realism)
        g.fillStyle = "#000"; rr(g, W / 2 - 67, 24, 134, 36, 18); g.fill();

        // Status bar
        g.fillStyle = p.fgSoft; g.font = "500 22px 'Inter',sans-serif";
        g.textBaseline = "alphabetic"; g.textAlign = "left"; g.fillText("9:41", 36, 52);
        g.textAlign = "right"; g.fillText("5G  ▮▮▮", W - 36, 52);

        // App title
        g.textAlign = "left"; g.fillStyle = p.fg; g.font = "400 34px 'Fraunces',serif";
        g.fillText("HalalFlow", 36, 116);

        // Avatar (green orb — brand color, both modes)
        const ag = g.createLinearGradient(W - 72, 92, W - 40, 124);
        ag.addColorStop(0, "#16A34A"); ag.addColorStop(1, "#4ADE80");
        g.fillStyle = ag; g.beginPath(); g.arc(W - 52, 108, 17, 0, 7); g.fill();

        // Invoice card
        g.fillStyle = p.cardBg; rr(g, 32, 148, W - 64, 168, 26); g.fill();
        g.strokeStyle = p.cardBorder; g.lineWidth = 2; rr(g, 32, 148, W - 64, 168, 26); g.stroke();
        g.fillStyle = p.faint; g.font = "500 21px 'Inter',sans-serif"; g.fillText("Supplier invoice", 54, 186);
        g.fillStyle = p.fg; g.font = "600 52px 'IBM Plex Mono',monospace"; g.fillText("$12,000", 54, 246);
        g.font = "500 19px 'Inter',sans-serif";
        g.fillStyle = p.muted; g.fillText("21 days on terms", 54, 294);
        g.textAlign = "right"; g.fillStyle = p.faint; g.font = "500 18px 'Inter',sans-serif";
        g.fillText("mid market $11,952", W - 54, 294); g.textAlign = "left";

        // Section label
        g.fillStyle = p.faint; g.font = "500 19px 'Inter',sans-serif";
        g.fillText("What your supplier receives", 36, 360);

        // Provider rows
        const rows: [string, string, boolean][] = [
          ["Wise",            "$11,890", true ],
          ["Instarem",        "$11,742", false],
          ["Deutsche Bank",   "$11,536", false],
          ["Western Union",   "$11,385", false],
        ];
        let y = 380; const rh = 76, gap = 14;
        for (let i = 0; i < rows.length; i++) {
          const best = rows[i][2];
          if (best) {
            g.fillStyle = "rgba(34,197,94,.14)"; rr(g, 32, y, W - 64, rh, 18); g.fill();
            g.strokeStyle = "rgba(34,197,94,.5)"; g.lineWidth = 2; rr(g, 32, y, W - 64, rh, 18); g.stroke();
          } else {
            g.fillStyle = p.rowBg; rr(g, 32, y, W - 64, rh, 18); g.fill();
          }
          g.fillStyle = best ? "rgba(34,197,94,.25)" : p.avatarInactive;
          rr(g, 52, y + rh / 2 - 18, 36, 36, 9); g.fill();
          g.fillStyle = best ? "#16A34A" : p.muted;
          g.font = "700 20px 'Inter',sans-serif"; g.textAlign = "center";
          g.fillText(best ? "✓" : rows[i][0].slice(0, 2), 70, y + rh / 2 + 7);
          g.textAlign = "left";
          g.fillStyle = p.fg; g.font = "500 24px 'Inter',sans-serif";
          g.fillText(rows[i][0], 104, y + (best ? rh / 2 - 2 : rh / 2 + 8));
          if (best) {
            g.fillStyle = "#16A34A"; g.font = "500 16px 'Inter',sans-serif";
            g.fillText("Best value", 104, y + rh / 2 + 20);
          }
          g.textAlign = "right"; g.fillStyle = best ? "#16A34A" : p.fg;
          g.font = "600 24px 'IBM Plex Mono',monospace"; g.fillText(rows[i][1], W - 54, y + rh / 2 + 8);
          g.textAlign = "left";
          y += rh + gap;
        }

        // Savings banner (brand green in both modes)
        const sy = y + 6;
        const sg = g.createLinearGradient(32, sy, W - 32, sy);
        sg.addColorStop(0, "#16A34A"); sg.addColorStop(1, "#22C55E");
        g.fillStyle = sg; rr(g, 32, sy, W - 64, 80, 20); g.fill();
        g.fillStyle = "rgba(4,18,10,.75)"; g.font = "600 21px 'Inter',sans-serif";
        g.fillText("Saved vs worst rate", 56, sy + 48);
        g.textAlign = "right"; g.fillStyle = "#04120a"; g.font = "600 40px 'IBM Plex Mono',monospace";
        g.fillText(money(vals.save), W - 56, sy + 52); g.textAlign = "left";

        // Footer notes
        const my = sy + 112;
        g.fillStyle = p.hint; g.font = "500 18px 'Inter',sans-serif";
        g.fillText("Read only. HalalFlow never moves your money", 36, my);
        g.fillStyle = "rgba(34,197,94,.9)"; g.beginPath(); g.arc(44, my + 34, 5, 0, 7); g.fill();
        g.fillStyle = p.muted; g.fillText("Halal options: murabaha, wa’d", 60, my + 40);

        // Home indicator
        g.fillStyle = p.homeIndicator; rr(g, W / 2 - 70, H - 34, 140, 7, 4); g.fill();
      }

      function composite(glossProgress: number) {
        const W = sc.width, H = sc.height;
        gc.clearRect(0, 0, W, H);
        gc.drawImage(ui, 0, 0);
        if (glossProgress >= 0) {
          gc.save();
          rr(gc, 0, 0, W, H, 54); gc.clip();
          const bx = -0.35 * W + glossProgress * (1.7 * W);
          gc.translate(bx, 0); gc.rotate(-0.30);
          const bw = 150;
          const lg = gc.createLinearGradient(-bw, 0, bw, 0);
          lg.addColorStop(0,  "rgba(255,255,255,0)");
          lg.addColorStop(0.5,"rgba(255,255,255,0.15)");
          lg.addColorStop(1,  "rgba(255,255,255,0)");
          gc.fillStyle = lg; gc.fillRect(-bw, -H, bw * 2, H * 3);
          gc.restore();
        }
        tex.needsUpdate = true;
      }
      drawScreen();
      composite(-1);
      // Expose redraw so the outer theme-change effect can trigger a refresh
      redrawRef.current = () => { drawScreen(); composite(-1); };
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => { drawScreen(); composite(-1); });
      }

      function roundedRect(w: number, h: number, r: number) {
        const s = new THREE.Shape();
        const x = -w / 2, y = -h / 2;
        s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
        s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
        s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
        return s;
      }

      const phone = new THREE.Group();
      const bodyGeo = new THREE.ExtrudeGeometry(
        roundedRect(6.17, 12.9, 0.95),
        { depth: 0.5, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 8, steps: 1, curveSegments: 24 },
      );
      bodyGeo.center();
      const initPalette = themeRef.current === "light" ? LIGHT : DARK;
      const bodyMat = new THREE.MeshStandardMaterial({
        color:            initPalette.bodyColor,
        metalness:        1.0,
        roughness:        initPalette.bodyRoughness,
        envMapIntensity:  1.7,
      });
      bodyMatRef.current = bodyMat;
      phone.add(new THREE.Mesh(bodyGeo, bodyMat));

      const bezGeo = new THREE.ExtrudeGeometry(roundedRect(5.85, 12.55, 0.85), { depth: 0.05, bevelEnabled: false, curveSegments: 24 });
      bezGeo.center();
      const bez = new THREE.Mesh(bezGeo, new THREE.MeshBasicMaterial({ color: 0x000000 }));
      bez.position.z = 0.5; phone.add(bez);

      const scr = new THREE.Mesh(
        new THREE.PlaneGeometry(5.7, 12.32),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
      );
      scr.position.z = 0.53; phone.add(scr);

      const btnMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 1.0, roughness: 0.26, envMapIntensity: 1.7 });
      const pw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.75, 0.4), btnMat); pw.position.set( 3.16, 0.55, 0); phone.add(pw);
      const v1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.95, 0.4), btnMat); v1.position.set(-3.16, 1.55, 0); phone.add(v1);
      const v2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.95, 0.4), btnMat); v2.position.set(-3.16, 0.45, 0); phone.add(v2);
      const act = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.4), btnMat); act.position.set(-3.16, 2.7, 0);  phone.add(act);

      // Phone rest pose. Values in RADIANS: (X, Y, Z).
      // X = forward/back lean (positive = tilts top away from you)
      // Y = left/right turn  (negative = shows right edge / power button)
      // Z = clock rotation   (negative = counter-clockwise tilt)
      // Quick reference: 0.1 rad ≈ 5.7°, 0.5 rad ≈ 28.6°, 1.0 rad ≈ 57.3°
      phone.rotation.set(0.08, -0.40, -0.35);
      phone.position.y = -16;
      scene.add(phone);

      let targetY = 0, targetX = 0;
      function onMove(e: MouseEvent) {
        const nx = (e.clientX / window.innerWidth)  * 2 - 1;
        const ny = (e.clientY / window.innerHeight) * 2 - 1;
        targetY = nx * 0.28; targetX = ny * 0.16;
      }
      window.addEventListener("mousemove", onMove);

      function resize() {
        if (!canvas) return;
        let w = canvas.clientWidth, h = canvas.clientHeight;
        if (w === 0) { w = 420; h = 600; }
        renderer.setSize(w, h, false);
        camera.aspect = w / h; camera.updateProjectionMatrix();
      }
      window.addEventListener("resize", resize); resize();

      const t0 = performance.now();
      const POP = 1150;
      let countStart: number | null = null, wasGloss = false, firstFrame = true;
      const GLOSS_START = 1500, GLOSS_CYCLE = 5200, GLOSS_DUR = 1250;

      const easeOutBack  = (x: number) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
      const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

      if (REDUCED) {
        phone.position.y = 0;
        vals.save = 505; vals.live = 5842;
        onLiveValueChange?.("$5,842");
        drawScreen(); composite(-1);
      }
      canvas.style.opacity = "1";

      let rafId = 0;
      function frame(now: number) {
        const t = (now - t0) / 1000, elapsed = now - t0;
        let counting = false;
        if (!REDUCED) {
          const p = Math.min(elapsed / POP, 1);
          phone.position.y = -16 + 16 * easeOutBack(p);
          if (p >= 1) {
            phone.position.y = Math.sin(t * 1.1) * 0.28;
            if (countStart === null) countStart = now;
          }
          if (countStart !== null && countStart !== -1) {
            const cs = Math.min((now - (countStart as number)) / 1350, 1);
            const ce = easeOutCubic(cs);
            vals.save = 505  * ce; vals.live = 5842 * ce;
            onLiveValueChange?.(money(vals.live));
            counting = true;
            if (cs >= 1) { vals.save = 505; vals.live = 5842; countStart = -1; onLiveValueChange?.("$5,842"); }
          }
          // Mouse-follow base rotation. Keep these matching the rest pose above,
          // otherwise the phone will drift away from its starting angle.
          const idle = Math.sin(t * 0.35) * 0.06;
          phone.rotation.y += ((-0.32 + targetY + idle) - phone.rotation.y) * 0.06;
          phone.rotation.x += (( 0.10 + targetX)         - phone.rotation.x) * 0.06;
        }

        let glossOn = false, glossProg = -1;
        if (!REDUCED && elapsed > GLOSS_START) {
          const ph = (elapsed - GLOSS_START) % GLOSS_CYCLE;
          if (ph < GLOSS_DUR) { glossOn = true; glossProg = ph / GLOSS_DUR; }
        }

        if (counting) drawScreen();
        if (counting || glossOn || wasGloss || firstFrame) composite(glossOn ? glossProg : -1);
        wasGloss = glossOn; firstFrame = false;

        renderer.render(scene, camera);
        rafId = requestAnimationFrame(frame);
      }
      rafId = requestAnimationFrame(frame);

      cleanup = () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("resize", resize);
        renderer.dispose();
        redrawRef.current = null;
        bodyMatRef.current = null;
      };
    }

    if (window.THREE) {
      init();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${THREE_CDN}"]`);
      if (existing) {
        existing.addEventListener("load", init, { once: true });
        existing.addEventListener("error", () => setFailed(true), { once: true });
      } else {
        const s = document.createElement("script");
        s.src = THREE_CDN; s.async = true;
        s.onload = init; s.onerror = () => setFailed(true);
        document.head.appendChild(s);
      }
    }

    return () => { cleanup?.(); };
  }, [onLiveValueChange]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="relative z-[1] block w-full h-[600px]"
        style={{ opacity: 0, transition: "opacity 0.5s ease" }}
      />
      {failed && (
        <div className="absolute inset-0 grid place-items-center text-sm text-white/55 pointer-events-none">
          Interactive 3D preview needs WebGL.
        </div>
      )}
    </>
  );
}
