/* ============================================================================
 * Heliacal Rising Simulator — accessible HTML5 port (KL-UNL pipeline)
 *
 * BEHAVIOR is a faithful port of the decompiled ActionScript (AS1). Constants,
 * formulas and on-screen text are copied verbatim from the source. PRESENTATION
 * follows the KL-UNL foundation + WCAG 2.1 AA.
 *
 * Source modules ported:
 *   CelestialSphere.as + "2..9 CS *.as"  -> Sphere engine (canvas 2D)
 *   Heliacal Rising Timeline.as          -> Timeline (daylight / star visibility)
 *   DefineSprite_256 frame script        -> Controller (updateSphere, locks, reset)
 *   Slider Logic Class v6.as             -> value snapping / fixed-digit formatting
 *
 * Note: the original "Standard Slider v6" controls have their bar+grabber hidden
 * (barMC._visible=false), i.e. they render as plain numeric entry fields. They are
 * reproduced here as native <input type="number"> (fully keyboard operable).
 * ==========================================================================*/
'use strict';

/* ----------------------------------------------------------------------------
 * Constants & small helpers
 * --------------------------------------------------------------------------*/
var DEG       = 0.017453292519943295;   // pi/180
var RAD2DEG   = 57.29577951308232;       // 180/pi
var HRS2RAD   = 0.2617993877991494;      // pi/12  (15 deg per hour, in radians)
var RAD2HRS   = 3.819718634205488;       // 12/pi
var TWO_PI    = 6.283185307179586;
var PI        = 3.141592653589793;
var HALF_PI   = 1.5707963267948966;

// Verbatim physical constants from the AS source
var SIN_OBLIQUITY = 0.39714789063478056; // sin(23.4 deg)
var COS_OBLIQUITY = 0.9177546256839811;  // cos(23.4 deg)
var SIDEREAL_RATE = 1.0027397260273974;  // solar->sidereal day ratio
var SOLAR_RATE    = 0.9972677595628415;  // sidereal->solar
var EOT_SLOPE     = 0.06575342465753424; // 24/365  (equation-of-time term)
var REF_DAY       = 78;                   // day-of-year (0-based) of vernal equinox reference

function mod(n, m) { return ((n % m) + m) % m; }

// Faithful port of the AS Number.toFixed polyfill (round half up).
function toFixedAS(x, f) {
  if (f > 20 || f < 0 || isNaN(x) || !isFinite(x)) { return '...'; }
  var s = '';
  if (x < 0) { s = '-'; x = -x; }
  var out = '';
  if (x < 1e21) {
    var n = Math.round(x * Math.pow(10, f));
    out = (n === 0) ? '0' : n.toString();
    if (f > 0) {
      var k = out.length;
      if (k <= f) {
        var z = '';
        for (var i = 0; i < f + 1 - k; i++) { z += '0'; }
        out = z + out; k = f + 1;
      }
      out = out.substr(0, k - f) + '.' + out.substr(k - f);
    }
  } else { out = x.toString(); }
  return s + out;
}

// Fixed-digit value snapping (SliderLogicClassV6, pMode == "fixed digits")
function snapFixed(x, digits) {
  var inc = Math.pow(10, -digits);
  return inc * Math.round(x / inc);
}

// AS color integer (decimal RGB) -> CSS rgba()
function rgba(intColor, alpha100) {
  var r = (intColor >> 16) & 0xFF, g = (intColor >> 8) & 0xFF, b = intColor & 0xFF;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha100 / 100) + ')';
}

/* ----------------------------------------------------------------------------
 * Canvas / sphere geometry constants
 * --------------------------------------------------------------------------*/
var STAGE = 440, CX = 220, CY = 220;     // sphere canvas (logical px)
var R = 150;                              // sphere radius (size = 300)
var MINSTEP = 0.7853981633974483;         // pi/4  (CSCircles._minStep)
var MIN_PHI = 7, MAX_PHI = 90;            // viewer altitude clamp (minViewerAltitude=7)

/* ----------------------------------------------------------------------------
 * Sphere engine — port of CelestialSphere geometry + circles/lines/objects.
 * Rendered to 2D canvas. Only the elements the heliacal sim actually creates are
 * implemented (no declination trails / shaded bands — those are never added).
 * --------------------------------------------------------------------------*/
function Sphere() {
  this.theta = 0; this.phi = 0; this.lat = 0; this.sTime = 0; // radians
  this.c = {};                 // matrix coefficients (a*, m*, b*)
  this.circles = [];
  this.lines = [];
  this.objects = {};           // sun, star, stickfigure
  this.setThetaAndPhi(90, 30);
  this.setLatitude(41);
  this.setSiderealTime(0);
}
Sphere.prototype.setThetaAndPhi = function (thetaDeg, phiDeg) {
  this.theta = DEG * mod(thetaDeg, 360);
  if (phiDeg > MAX_PHI) phiDeg = MAX_PHI; else if (phiDeg < MIN_PHI) phiDeg = MIN_PHI;
  this.phi = phiDeg * DEG;
  this.recompute();
};
Sphere.prototype.getThetaDeg = function () { return RAD2DEG * this.theta; };
Sphere.prototype.getPhiDeg   = function () { return RAD2DEG * this.phi; };
Sphere.prototype.setLatitude = function (deg) {
  if (deg > 90) deg = 90; else if (deg < -90) deg = -90;
  this.lat = deg * DEG; this.recompute();
};
Sphere.prototype.setSiderealTime = function (hours) {
  this.sTime = mod(hours, 24) * HRS2RAD; this.recompute();
};
// doA: world -> screen (depends on theta, phi, r)
Sphere.prototype.doA = function () {
  var c = this.c, ct = Math.cos(this.theta), st = Math.sin(this.theta),
      cp = Math.cos(this.phi), sp = Math.sin(this.phi);
  c.a0 = -R * st;      c.a1 = R * ct;
  c.a3 = R * ct * sp;  c.a4 = R * st * sp;  c.a5 = -R * cp;
  c.a6 = R * ct * cp;  c.a7 = R * st * cp;  c.a8 = R * sp;
};
// doM: celestial -> world (depends on lat, sidereal time)
Sphere.prototype.doM = function () {
  var c = this.c;
  c.m2 = Math.cos(this.lat);
  c.m3 = Math.sin(this.sTime);
  c.m4 = -Math.cos(this.sTime);
  c.m8 = Math.sin(this.lat);
  c.m0 = c.m4 * c.m8;
  c.m1 = -c.m3 * c.m8;
  c.m6 = -c.m2 * c.m4;
  c.m7 = c.m2 * c.m3;
};
// doB = A . M : celestial -> screen
Sphere.prototype.doB = function () {
  var c = this.c;
  c.b0 = c.a0 * c.m0 + c.a1 * c.m3;
  c.b1 = c.a0 * c.m1 + c.a1 * c.m4;
  c.b2 = c.a0 * c.m2;
  c.b3 = c.a3 * c.m0 + c.a4 * c.m3 + c.a5 * c.m6;
  c.b4 = c.a3 * c.m1 + c.a4 * c.m4 + c.a5 * c.m7;
  c.b5 = c.a3 * c.m2 + c.a5 * c.m8;
  c.b6 = c.a6 * c.m0 + c.a7 * c.m3 + c.a8 * c.m6;
  c.b7 = c.a6 * c.m1 + c.a7 * c.m4 + c.a8 * c.m7;
  c.b8 = c.a6 * c.m2 + c.a8 * c.m8;
};
Sphere.prototype.recompute = function () { this.doA(); this.doM(); this.doB(); };

// world point {x,y,z} -> screen {x,y,z}
Sphere.prototype.WtoSz = function (p) {
  var c = this.c;
  return { x: p.x * c.a0 + p.y * c.a1,
           y: p.x * c.a3 + p.y * c.a4 + p.z * c.a5,
           z: p.x * c.a6 + p.y * c.a7 + p.z * c.a8 };
};
// celestial point -> screen
Sphere.prototype.CtoSz = function (p) {
  var c = this.c;
  return { x: p.x * c.b0 + p.y * c.b1 + p.z * c.b2,
           y: p.x * c.b3 + p.y * c.b4 + p.z * c.b5,
           z: p.x * c.b6 + p.y * c.b7 + p.z * c.b8 };
};

// horizon az/alt (deg) -> world vector (r on unit sphere)
function horizonToWorld(az, alt, r) {
  if (r === undefined) r = 1;
  var d = r * Math.cos(alt * DEG);
  return { x: d * Math.cos(az * DEG), y: d * Math.sin(-az * DEG), z: r * Math.sin(alt * DEG) };
}
// celestial ra(hours)/dec(deg) -> world (celestial) vector
function celestialToVec(ra, dec, r) {
  if (r === undefined) r = 1;
  var d = r * Math.cos(dec * DEG);
  return { x: d * Math.cos(ra * HRS2RAD), y: d * Math.sin(ra * HRS2RAD), z: r * Math.sin(dec * DEG) };
}

/* ---- Circle (great/small circle on the sphere) — port of CSCirclesClass ---- */
function Circle(opts) {
  this.sys = 0; this.tilt = 0; this.lambda = 0; this.beta = 0;
  this.gS = 0; this.gE = 0;
  this.color = opts.color; this.alpha = opts.alpha; this.thick = opts.thick || 1;
  this.visible = true;
  this.w = {};
  this.setParameters(opts.def);
}
Circle.prototype.setParameters = function (a) {
  if (a.alt !== undefined && a.az !== undefined && a.tilt !== undefined) {
    this.sys = 0;
    this.tilt = (a.tilt < 0) ? 0 : (a.tilt > 180 ? PI : a.tilt * DEG);
    this.lambda = (a.alt < -90) ? -PI : (a.alt > 90 ? PI : a.alt * DEG);
    this.beta = DEG * mod(-a.az, 360);
  } else if (a.ra !== undefined && a.dec !== undefined && a.tilt !== undefined) {
    this.sys = 1;
    this.tilt = (a.tilt < 0) ? 0 : (a.tilt > 180 ? PI : a.tilt * DEG);
    this.lambda = (a.dec < -90) ? -PI : (a.dec > 90 ? PI : a.dec * DEG);
    this.beta = HRS2RAD * mod(a.ra, 24);
  }
  if (a.gammaStart !== undefined && isFinite(a.gammaStart)) this.gS = DEG * mod(a.gammaStart, 360);
  if (a.gammaEnd   !== undefined && isFinite(a.gammaEnd))   this.gE = DEG * mod(a.gammaEnd, 360);
  this.doW();
};
Circle.prototype.setDec = function (decDeg) { // used for declinationCircle / declinationArc dec
  this.lambda = (decDeg < -90) ? -PI : (decDeg > 90 ? PI : decDeg * DEG);
  this.sys = 1; this.doW();
};
Circle.prototype.doW = function () {
  var st = Math.sin(this.tilt), ct = Math.cos(this.tilt),
      sb = Math.sin(this.beta), cb = Math.cos(this.beta),
      cl = Math.cos(this.lambda), sl = Math.sin(this.lambda), w = this.w;
  w.w0 = cl * cb;       w.w1 = -cl * sb * ct;  w.w2 = sl * sb * st;
  w.w3 = cl * sb;       w.w4 = cl * cb * ct;   w.w5 = -sl * cb * st;
  w.w7 = cl * st;       w.w8 = sl * ct;
};
// Compute screen-projection coefficients v0..v8 and split into front/back arcs.
Circle.prototype.project = function (sphere) {
  var c = sphere.c, w = this.w, v = this.v = {};
  if (this.sys === 0) {
    v.v0 = c.a0 * w.w0 + c.a1 * w.w3;
    v.v1 = c.a0 * w.w1 + c.a1 * w.w4;
    v.v2 = c.a0 * w.w2 + c.a1 * w.w5;
    v.v3 = c.a3 * w.w0 + c.a4 * w.w3;
    v.v4 = c.a3 * w.w1 + c.a4 * w.w4 + c.a5 * w.w7;
    v.v5 = c.a3 * w.w2 + c.a4 * w.w5 + c.a5 * w.w8;
    v.v6 = c.a6 * w.w0 + c.a7 * w.w3;
    v.v7 = c.a6 * w.w1 + c.a7 * w.w4 + c.a8 * w.w7;
    v.v8 = c.a6 * w.w2 + c.a7 * w.w5 + c.a8 * w.w8;
  } else {
    v.v0 = c.b0 * w.w0 + c.b1 * w.w3;
    v.v1 = c.b0 * w.w1 + c.b1 * w.w4 + c.b2 * w.w7;
    v.v2 = c.b0 * w.w2 + c.b1 * w.w5 + c.b2 * w.w8;
    v.v3 = c.b3 * w.w0 + c.b4 * w.w3;
    v.v4 = c.b3 * w.w1 + c.b4 * w.w4 + c.b5 * w.w7;
    v.v5 = c.b3 * w.w2 + c.b4 * w.w5 + c.b5 * w.w8;
    v.v6 = c.b6 * w.w0 + c.b7 * w.w3;
    v.v7 = c.b6 * w.w1 + c.b7 * w.w4 + c.b8 * w.w7;
    v.v8 = c.b6 * w.w2 + c.b7 * w.w5 + c.b8 * w.w8;
  }
  var front = this.front = [], back = this.back = [];
  if (!this.visible) return;
  function push(list, g1, g2) { list.push([g1, g2]); }

  var A = Math.sqrt(v.v6 * v.v6 + v.v7 * v.v7);
  if (A === 0) {
    if (v.v8 < 0) push(back, this.gS, this.gE); else push(front, this.gS, this.gE);
    return;
  }
  var sj = -v.v8 / A;
  if (sj <= -1) { push(front, this.gS, this.gE); return; }
  if (sj >= 1)  { push(back,  this.gS, this.gE); return; }

  var j = Math.asin(sj), t = Math.atan2(v.v6, v.v7), gDesc, gAsc;
  if (Math.cos(j) < 0) { gDesc = mod(j - t, TWO_PI); gAsc = mod(PI - j - t, TWO_PI); }
  else                 { gDesc = mod(PI - j - t, TWO_PI); gAsc = mod(j - t, TWO_PI); }

  if (this.gS === this.gE) {
    push(front, gAsc, gDesc);
    push(back, gDesc, gAsc);
    return;
  }
  // Partial arc (gammaStart..gammaEnd) split across front/back at gAsc/gDesc.
  var gArr = [[gAsc, 0], [gDesc, 1], [this.gS, 2], [this.gE, 3]];
  gArr.sort(function (a, b) { return a[0] - b[0]; });
  var draw = false, front_ = true, k;
  for (k = 0; k < 4; k++) {
    if (gArr[k][1] === 0) front_ = true;
    else if (gArr[k][1] === 1) front_ = false;
    else if (gArr[k][1] === 2) draw = true;
    else draw = false;
  }
  var prev = gArr[3];
  for (k = 0; k < 4; k++) {
    var cur = gArr[k];
    if (draw && prev[0] !== cur[0]) {
      if (front_) push(front, prev[0], cur[0]); else push(back, prev[0], cur[0]);
    }
    if (cur[1] === 0) front_ = true;
    else if (cur[1] === 1) front_ = false;
    else if (cur[1] === 2) draw = true;
    else draw = false;
    prev = cur;
  }
};
Circle.prototype.stroke = function (ctx, side) {
  if (!this.visible) return;
  var arcs = (side === 'front') ? this.front : this.back, v = this.v;
  if (!arcs || !arcs.length) return;
  ctx.beginPath();
  for (var a = 0; a < arcs.length; a++) buildArc(ctx, v, arcs[a][0], arcs[a][1]);
  ctx.lineWidth = Math.max(1, this.thick);
  ctx.strokeStyle = rgba(this.color, this.alpha);
  ctx.stroke();
};
// Tessellate an arc gamma=g1..g2 using quadratic curves (port of CSCircles drawArc)
function buildArc(ctx, v, g1, g2) {
  if (g2 < g1) g2 += TWO_PI;
  var arc = g2 - g1; if (arc === 0) arc = TWO_PI;
  var n = Math.ceil(arc / MINSTEP), step = arc / n, half = step / 2, cRad = 1 / Math.cos(half);
  var ax = Math.cos(g1), ay = Math.sin(g1);
  ctx.moveTo(CX + v.v0 * ax + v.v1 * ay + v.v2, CY + v.v3 * ax + v.v4 * ay + v.v5);
  var aAngle = g1 + step, cAngle = aAngle - half;
  for (var i = 0; i < n; i++) {
    ax = Math.cos(aAngle); ay = Math.sin(aAngle);
    var cx = cRad * Math.cos(cAngle), cy = cRad * Math.sin(cAngle);
    ctx.quadraticCurveTo(
      CX + v.v0 * cx + v.v1 * cy + v.v2, CY + v.v3 * cx + v.v4 * cy + v.v5,
      CX + v.v0 * ax + v.v1 * ay + v.v2, CY + v.v3 * ax + v.v4 * ay + v.v5);
    aAngle += step; cAngle += step;
  }
}

Sphere.prototype.addCircle = function (name, style, def) {
  var ci = new Circle({ color: style.color, alpha: style.alpha, thick: style.thickness, def: def });
  ci.name = name; this.circles.push(ci); this[name] = ci; return ci;
};

/* ---- Line stub (NCP / SCP axis), celestial endpoints; classified front/back ---- */
function Line(headVec, tailVec, color, thick) {
  this.head = headVec; this.tail = tailVec; this.color = color; this.thick = thick;
}
Sphere.prototype.addLine = function (name, style, headCelestial, tailCelestial) {
  var ln = new Line(headCelestial, tailCelestial, style.color, style.thickness);
  this.lines.push(ln); this[name] = ln; return ln;
};
Sphere.prototype.drawLine = function (ctx, ln, wantSide) {
  var h = this.CtoSz(ln.head), t = this.CtoSz(ln.tail);
  var midZ = (h.z + t.z) / 2;
  var side = (midZ < 0) ? 'back' : 'front';
  if (side !== wantSide) return;
  ctx.beginPath();
  ctx.moveTo(CX + h.x, CY + h.y);
  ctx.lineTo(CX + t.x, CY + t.y);
  ctx.lineWidth = ln.thick; ctx.strokeStyle = rgba(ln.color, 100); ctx.stroke();
};

/* ---- Objects (sun, star) — projected billboards on the sphere surface ---- */
Sphere.prototype.setObject = function (name, ra, dec) {
  this.objects[name] = { ra: ra, dec: dec };
};

/* ----------------------------------------------------------------------------
 * Sphere rendering (approximates the original's shading: back elements dimmed by
 * a translucent overlay, then the green horizon plane, then bright front elements).
 * Geometry/positions are exact; the shading appearance is an approximation.
 * --------------------------------------------------------------------------*/
Sphere.prototype.render = function (ctx) {
  var i;
  // project all circles
  for (i = 0; i < this.circles.length; i++) this.circles[i].project(this);

  ctx.clearRect(0, 0, STAGE, STAGE);

  // sphere body (dark, subtle radial gradient)
  var body = ctx.createRadialGradient(CX, CY, R * 0.1, CX, CY, R);
  body.addColorStop(0, '#0c0c16');
  body.addColorStop(1, '#23232f');
  ctx.save();
  ctx.beginPath(); ctx.arc(CX, CY, R, 0, TWO_PI); ctx.closePath();
  ctx.clip();
  ctx.fillStyle = body; ctx.fillRect(0, 0, STAGE, STAGE);

  // ---- BACK pass (everything behind) ----
  for (i = 0; i < this.circles.length; i++) this.circles[i].stroke(ctx, 'back');
  for (i = 0; i < this.lines.length; i++) this.drawLine(ctx, this.lines[i], 'back');
  this.drawObjects(ctx, 'back');

  // dim the back hemisphere (approximation of the back shading layers)
  ctx.fillStyle = 'rgba(7,7,14,0.62)';
  ctx.fillRect(0, 0, STAGE, STAGE);

  // ---- horizon plane (green ellipse) when looking down on it (phi > 0) ----
  this.drawHorizonPlane(ctx);
  this.drawDirectionLabels(ctx);

  // ---- FRONT pass ----
  for (i = 0; i < this.circles.length; i++) this.circles[i].stroke(ctx, 'front');
  for (i = 0; i < this.lines.length; i++) this.drawLine(ctx, this.lines[i], 'front');
  this.drawObjects(ctx, 'front');
  this.drawStickfigure(ctx);

  ctx.restore();

  // faint sphere rim
  ctx.beginPath(); ctx.arc(CX, CY, R, 0, TWO_PI);
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(120,120,150,0.35)'; ctx.stroke();
};
Sphere.prototype.drawHorizonPlane = function (ctx) {
  if (this.phi <= 0) return;
  // The original rotates the disc sprite by theta and THEN scales y by sin(phi)
  // (parent scale applied after child rotation), so the outline is an AXIS-ALIGNED
  // ellipse (horizontal major axis = R, vertical minor axis = R*sin(phi)); only the
  // texture/labels orbit with theta. The view altitude (phi) opens/closes it (tilt).
  var rx = R, ry = R * Math.sin(this.phi);
  ctx.save();
  ctx.translate(CX, CY);
  ctx.scale(1, ry / rx);
  var grad = ctx.createRadialGradient(0, 0, rx * 0.05, 0, 0, rx);
  grad.addColorStop(0, '#57b24c');
  grad.addColorStop(1, '#2f8a2c');
  ctx.beginPath(); ctx.arc(0, 0, rx, 0, TWO_PI); ctx.closePath();
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = grad; ctx.fill();
  ctx.restore();
};
Sphere.prototype.drawDirectionLabels = function (ctx) {
  if (this.phi <= 0) return;
  var labels = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
  ctx.save();
  ctx.font = 'bold 18px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 2;
  for (var i = 0; i < labels.length; i++) {
    var p = this.WtoSz(horizonToWorld(labels[i][1], 0, 0.82));
    ctx.fillText(labels[i][0], CX + p.x, CY + p.y);
  }
  ctx.restore();
};
Sphere.prototype.drawObjects = function (ctx, side) {
  var keys = ['sun', 'star'];
  for (var k = 0; k < keys.length; k++) {
    var o = this.objects[keys[k]];
    if (!o) continue;
    var sp = this.CtoSz(celestialToVec(o.ra, o.dec, 1));
    var thisSide = (sp.z < 0) ? 'back' : 'front';
    if (thisSide !== side) continue;
    if (keys[k] === 'sun') drawSun(ctx, CX + sp.x, CY + sp.y);
    else drawStar(ctx, CX + sp.x, CY + sp.y);
  }
};
Sphere.prototype.drawStickfigure = function (ctx) {
  // Observer at the horizon origin, oriented with the "absolute" billboard math from
  // CSObjectsClass (oType 2): normal = (-1,0,0), up = (0,0,1) in horizon coords. This
  // skews/foreshortens the figure so it stands on (and rotates/tilts with) the plane.
  var c = this.c;
  var p = { x: 0, y: 0, z: 0 }, n = { x: -1, y: 0, z: 0 }, u = { x: 0, y: 0, z: 1 };
  var sp = this.WtoSz(p);
  var spn = this.WtoSz({ x: p.x + n.x, y: p.y + n.y, z: p.z + n.z });
  var spu = this.WtoSz({ x: p.x + u.x, y: p.y + u.y, z: p.z + u.z });
  var npz = (n.x * c.a6 + n.y * c.a7 + n.z * c.a8) / R;       // normal's screen-z (normalized)
  if (npz === 0) return;                                       // edge-on (looking straight down)
  var A = Math.atan2(spn.y - sp.y, spn.x - sp.x) + HALF_PI;    // shell rotation
  var cA = Math.cos(A), sA = Math.sin(A);
  var x0 = spu.x - sp.x, y0 = spu.y - sp.y;
  var x1 = cA * x0 + sA * y0, y1 = -sA * x0 + cA * y0;
  var instRot = Math.atan2(y1 / npz, x1) + HALF_PI;            // art rotation within the shell

  ctx.save();
  ctx.translate(CX + sp.x, CY + sp.y);   // figure position (sphere centre)
  ctx.rotate(A);                          // shell._rotation
  ctx.scale(1, npz);                      // shell._yscale (xscale = 1)
  ctx.rotate(instRot);                    // instance._rotation
  ctx.scale(1.2, 1.2);                    // initObject _xscale/_yscale = 120
  drawFigureArt(ctx);
  ctx.restore();
};
// Stick-figure art in its local frame: feet at the origin, standing "up" along -y.
// Drawn with a white halo under the black figure so it stays legible against the dark
// sphere (a black figure alone can vanish into the background when foreshortened edge-on).
function drawFigureArt(ctx) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  var hip = -12, sh = -22, head = -27;
  function limbs() {
    ctx.beginPath();
    ctx.moveTo(0, hip); ctx.lineTo(-4, 0); ctx.moveTo(0, hip); ctx.lineTo(4, 0);   // legs to feet
    ctx.moveTo(0, hip); ctx.lineTo(0, sh);                                          // torso
    ctx.moveTo(0, sh + 2); ctx.lineTo(-5, sh + 7); ctx.moveTo(0, sh + 2); ctx.lineTo(5, sh + 7); // arms
  }
  // white outline / halo
  limbs(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.6; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, head, 4.5, 0, TWO_PI); ctx.fillStyle = '#ffffff'; ctx.fill();
  // black figure on top
  limbs(); ctx.strokeStyle = '#000000'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, head, 3.2, 0, TWO_PI); ctx.fillStyle = '#000000'; ctx.fill();
}
function drawSun(ctx, x, y) {
  var rr = 9;
  var g = ctx.createRadialGradient(x, y, 1, x, y, rr);
  g.addColorStop(0, '#fdf6c8'); g.addColorStop(1, '#e6cf6a');
  ctx.beginPath(); ctx.arc(x, y, rr, 0, TWO_PI);
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(180,150,40,0.8)'; ctx.stroke();
}
function drawStar(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#fff7d8';
  ctx.strokeStyle = 'rgba(220,200,120,0.9)'; ctx.lineWidth = 0.8;
  ctx.beginPath();
  var spikes = 4, outer = 8, inner = 2.4;
  for (var i = 0; i < spikes * 2; i++) {
    var rr = (i % 2 === 0) ? outer : inner;
    var ang = (Math.PI / spikes) * i - Math.PI / 2;
    var px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

/* ----------------------------------------------------------------------------
 * Timeline — port of Heliacal Rising Timeline.as (daylight strip, star visibility,
 * tick marks/labels). Rendered to its own canvas.
 * --------------------------------------------------------------------------*/
var TL_W = 690;                  // strip width (setDimensions(690,16))
var TL_H = 16;                   // strip "height" parameter
var TL_MX = 35;                  // left/right margin inside the 760-wide canvas
var TL_BASE = 64;                // baseline y (px) inside canvas
var TL_DAY = 16641937;           // dayColor  (#FDEF91)
var TL_NIGHT = 8421504;          // nightColor (#808080)
var TL_VIS = 3182816;            // starVisibilityColor (#3090E0)
var TWILIGHT_DEG = 7;            // twilightAngle

// Merged label list (defaults + init concat), in the original's order.
var TL_LABELS = [
  { hour: 0, label: 'midnight' },
  { hour: 6, label: '6|AM' },
  { hour: 12, label: 'noon' },
  { hour: 18, label: '6|PM' },
  { hour: 24, label: 'midnight' },
  { hour: 1, minor: true }, { hour: 2, minor: true }, { hour: 3, label: '3|AM' },
  { hour: 4, minor: true }, { hour: 5, minor: true }, { hour: 7, minor: true },
  { hour: 8, minor: true }, { hour: 9, label: '9|AM' }, { hour: 10, minor: true },
  { hour: 11, minor: true }, { hour: 13, minor: true }, { hour: 14, minor: true },
  { hour: 15, label: '3|PM' }, { hour: 16, minor: true }, { hour: 17, minor: true },
  { hour: 19, minor: true }, { hour: 20, minor: true }, { hour: 21, label: '9|PM' },
  { hour: 22, minor: true }, { hour: 23, minor: true }
];

function Timeline() {
  this.dayOfYearZB = 0;
  this.latitude = 0;            // radians
  this.declination = 0;         // radians
  this.rightAscension = 0;      // radians
  this.twilightAngle = TWILIGHT_DEG * DEG;
  this.sunDeclination = 0;      // deg
  this.sunRightAscension = 0;   // hours
  this.siderealTime = 0;        // hours
  this.isRiseAndSet = false;
  this.riseAndSetTimes = null;
}
function lerpColor(c1, c2, x) {
  if (x > 1) x = 1; else if (x < 0) x = 0;
  var r1 = (c1 >> 16) & 0xFF, g1 = (c1 >> 8) & 0xFF, b1 = c1 & 0xFF;
  var r2 = (c2 >> 16) & 0xFF, g2 = (c2 >> 8) & 0xFF, b2 = c2 & 0xFF;
  return 'rgb(' + Math.round(r1 + x * (r2 - r1)) + ',' +
                  Math.round(g1 + x * (g2 - g1)) + ',' +
                  Math.round(b1 + x * (b2 - b1)) + ')';
}
// Port of updateDaylightStrip (computes sun dec/RA as a side effect, as in AS).
Timeline.prototype.drawDaylight = function (ctx) {
  var w = TL_W, h = 0.6 * TL_H / 2, y1 = -h, y2 = h, xNoon = w / 2;
  var sunLongitude = (this.dayOfYearZB - REF_DAY) / 365 * TWO_PI;
  var sunDec = Math.asin(SIN_OBLIQUITY * Math.sin(sunLongitude));
  this.sunDeclination = RAD2DEG * sunDec;
  this.sunRightAscension = mod(RAD2HRS * Math.atan2(Math.sin(sunLongitude) * COS_OBLIQUITY, Math.cos(sunLongitude)), 24);

  var sinSunDec = Math.sin(sunDec), sinLat = Math.sin(this.latitude),
      cosSunDec = Math.cos(sunDec), cosLat = Math.cos(this.latitude);
  var zTwilight = Math.sin(-this.twilightAngle);
  var sinProduct = sinSunDec * sinLat, cosProduct = cosSunDec * cosLat;
  var cosAlphaTw = (zTwilight - sinProduct) / cosProduct;
  var cosAlphaHor = (-sinProduct) / cosProduct;
  var neverAboveTw = cosAlphaTw >= 1, neverBelowTw = cosAlphaTw <= -1;
  var neverAboveHor = cosAlphaHor >= 1, neverBelowHor = cosAlphaHor <= -1;

  function fillRect(x0, x1, color) {
    ctx.fillStyle = color;
    ctx.fillRect(TL_MX + x0, TL_BASE + y1, x1 - x0, y2 - y1);
  }
  if (neverBelowHor) { fillRect(0, w, rgbInt(TL_DAY)); return; }
  if (neverAboveTw)  { fillRect(0, w, rgbInt(TL_NIGHT)); return; }

  var twStartAlpha, twEndAlpha;
  if (neverBelowTw) { twStartAlpha = PI; }
  else {
    twStartAlpha = Math.acos(cosAlphaTw);
    var xNightEnds = xNoon * (1 - twStartAlpha / PI);
    var xNightStarts = xNoon * (1 + twStartAlpha / PI);
    fillRect(0, xNightEnds, rgbInt(TL_NIGHT));
    fillRect(xNightStarts, w, rgbInt(TL_NIGHT));
  }
  if (neverAboveHor) { twEndAlpha = 0; }
  else {
    twEndAlpha = Math.acos(cosAlphaHor);
    var xDayStarts = xNoon * (1 - twEndAlpha / PI);
    var xDayEnds = xNoon * (1 + twEndAlpha / PI);
    fillRect(xDayStarts, xDayEnds, rgbInt(TL_DAY));
  }
  // twilight gradient (sampled, mirrored on both sides of noon)
  var xTwStarts = xNoon * (1 - twStartAlpha / PI);
  var xTwEnds = xNoon * (1 - twEndAlpha / PI);
  var twWidth = xTwEnds - xTwStarts;
  var numSteps = Math.ceil(twWidth / 4);
  if (numSteps > 1) {
    var alphaStep = (twStartAlpha - twEndAlpha) / (numSteps - 1);
    var xStep = (xTwEnds - xTwStarts) / (numSteps - 1);
    var colors = [], s;
    for (s = 0; s < numSteps; s++) {
      var alpha = twStartAlpha - s * alphaStep;
      var sunAlt = Math.asin(Math.cos(alpha) * cosProduct + sinProduct);
      colors.push(lerpColor(TL_DAY, TL_NIGHT, (-sunAlt) / this.twilightAngle));
    }
    for (s = 1; s < numSteps; s++) {
      var x2 = xTwStarts + s * xStep, x1 = x2 - xStep;
      var x4 = 2 * xNoon - x1, x3 = 2 * xNoon - x2;
      paintGrad(ctx, TL_MX + x1, TL_BASE + y1, xStep, y2 - y1, colors[s - 1], colors[s]);
      paintGrad(ctx, TL_MX + x3, TL_BASE + y1, xStep, y2 - y1, colors[s], colors[s - 1]);
    }
  }
};
function rgbInt(c) { return 'rgb(' + ((c >> 16) & 0xFF) + ',' + ((c >> 8) & 0xFF) + ',' + (c & 0xFF) + ')'; }
function paintGrad(ctx, x, y, w, h, cLeft, cRight) {
  var g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, cLeft); g.addColorStop(1, cRight);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
}
// Port of updateStarVisibility (blue bars + rise/set times + labels)
Timeline.prototype.drawStarVisibility = function (ctx) {
  var w = TL_W, y2 = -1.2 * TL_H / 2, y1 = y2 - 0.6 * TL_H / 2, y3 = y1 - 0.2 * TL_H / 2;
  var xNoon = w / 2;
  var sinDec = Math.sin(this.declination), sinLat = Math.sin(this.latitude),
      cosDec = Math.cos(this.declination), cosLat = Math.cos(this.latitude);
  var cosAlpha = (-sinDec) * sinLat / (cosDec * cosLat);
  var siderealDay = (this.dayOfYearZB - REF_DAY) * SIDEREAL_RATE;
  this.siderealTime = 24 * (siderealDay - Math.floor(siderealDay));

  ctx.save();
  ctx.font = '11px Sans-Serif, Arial';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = rgbInt(TL_VIS);

  if (cosAlpha <= -1) {
    ctx.fillText('star never sets', TL_MX + xNoon, TL_BASE + y1 - 2);
    this.isRiseAndSet = false; this.riseAndSetTimes = null; ctx.restore(); return;
  }
  if (cosAlpha >= 1) {
    ctx.fillText('star never rises', TL_MX + xNoon, TL_BASE + y1 - 2);
    this.isRiseAndSet = false; this.riseAndSetTimes = null; ctx.restore(); return;
  }
  var xHalf = Math.acos(cosAlpha) * (w / TWO_PI);
  var t0 = Math.floor(siderealDay) + this.rightAscension / TWO_PI;
  var earlierTransit, laterTransit;
  if (t0 < siderealDay) { earlierTransit = t0; laterTransit = t0 + 1; }
  else { laterTransit = t0; earlierTransit = t0 - 1; }
  var xET = xNoon - (siderealDay - earlierTransit) * SOLAR_RATE * w;
  var xLT = xNoon + (laterTransit - siderealDay) * SOLAR_RATE * w;
  function clamp(x) { return x < 0 ? 0 : (x > w ? w : x); }
  var xETs = clamp(xET - xHalf), xETe = clamp(xET + xHalf);
  var xLTs = clamp(xLT - xHalf), xLTe = clamp(xLT + xHalf);

  ctx.fillStyle = rgbInt(TL_VIS);
  if (xETs !== xETe) ctx.fillRect(TL_MX + xETs, TL_BASE + y2, xETe - xETs, y1 - y2);
  if (xLTs !== xLTe) ctx.fillRect(TL_MX + xLTs, TL_BASE + y2, xLTe - xLTs, y1 - y2);

  var rise, set;
  if (xET > 0 && xET < w) {
    var tx = xETs + (xETe - xETs) / 2;
    ctx.fillStyle = rgbInt(TL_VIS);
    ctx.fillText('star above horizon', TL_MX + tx, TL_BASE + y3 - 2);
    rise = SIDEREAL_RATE * (24 * ((xETs > 0 ? xETs : xLTs) / w) - 12) - 12;
    set  = SIDEREAL_RATE * (24 * ((xETe > 0 ? xETe : xLTe) / w) - 12) - 12;
  } else if (xLT > 0 && xLT < w) {
    var tx2 = xLTs + (xLTe - xLTs) / 2;
    ctx.fillStyle = rgbInt(TL_VIS);
    ctx.fillText('star above horizon', TL_MX + tx2, TL_BASE + y3 - 2);
    rise = SIDEREAL_RATE * (24 * ((xLTs < w ? xLTs : xETs) / w) - 12) - 12;
    set  = SIDEREAL_RATE * (24 * ((xLTe < w ? xLTe : xETe) / w) - 12) - 12;
  }
  this.isRiseAndSet = true;
  this.riseAndSetTimes = { rise: rise, set: set };
  ctx.restore();
};
Timeline.prototype.drawTicksAndLabels = function (ctx) {
  var w = TL_W, a = TL_H / 2;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (var i = 0; i < TL_LABELS.length; i++) {
    var L = TL_LABELS[i], x = TL_MX + w * (L.hour / 24);
    var f = L.minor ? 0.5 : 1;
    ctx.beginPath();
    ctx.strokeStyle = L.minor ? '#606060' : '#000';
    ctx.lineWidth = 1;
    ctx.moveTo(x, TL_BASE + a * f); ctx.lineTo(x, TL_BASE - a * f); ctx.stroke();
    if (L.label) {
      var parts = L.label.split('|');
      ctx.fillStyle = '#000';
      if (parts.length === 2) {           // e.g. "3" + small "AM"
        ctx.font = 'bold 13px Sans-Serif, Arial';
        var numW = ctx.measureText(parts[0]).width;
        ctx.font = 'bold 9px Sans-Serif, Arial';
        var sufW = ctx.measureText(parts[1]).width;
        var total = numW + sufW, left = x - total / 2;
        ctx.textAlign = 'left';
        ctx.font = 'bold 13px Sans-Serif, Arial';
        ctx.fillText(parts[0], left, TL_BASE + a + 3);
        ctx.font = 'bold 9px Sans-Serif, Arial';
        ctx.fillText(parts[1], left + numW, TL_BASE + a + 4);
        ctx.textAlign = 'center';
      } else {
        ctx.font = 'bold 13px Sans-Serif, Arial';
        ctx.fillText(L.label, x, TL_BASE + a + 3);
      }
    }
  }
  ctx.restore();
};
Timeline.prototype.render = function (ctx, cw) {
  ctx.clearRect(0, 0, cw, 120);
  this.drawTicksAndLabels(ctx);
  this.drawDaylight(ctx);
  this.drawStarVisibility(ctx);
};

/* ----------------------------------------------------------------------------
 * Controller — port of the DefineSprite_256 frame script.
 * --------------------------------------------------------------------------*/
var sphere, timeline, sphereCtx, timelineCtx;
var STARS = [{ name: 'Vega', ra: 18.6, dec: 38.8 }, { name: 'Sirius', ra: 6.8, dec: -16.7 }];

var state = {
  dayOfYearZB: REF_DAY,
  latitude: 40.8,        // signed degrees
  declination: -16.7,    // degrees
  rightAscension: 6.8,   // hours
  lockMode: 'noLock',
  cursorFrac: 0.5        // time-of-day cursor position across the strip [0,1]
};

var MONTH_POINTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
var MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function buildSphere() {
  var s = new Sphere();
  s.setThetaAndPhi(150, 35);
  // circles (verbatim from CelestialSphere init)
  s.addCircle('meridian1', { thickness: 1, color: 14737632, alpha: 20 }, { alt: 0, az: 0, tilt: 90 });
  s.addCircle('meridian2', { thickness: 1, color: 14737632, alpha: 20 }, { alt: 0, az: 90, tilt: 90 });
  s.addCircle('eclipticCircle', { thickness: 1, color: 14737632, alpha: 60 }, { ra: 0, dec: 0, tilt: 23.4 });
  s.addCircle('zeroHoursCircle', { thickness: 1, color: 16769909, alpha: 100 }, { ra: 0, dec: 0, tilt: 90, gammaStart: -90, gammaEnd: 90 });
  s.addCircle('celestialEquator', { thickness: 1, color: 16769909, alpha: 100 }, { ra: 0, dec: 0, tilt: 0 });
  s.addCircle('declinationCircle', { thickness: 1, color: 14737632, alpha: 30 }, { tilt: 0, ra: 0, dec: 45 });
  s.addCircle('declinationArc', { thickness: 2, color: TL_VIS, alpha: 100 }, { tilt: 0, ra: 0, dec: 45 });
  // objects
  s.setObject('star', 0, 0);
  s.setObject('sun', 0, 0);
  // pole axis lines (celestial endpoints)
  s.addLine('ncpAxis', { thickness: 2, color: 7711231 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1.2 });
  s.addLine('scpAxis', { thickness: 2, color: 7711231 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: -1.2 });
  return s;
}

/* ---- updateSphere: port of the frame-script function of the same name ---- */
function updateSphere() {
  var sunLongitude = (state.dayOfYearZB - REF_DAY) / 365 * TWO_PI;
  var sunDeclination = Math.asin(SIN_OBLIQUITY * Math.sin(sunLongitude));
  var latRad = timeline.latitude;
  var sinSunDec = Math.sin(sunDeclination), sinLat = Math.sin(latRad);
  var cosSunDec = Math.cos(sunDeclination), cosLat = Math.cos(latRad);
  var zTwilight = Math.sin(-timeline.twilightAngle);
  var sinProduct = sinSunDec * sinLat, cosProduct = cosSunDec * cosLat;
  var cTw = (zTwilight - sinProduct) / cosProduct;
  var cHor = (-sinProduct) / cosProduct;
  var neverAboveTw = cTw >= 1, neverBelowTw = cTw <= -1;
  var neverAboveHor = cHor >= 1, neverBelowHor = cHor <= -1;
  var loc1;                      // hours-from-noon offset
  var cursorVisible = true;

  switch (state.lockMode) {
    case 'twilightStart':
      if (neverAboveTw) { loc1 = 0; cursorVisible = false; }
      else if (neverBelowTw) { loc1 = -12; cursorVisible = false; }
      else loc1 = -RAD2HRS * Math.acos(cTw);
      break;
    case 'sunrise':
      if (neverAboveHor) { loc1 = 0; cursorVisible = false; }
      else if (neverBelowHor) { loc1 = -12; cursorVisible = false; }
      else loc1 = -RAD2HRS * Math.acos(cHor);
      break;
    case 'noon': loc1 = 0; break;
    case 'sunset':
      if (neverAboveHor) { loc1 = 0; cursorVisible = false; }
      else if (neverBelowHor) { loc1 = -12; cursorVisible = false; }
      else loc1 = RAD2HRS * Math.acos(cHor);
      break;
    case 'twilightEnd':
      if (neverAboveTw) { loc1 = 0; cursorVisible = false; }
      else if (neverBelowTw) { loc1 = -12; cursorVisible = false; }
      else loc1 = RAD2HRS * Math.acos(cTw);
      break;
    case 'noLock':
      loc1 = SIDEREAL_RATE * (24 * state.cursorFrac - 12);
      break;
    case 'starRise':
      if (timeline.isRiseAndSet) { loc1 = 12 + timeline.riseAndSetTimes.rise; }
      else { cursorVisible = false; loc1 = 0; }
      break;
    case 'starSet':
      if (timeline.isRiseAndSet) { loc1 = 12 + timeline.riseAndSetTimes.set; }
      else { cursorVisible = false; loc1 = 0; }
      break;
  }
  if (state.lockMode !== 'noLock') {
    state.cursorFrac = mod((loc1 * SOLAR_RATE + 12) / 24, 1);
  }

  var sunRightAscension = mod(RAD2HRS * Math.atan2(Math.sin(sunLongitude) * COS_OBLIQUITY, Math.cos(sunLongitude)), 24);
  var eqnOfTime = sunRightAscension - EOT_SLOPE * mod(state.dayOfYearZB - REF_DAY, 365);
  if (state.lockMode === 'starRise' || state.lockMode === 'starSet') eqnOfTime = 0;

  sphere.setSiderealTime(timeline.siderealTime + loc1 + eqnOfTime);
  updateStarDeclinationArc();

  state.cursorVisible = cursorVisible;
  renderAll();
  positionTodCursor();
}

/* ---- updateStarDeclinationArc: port of frame-script function ---- */
function updateStarDeclinationArc() {
  var sinDec = Math.sin(timeline.declination), sinLat = Math.sin(timeline.latitude),
      cosDec = Math.cos(timeline.declination), cosLat = Math.cos(timeline.latitude);
  var v = (-sinDec) * sinLat / (cosDec * cosLat);
  var arc = sphere.declinationArc;
  if (v <= -1) {
    arc.setParameters({ ra: 0, dec: state.declination, tilt: 0 });
    arc.visible = true;
  } else if (v >= 1) {
    arc.visible = false;
  } else {
    var gammaEnd = Math.acos(v) * RAD2DEG, gammaStart = -gammaEnd;
    arc.setParameters({ ra: sphere.getSiderealTimeHours(), dec: state.declination, tilt: 0,
      gammaStart: gammaStart, gammaEnd: gammaEnd });
    arc.visible = true;
  }
}
Sphere.prototype.getSiderealTimeHours = function () { return RAD2HRS * this.sTime; };

/* ---- change handlers (ported) ---- */
function onDayOfYearZBChanged() {
  timeline.dayOfYearZB = state.dayOfYearZB;
  timeline.drawDaylight(scratchCtx());     // recompute sun dec/RA + sidereal time
  timeline.drawStarVisibility(scratchCtx());
  sphere.setObject('sun', timeline.sunRightAscension, timeline.sunDeclination);
  updateSphere();
}
function onLatitudeChanged() {
  timeline.latitude = state.latitude * DEG;
  sphere.setLatitude(state.latitude);
  recomputeTimelineData();
  updateSphere();
}
function onDeclinationChanged() {
  timeline.declination = state.declination * DEG;
  sphere.setObject('star', state.rightAscension, state.declination);
  sphere.declinationCircle.setDec(state.declination);
  recomputeTimelineData();
  updateSphere();
  updateStarPresetsComboBox();
}
function onRightAscensionChanged() {
  // timeline rightAscension setter wraps >=24 to 0
  var ra = state.rightAscension; if (ra >= 24) ra = 0;
  timeline.rightAscension = ra * DEG * 15;  // hours -> radians (pi/12 per hour)
  sphere.setObject('star', state.rightAscension, state.declination);
  recomputeTimelineData();
  updateSphere();
  updateStarPresetsComboBox();
}
// timeline rightAscension is stored in radians (hours * pi/12)
function recomputeTimelineData() {
  timeline.drawDaylight(scratchCtx());
  timeline.drawStarVisibility(scratchCtx());
}

/* A throwaway 2D context so we can run the timeline's compute-as-it-draws methods
   to refresh sun/sidereal/rise-set data without disturbing the visible canvas. */
var _scratch;
function scratchCtx() {
  if (!_scratch) { var c = document.createElement('canvas'); c.width = 1; c.height = 1; _scratch = c.getContext('2d'); }
  return _scratch;
}

function onStarSelected(name) {
  if (name && name !== '0') {
    for (var i = 0; i < STARS.length; i++) {
      if (name === STARS[i].name) {
        state.declination = STARS[i].dec;
        state.rightAscension = STARS[i].ra;
        timeline.declination = state.declination * DEG;
        timeline.rightAscension = STARS[i].ra * DEG * 15;
        sphere.setObject('star', state.rightAscension, state.declination);
        sphere.declinationCircle.setDec(state.declination);
        syncStarFields();
        recomputeTimelineData();
        updateSphere();
        break;
      }
    }
  }
  updateStarPresetsComboBox();
}
function updateStarPresetsComboBox() {
  var sel = document.getElementById('star-select');
  var idx = 0;
  for (var i = 0; i < STARS.length; i++) {
    if (Math.abs(STARS[i].ra - state.rightAscension) < 1e-12 &&
        Math.abs(STARS[i].dec - state.declination) < 1e-12) {
      idx = (STARS[i].name === 'Sirius') ? 1 : 2; break;
    }
  }
  sel.selectedIndex = idx;
}

/* ---- onLockTimeChanged: port (changes cursor colour + drag enable) ---- */
function onLockTimeChanged() {
  var cursor = document.getElementById('tod-cursor');
  if (state.lockMode === 'noLock') {
    cursor.style.setProperty('--cursor-color', '#ef0a00');  // 15736832 red
    cursor.classList.remove('is-locked');
    cursor.setAttribute('aria-disabled', 'false');
  } else {
    cursor.style.setProperty('--cursor-color', '#5050d0');  // 5263440 muted blue
    cursor.classList.add('is-locked');
    cursor.setAttribute('aria-disabled', 'true');
  }
  updateSphere();
}

/* ---- reset (sim-reset) — restores exact initial state ---- */
function onReset() {
  state.dayOfYearZB = REF_DAY;     // March 20
  state.latitude = 40.8;
  state.lockMode = 'noLock';
  state.cursorFrac = 0.5;          // noon (centre)
  // select Sirius (combobox index 1) -> sets dec/ra
  state.declination = -16.7; state.rightAscension = 6.8;
  sphere.setThetaAndPhi(150, 35);

  timeline.dayOfYearZB = state.dayOfYearZB;
  timeline.latitude = state.latitude * DEG;
  timeline.declination = state.declination * DEG;
  timeline.rightAscension = state.rightAscension * DEG * 15;
  sphere.setLatitude(state.latitude);
  sphere.setObject('star', state.rightAscension, state.declination);
  sphere.setObject('sun', 0, 0);
  sphere.declinationCircle.setDec(state.declination);

  document.getElementById('lock-noLock').checked = true;
  syncDayFields(); syncLatFields(); syncStarFields();
  onLockTimeChanged();
  onDayOfYearZBChanged();
  onLatitudeChanged();
  updateStarPresetsComboBox();
  announce();
}

/* ----------------------------------------------------------------------------
 * Field <-> state synchronisation (the visible numeric fields / selects)
 * --------------------------------------------------------------------------*/
function calendarFromDOY(doy) {
  var i = 0;
  while (i < 12) { if (doy < MONTH_POINTS[i]) break; i++; }
  i = i - 1;
  return { month: i, day: 1 + doy - MONTH_POINTS[i] };
}
function syncDayFields() {
  var cal = calendarFromDOY(state.dayOfYearZB);
  document.getElementById('doy-day').value = cal.day;
  document.getElementById('doy-month').selectedIndex = cal.month;
  var cur = document.getElementById('doy-cursor');
  cur.setAttribute('aria-valuenow', state.dayOfYearZB + 1);
  cur.setAttribute('aria-valuetext', MONTH_LONG[cal.month] + ' ' + cal.day);
  positionDoyCursor();
  drawMonthStrip();
}
function syncLatFields() {
  var lat = state.latitude;
  document.getElementById('lat-value').value = toFixedAS(Math.abs(lat), 1);
  document.getElementById('hemi-select').selectedIndex = (lat >= 0) ? 0 : 1;
  // location preset match
  var loc = document.getElementById('loc-select'), li = 0;
  var data = [null, 40.8, 30];
  for (var i = 1; i < data.length; i++) { if (Math.abs(lat - data[i]) < 1e-12) { li = i; break; } }
  loc.selectedIndex = li;
  var line = document.getElementById('lat-line');
  line.setAttribute('aria-valuenow', toFixedAS(lat, 1));
  line.setAttribute('aria-valuetext', toFixedAS(Math.abs(lat), 1) + ' degrees ' + (lat >= 0 ? 'north' : 'south'));
  positionLatLine();
}
function syncStarFields() {
  document.getElementById('dec-value').value = toFixedAS(state.declination, 1);
  document.getElementById('ra-value').value = toFixedAS(state.rightAscension, 1);
}

/* ----------------------------------------------------------------------------
 * Cursor / map element positioning (HTML overlays on canvases)
 * --------------------------------------------------------------------------*/
function positionTodCursor() {
  var cur = document.getElementById('tod-cursor');
  var canvas = document.getElementById('timeline-canvas');
  var wrap = canvas.parentElement;
  if (!canvas.clientWidth) return;
  cur.style.display = (state.cursorVisible === false) ? 'none' : 'block';
  var xCanvas = TL_MX + state.cursorFrac * TL_W;          // logical px
  var sx = canvas.clientWidth / 760, sy = canvas.clientHeight / 120;
  cur.style.left = (xCanvas * sx) + 'px';
  cur.style.top = (TL_BASE * sy + 4 * sy) + 'px';          // just below the strip, pointing up
}
var STRIP_INSET = 6;        // px inset of the month box from the canvas edges
function positionDoyCursor() {
  var cur = document.getElementById('doy-cursor');
  var canvas = document.getElementById('doy-strip');
  var cssW = canvas.clientWidth || 384;
  var sF = (cssW - 2 * STRIP_INSET) / 365;
  cur.style.left = (STRIP_INSET + (state.dayOfYearZB + 0.5) * sF) + 'px';
  cur.style.top = ((canvas.clientHeight || 34) - 12) + 'px';
}
function positionLatLine() {
  var line = document.getElementById('lat-line');
  // y fraction: lat=+90 -> 0 (top), lat=-90 -> 1 (bottom)
  var frac = (90 - state.latitude) / 180;
  line.style.top = (frac * 100) + '%';
}

/* ----------------------------------------------------------------------------
 * Month strip rendering (Day Of Year Slider art)
 * --------------------------------------------------------------------------*/
function drawMonthStrip() {
  var canvas = document.getElementById('doy-strip');
  var cssW = canvas.clientWidth || 384, cssH = 34;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  // Match the backing store to the *displayed* size so text renders 1:1 (crisp).
  var bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr);
  if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  var ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  var inset = STRIP_INSET, usable = cssW - 2 * inset, sF = usable / 365, top = 4, bot = 26;
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
  ctx.strokeRect(inset + 0.5, top + 0.5, usable, bot - top);
  ctx.fillStyle = '#000';
  ctx.font = '11px Sans-Serif, Arial';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (var m = 0; m < 13; m++) {
    var x = inset + sF * MONTH_POINTS[m];
    ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, top); ctx.lineTo(Math.round(x) + 0.5, bot); ctx.stroke();
    if (m < 12) {
      var cx = inset + sF * (MONTH_POINTS[m] + (MONTH_POINTS[m + 1] - MONTH_POINTS[m]) / 2);
      ctx.fillText(MONTH_SHORT[m], cx, (top + bot) / 2 + 1);
    }
  }
}

/* ----------------------------------------------------------------------------
 * Render orchestration
 * --------------------------------------------------------------------------*/
function renderAll() {
  sphere.render(sphereCtx);
  var tc = document.getElementById('timeline-canvas');
  timeline.render(timelineCtx, 760);
  positionTodCursor();
  updateDiagramDesc();          // keep the canvas's text equivalent in sync with state
}

/* ----------------------------------------------------------------------------
 * Live region announcement (on commit)
 * --------------------------------------------------------------------------*/
function timeString(frac) {
  var totalMin = Math.round(frac * 24 * 60) % (24 * 60);
  var hh = Math.floor(totalMin / 60), mm = totalMin % 60;
  var ap = hh < 12 ? 'AM' : 'PM';
  var h12 = hh % 12; if (h12 === 0) h12 = 12;
  return h12 + ':' + (mm < 10 ? '0' : '') + mm + ' ' + ap;
}
// Spoken number: screen readers often drop a leading "-" glyph, so say "minus".
function spokenNum(x, digits) {
  var s = toFixedAS(x, digits);
  return (s.charAt(0) === '-') ? 'minus ' + s.slice(1) : s;
}
// Which star is selected? (preset name, or "a custom star")
function starDisplayName() {
  for (var i = 0; i < STARS.length; i++) {
    if (Math.abs(STARS[i].ra - state.rightAscension) < 1e-12 &&
        Math.abs(STARS[i].dec - state.declination) < 1e-12) { return 'the star ' + STARS[i].name; }
  }
  return 'a custom star';
}
// Shared visibility phrase (matches the on-screen timeline wording), units-complete.
function visibilityPhrase() {
  if (!timeline.isRiseAndSet) {
    var cosA = (-Math.sin(timeline.declination) * Math.sin(timeline.latitude)) /
               (Math.cos(timeline.declination) * Math.cos(timeline.latitude));
    return (cosA >= 1) ? 'The star never rises.' : 'The star never sets.';
  }
  return 'The star is above the horizon for part of the day.';
}
// Polite live region, debounced so continuous drag/key changes are coalesced
// (announced on settle, not per tick) and never read twice in a row.
var _statusTimer = null, _statusPending = null, _statusLast = '';
function setStatus(text) {
  _statusPending = text;
  if (_statusTimer) clearTimeout(_statusTimer);
  _statusTimer = setTimeout(function () {
    _statusTimer = null;
    if (_statusPending === _statusLast) return;   // avoid duplicate announcements
    _statusLast = _statusPending;
    document.getElementById('sky-status').textContent = _statusPending;
  }, 140);
}
function announce() {
  var cal = calendarFromDOY(state.dayOfYearZB);
  var msg = MONTH_LONG[cal.month] + ' ' + cal.day + '. ';
  msg += 'Latitude ' + toFixedAS(Math.abs(state.latitude), 1) + ' degrees ' +
         (state.latitude >= 0 ? 'north' : 'south') + '. ';
  msg += 'Star declination ' + spokenNum(state.declination, 1) + ' degrees, right ascension ' +
         toFixedAS(state.rightAscension, 1) + ' hours. ';
  msg += visibilityPhrase();
  if (state.lockMode !== 'noLock') {
    msg += ' Time of day locked to ' + lockLabel(state.lockMode) + '.';
  }
  setStatus(msg);
}
// Text equivalent of the canvas, kept in sync with state (read on focus / on demand;
// this element is NOT a live region, so it does not interrupt).
function updateDiagramDesc() {
  var el = document.getElementById('diagram-desc');
  if (!el) return;
  var cal = calendarFromDOY(state.dayOfYearZB);
  var txt = 'Horizon diagram for an observer at latitude ' +
    toFixedAS(Math.abs(state.latitude), 1) + ' degrees ' + (state.latitude >= 0 ? 'north' : 'south') +
    ' on ' + MONTH_LONG[cal.month] + ' ' + cal.day + '. ' +
    'It shows the green horizon plane with the north, east, south and west directions, ' +
    'the observer, the Sun, and ' + starDisplayName() + ' at declination ' +
    spokenNum(state.declination, 1) + ' degrees and right ascension ' +
    toFixedAS(state.rightAscension, 1) + ' hours. ' + visibilityPhrase() +
    ' The view is rotated ' + Math.round(sphere.getThetaDeg()) +
    ' degrees in azimuth and tilted ' + Math.round(sphere.getPhiDeg()) + ' degrees in altitude.';
  el.textContent = txt;
}
function lockLabel(mode) {
  return ({ twilightStart: 'the start of twilight', sunrise: 'sunrise', noon: 'noon',
    sunset: 'sunset', twilightEnd: 'the end of twilight', starRise: 'star rise',
    starSet: 'star set' })[mode] || mode;
}

/* ----------------------------------------------------------------------------
 * Canvas setup (DPR-aware; logical coordinate system preserved)
 * --------------------------------------------------------------------------*/
function setupCanvas(canvas, w, h) {
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = w * dpr; canvas.height = h * dpr;
  var ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/* ----------------------------------------------------------------------------
 * Input wiring
 * --------------------------------------------------------------------------*/
function commitDay() {
  var dayField = document.getElementById('doy-day');
  var month = document.getElementById('doy-month').selectedIndex;
  var day = parseInt(dayField.value, 10);
  if (isNaN(day)) { syncDayFields(); return; }
  var monthLength = MONTH_POINTS[month + 1] - MONTH_POINTS[month];
  if (day > monthLength) { day = monthLength; }
  if (day < 1) day = 1;
  var doy = day + MONTH_POINTS[month] - 1;
  if (doy < 0) doy = 0; else if (doy > 364) doy = 364;
  state.dayOfYearZB = doy;
  syncDayFields();
  onDayOfYearZBChanged();
  announce();
}
function commitLatFromField() {
  var f = parseFloat(document.getElementById('lat-value').value);
  if (isNaN(f)) { syncLatFields(); return; }
  f = Math.abs(f); if (f > 90) f = 90;
  var sign = (document.getElementById('hemi-select').value === 'S') ? -1 : 1;
  state.latitude = snapFixed(sign * f, 1);
  syncLatFields();
  onLatitudeChanged();
  announce();
}
function setLatitude(signedDeg) {
  if (signedDeg > 90) signedDeg = 90; else if (signedDeg < -90) signedDeg = -90;
  state.latitude = snapFixed(signedDeg, 1);
  syncLatFields();
  onLatitudeChanged();
}
function commitDec() {
  var f = parseFloat(document.getElementById('dec-value').value);
  if (isNaN(f)) { syncStarFields(); return; }
  if (f < -90) f = -90; else if (f > 90) f = 90;
  state.declination = snapFixed(f, 1);
  syncStarFields();
  onDeclinationChanged();
  announce();
}
function commitRA() {
  var f = parseFloat(document.getElementById('ra-value').value);
  if (isNaN(f)) { syncStarFields(); return; }
  if (f < 0) f = 0; else if (f > 24) f = 24;
  state.rightAscension = snapFixed(f, 1);
  syncStarFields();
  onRightAscensionChanged();
  announce();
}

function wireControls() {
  // Day of year
  var dayField = document.getElementById('doy-day');
  dayField.addEventListener('change', commitDay);
  document.getElementById('doy-month').addEventListener('change', commitDay);

  // Latitude
  document.getElementById('lat-value').addEventListener('change', commitLatFromField);
  document.getElementById('hemi-select').addEventListener('change', commitLatFromField);
  document.getElementById('loc-select').addEventListener('change', function () {
    var v = this.value;
    if (v !== 'null') { setLatitude(parseFloat(v)); announce(); }
    else { syncLatFields(); }
  });

  // Star
  document.getElementById('dec-value').addEventListener('change', commitDec);
  document.getElementById('ra-value').addEventListener('change', commitRA);
  document.getElementById('star-select').addEventListener('change', function () {
    onStarSelected(this.value); announce();
  });

  // Lock radios
  var radios = document.querySelectorAll('input[name="lockTime"]');
  for (var i = 0; i < radios.length; i++) {
    radios[i].addEventListener('change', function () {
      if (this.checked) { state.lockMode = this.value; onLockTimeChanged(); announce(); }
    });
  }

  wireSphereDrag();
  wireSphereKeys();
  wireTimelineCursor();
  wireLatMap();
  wireMonthStrip();
  wireResize();
}

/* ---- sphere drag (pointer) — port of updateSimpleDragging ---- */
function spherePointer(e) {
  var canvas = document.getElementById('sphere-canvas');
  var rect = canvas.getBoundingClientRect();
  var scale = STAGE / rect.width;
  return { x: (e.clientX - rect.left) * scale - CX, y: (e.clientY - rect.top) * scale - CY };
}
function wireSphereDrag() {
  var diagram = document.getElementById('sphere-diagram');
  var canvas = document.getElementById('sphere-canvas');
  var dragging = false, d0;
  canvas.addEventListener('pointerdown', function (e) {
    dragging = true; canvas.setPointerCapture(e.pointerId);
    var p = spherePointer(e);
    d0 = { lx: p.x, ly: p.y, theta: sphere.theta, phi: sphere.phi };
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var p = spherePointer(e);
    sphere.setThetaAndPhi(
      RAD2DEG * (d0.theta - (p.x - d0.lx) / R),
      RAD2DEG * (d0.phi + (p.y - d0.ly) / R));
    updateStarDeclinationArc();
    renderAll();
  });
  function end() { if (dragging) { dragging = false; announceView(); } }
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}
function announceView() {
  setStatus('View rotated to azimuth ' + Math.round(sphere.getThetaDeg()) +
    ' degrees, altitude ' + Math.round(sphere.getPhiDeg()) + ' degrees.');
}
function wireSphereKeys() {
  var diagram = document.getElementById('sphere-diagram');
  diagram.addEventListener('keydown', function (e) {
    var th = sphere.getThetaDeg(), ph = sphere.getPhiDeg(), step = 5, handled = true;
    switch (e.key) {
      case 'ArrowLeft':  th -= step; break;
      case 'ArrowRight': th += step; break;
      case 'ArrowUp':    ph += step; break;
      case 'ArrowDown':  ph -= step; break;
      default: handled = false;
    }
    if (handled) {
      e.preventDefault();
      sphere.setThetaAndPhi(th, ph);
      updateStarDeclinationArc();
      renderAll();
      announceView();
    }
  });
}

/* ---- time-of-day cursor (pointer drag + keyboard slider) ---- */
function timelineFracFromClientX(clientX) {
  var canvas = document.getElementById('timeline-canvas');
  var rect = canvas.getBoundingClientRect();
  var scale = 760 / rect.width;
  var xCanvas = (clientX - rect.left) * scale;
  return (xCanvas - TL_MX) / TL_W;
}
function setTodFrac(frac) {
  frac = mod(frac, 1);
  state.cursorFrac = frac;
  var cur = document.getElementById('tod-cursor');
  cur.setAttribute('aria-valuenow', toFixedAS(frac * 24, 1));
  cur.setAttribute('aria-valuetext', timeString(frac));
  updateSphere();
}
function wireTimelineCursor() {
  var cur = document.getElementById('tod-cursor');
  var canvas = document.getElementById('timeline-canvas');
  var dragging = false;
  function start(e) {
    if (state.lockMode !== 'noLock') return;
    dragging = true; cur.setPointerCapture && cur.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  cur.addEventListener('pointerdown', start);
  canvas.addEventListener('pointerdown', function (e) {
    if (state.lockMode !== 'noLock') return;
    setTodFrac(timelineFracFromClientX(e.clientX));
    dragging = true; canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  function move(e) { if (dragging) setTodFrac(timelineFracFromClientX(e.clientX)); }
  cur.addEventListener('pointermove', move);
  canvas.addEventListener('pointermove', move);
  function end() { if (dragging) { dragging = false; announce(); } }
  cur.addEventListener('pointerup', end);
  canvas.addEventListener('pointerup', end);
  cur.addEventListener('pointercancel', end);
  canvas.addEventListener('pointercancel', end);

  cur.addEventListener('keydown', function (e) {
    if (state.lockMode !== 'noLock') return;
    var f = state.cursorFrac, step = 1 / (24 * 12), big = 1 / 24, handled = true; // 5-min / 1-hour
    switch (e.key) {
      case 'ArrowLeft': case 'ArrowDown': f -= step; break;
      case 'ArrowRight': case 'ArrowUp': f += step; break;
      case 'PageDown': f -= big; break;
      case 'PageUp': f += big; break;
      case 'Home': f = 0; break;
      case 'End': f = 1 - 1e-9; break;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); setTodFrac(f); announce(); }
  });
}

/* ---- latitude map (pointer drag + keyboard slider) ---- */
function latFromClientY(clientY) {
  var map = document.getElementById('lat-map');
  var rect = map.getBoundingClientRect();
  var frac = (clientY - rect.top) / rect.height;
  return 90 - frac * 180;
}
function wireLatMap() {
  var map = document.getElementById('lat-map');
  var line = document.getElementById('lat-line');
  var wrap = map.parentElement;
  var dragging = false;
  function start(e) { dragging = true; wrap.setPointerCapture && wrap.setPointerCapture(e.pointerId); setLatitude(latFromClientY(e.clientY)); e.preventDefault(); }
  function move(e) { if (dragging) setLatitude(latFromClientY(e.clientY)); }
  function end() { if (dragging) { dragging = false; announce(); } }
  wrap.addEventListener('pointerdown', start);
  wrap.addEventListener('pointermove', move);
  wrap.addEventListener('pointerup', end);
  wrap.addEventListener('pointercancel', end);

  line.addEventListener('keydown', function (e) {
    var lat = state.latitude, step = 0.1, big = 1, handled = true;
    switch (e.key) {
      case 'ArrowUp': case 'ArrowRight': lat += step; break;
      case 'ArrowDown': case 'ArrowLeft': lat -= step; break;
      case 'PageUp': lat += big; break;
      case 'PageDown': lat -= big; break;
      case 'Home': lat = 90; break;
      case 'End': lat = -90; break;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); setLatitude(lat); announce(); }
  });
}

/* ---- month strip (pointer drag sets day-of-year) ---- */
function doyFromClientX(clientX) {
  var canvas = document.getElementById('doy-strip');
  var rect = canvas.getBoundingClientRect();
  var scale = 384 / rect.width;
  var x = (clientX - rect.left) * scale;
  var inset = STRIP_INSET, usable = 384 - 2 * inset;
  return Math.round((x - inset) / (usable / 365) - 0.5);
}
function setDOY(doy) {
  doy = mod(Math.floor(doy), 365);
  state.dayOfYearZB = doy;
  syncDayFields();
  onDayOfYearZBChanged();
}
function wireMonthStrip() {
  var canvas = document.getElementById('doy-strip');
  var cur = document.getElementById('doy-cursor');
  var dragging = false;
  function start(e) { dragging = true; canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); setDOY(doyFromClientX(e.clientX)); e.preventDefault(); }
  function move(e) { if (dragging) setDOY(doyFromClientX(e.clientX)); }
  function end() { if (dragging) { dragging = false; announce(); } }
  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  cur.addEventListener('pointerdown', start);
  cur.addEventListener('pointermove', move);
  cur.addEventListener('pointerup', end);

  cur.addEventListener('keydown', function (e) {
    var doy = state.dayOfYearZB, big = 10, handled = true;
    switch (e.key) {
      case 'ArrowLeft': case 'ArrowDown': doy -= 1; break;
      case 'ArrowRight': case 'ArrowUp': doy += 1; break;
      case 'PageDown': doy -= big; break;
      case 'PageUp': doy += big; break;
      case 'Home': doy = 0; break;
      case 'End': doy = 364; break;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); setDOY(doy); announce(); }
  });
}

function wireResize() {
  var ro;
  // Make the square diagram's height equal the right column's stacked height by
  // widening the left grid column to that height (aspect ratio stays 1:1). In the
  // single-column (phone) layout this is cleared so the foundation rule wins.
  function matchDiagramHeight() {
    var layout = document.querySelector('.app-layout--heliacal');
    var right = document.querySelector('.heliacal-right');
    if (!layout || !right) return;
    if (window.matchMedia('(max-width: 56rem)').matches) {
      if (layout.style.gridTemplateColumns) layout.style.gridTemplateColumns = '';
      return;
    }
    var h = right.getBoundingClientRect().height;
    var lw = layout.getBoundingClientRect().width;
    if (!h || !lw) return;
    var leftPx = Math.min(h, lw * 0.58);          // clamp so the right column keeps usable width
    var curLeft = parseFloat(layout.style.gridTemplateColumns) || 0;
    if (Math.abs(curLeft - leftPx) > 1) {         // guard against ResizeObserver feedback loop
      layout.style.gridTemplateColumns = leftPx + 'px minmax(0, 1fr)';
    }
  }
  function reflow() {
    matchDiagramHeight();
    drawMonthStrip();
    positionTodCursor(); positionDoyCursor(); positionLatLine();
  }
  if (window.ResizeObserver) {
    ro = new ResizeObserver(reflow);
    ro.observe(document.getElementById('sphere-canvas'));
    ro.observe(document.getElementById('timeline-canvas'));
    ro.observe(document.getElementById('doy-strip'));
    ro.observe(document.querySelector('.heliacal-right'));
  }
  window.addEventListener('resize', reflow);
  window.addEventListener('orientationchange', reflow);
}

/* ----------------------------------------------------------------------------
 * MathJax: redefine klunlInitEqn (foundation hook) to typeset the unit symbols.
 * --------------------------------------------------------------------------*/
window.klunlInitEqn = function () {
  if (window.MathJax && MathJax.typesetPromise) {
    MathJax.typesetPromise([document.getElementById('dec-unit'), document.getElementById('ra-unit')])
      .catch(function (err) { console.error(err); });
  }
};

/* ----------------------------------------------------------------------------
 * Boot
 * --------------------------------------------------------------------------*/
function boot() {
  sphereCtx = setupCanvas(document.getElementById('sphere-canvas'), STAGE, STAGE);
  timelineCtx = setupCanvas(document.getElementById('timeline-canvas'), 760, 120);

  sphere = buildSphere();
  timeline = new Timeline();

  wireControls();

  // Reset wiring (masthead dispatches a bubbling, composed 'sim-reset' event)
  document.addEventListener('sim-reset', onReset);

  onReset();

  // Typeset units once MathJax is ready
  if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
    MathJax.startup.promise.then(function () { window.klunlInitEqn(); });
  } else {
    window.addEventListener('load', function () { setTimeout(window.klunlInitEqn, 300); });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else { boot(); }
