// NoVape One – parametrisches CAD für Funktions- und Formmuster
// =============================================================
// Einheiten: mm. z zeigt nach oben, z = 0 ist die Unterkante des Geräts
// (gleiches Koordinatensystem wie das 3D-Modell im Bauplan, dort heißt die Höhe y).
// Vorne (Taste, Lichtstreifen) ist +y, der Lufteinlass sitzt rechts (+x).
//
// Einzelteil exportieren (Beispiel):
//   openscad -D 'part="kartusche_unterteil"' -o kartusche_unterteil.stl novape-one.scad
// Teile: huelse, bodenkappe_v0, kopfteil, kappe, kartusche_unterteil, kartusche_oberteil,
//        taste, chassis_v0, lichtleiter, dichtung_2d, lippendichtung_2d, montage, schnitt
//
// Druck: SLA (Standard-Harz für Form/Funktion). Teile mit Mundkontakt (kappe) nur aus
// biokompatiblem Harz (ISO 10993) oder als Frästeil aus lebensmittelechtem Kunststoff.
// Bohrungen nach dem Druck mit Spiralbohrer auf Nennmaß bringen (siehe Bauplan).

part = "montage";
$fn = 64;

/* ---------- Hauptmaße (aus den Produktfotos, siehe Bauplan) ---------- */
W = 25.0;          // Breite Gehäuse
D = 15.0;          // Tiefe Gehäuse (Querschnitt = Stadion, Radius D/2)
H_SHELL_TOP = 77.0;
wall = 1.2;        // Hülsenwand: 1,2 für Druck, 0,8 für Alu-Serie
foot_inset = 1.6;  // weicher Einzug unten (Foto)

/* ---------- Luftweg ---------- */
inlet_d   = 1.0;   // Einlassbohrung: bestimmt Zugwiderstand und Sensorsignal (1,0 / 1,2 / 1,4 testen)
inlet_z   = 65.15; // Höhe der Einlassbohrung (mündet in die Einlasskammer)
bypass_a  = 0.5;   // Bypass-Rille a × a an der Docht-Bohrung (0 = kein Bypass)
port_x    = -2.5;  // Sensor-Port in der Einlasskammer

/* ---------- Kartusche (Verbrauchsteil) ---------- */
CART_W = 10.6; CART_D = 8.2;
CART_Z0 = 67.2;            // Unterkante Kartusche = Oberkante Dichtung
wick_d = 6.0;              // Docht Ø 6,0 × 12,5 (Prototyp: Slim-Filter 6 mm, gekürzt)
wick_l = 12.5;
bore_d = 5.9;              // Docht-Bohrung, 0,1 mm Übermaß am Docht → Luft muss durch den Docht
LID_Z = 82.3;              // Trennfuge Unterteil/Oberteil
valve_flange_d = 4.0;      // Entenschnabelventil: Flansch Ø 4,0 × 0,5, Körper ≤ Ø 2,6
valve_flange_t = 0.5;
neck_od = 4.2; neck_id = 2.8;
Y_TOP = 98.7;              // Oberkante Y-Kanal (drückt 0,2 mm in die Lippendichtung)

/* ---------- Kopf ---------- */
CAP_Z0 = 77.8; CAP_TOP = 100.0; cap_wall = 0.9;
slot = [7.2, 2.0];         // Auslass-Schlitz
mag_pos = [[10.65, 0], [-10.65, 0]]; // 2 Magnete Ø2×2 (N52) in der Kappe, an den Schmalseiten neben dem Flansch;
mag_d = 2.0; mag_h = 2.0;              // 2 Stahlscheiben Ø2,5×0,5 im Kopfring darunter
washer_d = 2.5; washer_h = 0.5;

/* ---------- V0-Elektronik (Maße eurer Module eintragen) ---------- */
xiao = [17.8, 21.0, 1.2];  // Seeed XIAO nRF52840: B × H × Platinendicke
xiao_y = -2.2;             // Rückseite der Platine (y)
bat = [12, 30, 4.0];       // LiPo 401230: B × H × T
motor = [10, 2.7];         // Münzmotor 1027: Ø × Dicke
tact = [3.0, 6.0, 2.5];    // SMD-Taster 3×6×2,5 (Betätiger nach vorne)

e = 0.01;

/* =========================== Helfer =========================== */
module stadium(w, d) {
  r = min(w, d) / 2;
  if (w >= d) hull() for (s = [-1, 1]) translate([s * (w - d) / 2, 0]) circle(r);
  else hull() for (s = [-1, 1]) translate([0, s * (d - w) / 2]) circle(r);
}
module rrect(w, d, r) {
  r2 = min(r, w / 2 - e, d / 2 - e);
  hull() for (sx = [-1, 1], sy = [-1, 1]) translate([sx * (w / 2 - r2), sy * (d / 2 - r2)]) circle(r2);
}
module slab(z, h, w, d) translate([0, 0, z]) linear_extrude(h) stadium(w, d);
function foot_s(z) = z >= 10 ? 0 : foot_inset * pow((10 - z) / 7.5, 2.2);

/* ====================== Hülse (Gehäuse) ======================= */
module shell_body(off) {
  zs = [for (i = [0 : 12]) 2.5 + 7.5 * i / 12];
  for (i = [0 : 11]) hull() {
    translate([0, 0, zs[i]]) linear_extrude(e) stadium(W - 2 * foot_s(zs[i]) - 2 * off, D - 2 * foot_s(zs[i]) - 2 * off);
    translate([0, 0, zs[i + 1]]) linear_extrude(e) stadium(W - 2 * foot_s(zs[i + 1]) - 2 * off, D - 2 * foot_s(zs[i + 1]) - 2 * off);
  }
  slab(10, H_SHELL_TOP - 10 + (off > 0 ? e : 0), W - 2 * off, D - 2 * off);
}
module huelse() {
  difference() {
    shell_body(0);
    translate([0, 0, -e]) shell_body(wall);
    translate([0, 0, H_SHELL_TOP - e]) linear_extrude(2) stadium(W - 2 * wall, D - 2 * wall);
    // Lichtstreifen 1,0 × 7,1 (vorne, 60,6–67,7)
    translate([0, D / 2, 64.15]) cube([1.0, 4, 7.1], center = true);
    // Tastenfenster 5,4 × 12,4, Mitte z = 49
    translate([0, D / 2, 49]) rotate([90, 0, 0]) linear_extrude(4, center = true) stadium(5.4, 12.4);
    // Lufteinlass rechts – nach dem Druck mit 1,0-mm-Bohrer aufbohren
    translate([W / 2, 0, inlet_z]) rotate([0, 90, 0]) cylinder(d = inlet_d, h = 6, center = true, $fn = 24);
  }
}

/* ================== Bodenkappe (V0, mit XIAO) ================== */
module bodenkappe_v0() {
  difference() {
    union() {
      hull() {
        linear_extrude(e) stadium(21.6 - 1.2, 11.6 - 1.2);
        translate([0, 0, 0.8]) linear_extrude(1.7) stadium(21.6, 11.6);
      }
      // Rastlaschen vorne/hinten (außerhalb der XIAO-Zone)
      for (s = [-1, 1]) translate([-4, s > 0 ? 3.1 : -4.1, 2.5 - e]) cube([8, 1.0, 3.0]);
    }
    // Öffnung für XIAO-Unterkante und USB-C-Stecker (Umspritzung ≈ 12,5 × 6,5)
    translate([0, xiao_y + 1.8, -e]) linear_extrude(3) rrect(13.0, 7.0, 2.2);
    translate([0, xiao_y + xiao[2] / 2, 0.8]) linear_extrude(2) square([xiao[0] + 0.3, xiao[2] + 0.3], center = true);
  }
  // kleine Rastnasen
  for (s = [-1, 1]) translate([-3, s > 0 ? 4.1 - e : -4.1 - 0.4 + e, 4.6]) cube([6, 0.4, 0.6]);
}

/* ============ Kopfteil = Pod-Aufnahme + Pod-Sockel ============= */
SEAT_W = W - 2 * wall - 0.1; SEAT_D = D - 2 * wall - 0.1;
module kopfteil() {
  chamber = [9.4, 7.0];      // Einlasskammer unter der Dichtung
  pocket  = [11.6, 9.2];     // Tasche für Dichtung (11,4 × 9,0 × 1,4) + Kartuschenfuß
  well_out = [13.8, 11.4];
  difference() {
    union() {
      // Aufnahme: Wand 1,0 von 63 bis 77, Boden 63–64,5
      difference() {
        slab(63, 14 + 0.2, SEAT_W, SEAT_D);
        slab(64.5, 14, SEAT_W - 2, SEAT_D - 2);
      }
      // Dichtschacht bis 68,5
      slab(64.5 - e, 4.0 + e, well_out[0], well_out[1]);
      // Steg mit Einlasskanal von der rechten Wand zur Kammer
      intersection() {
        translate([well_out[0] / 2 - 0.5, -1.6, 63]) cube([SEAT_W / 2 - well_out[0] / 2 + 0.5, 3.2, 3.8]);
        slab(63, 4, SEAT_W, SEAT_D);
      }
      // Port-Stutzen unter dem Boden für Silikonschlauch ID 1,0
      translate([port_x, 0, 61.0]) cylinder(d = 2.0, h = 2.0 + e, $fn = 32);
      // Kopfring (sichtbare schwarze Fuge) 77–77,8, außen = Gehäuse
      difference() { slab(77, 0.8, W, D); translate([0, 0, 76.9]) linear_extrude(1) stadium(19.8, 9.8); }
      // Flansch und Turm
      slab(77.8 - e, 2.6 + e, 18.9, 12.4);
      slab(80.4 - e, 4.0 + e, 12.7, 10.2);
      slab(84.4 - e, 0.6 + e, 11.9, 9.4);
      // Stege Ring ↔ Flansch
      difference() { slab(77, 0.8 + e, 19.9, 9.9); slab(76.9, 1, 18.0, 8.0); }
    }
    // Kammer, Tasche, Kartuschen-Führung
    translate([0, 0, 64.5]) linear_extrude(1.3 + e) stadium(chamber[0], chamber[1]);
    translate([0, 0, 65.8]) linear_extrude(2.8) stadium(pocket[0], pocket[1]);
    // Bohrung durch Flansch/Turm/Lippe für die Kartusche (0,15 Spiel)
    translate([0, 0, 68.5 - e]) linear_extrude(17) stadium(CART_W + 0.3, CART_D + 0.3);
    // Einlasskanal Ø 1,2 (die Hülsenbohrung Ø 1,0 ist die Messblende)
    translate([0, 0, inlet_z]) rotate([0, 90, 0]) cylinder(d = 1.2, h = SEAT_W / 2 + 1, $fn = 24);
    // Sensor-Port Ø 1,0 mit Membransenkung Ø 3,4 × 0,3 (ePTFE, klebend)
    translate([port_x, 0, 60]) cylinder(d = 1.0, h = 6, $fn = 24);
    translate([port_x, 0, 64.2]) cylinder(d = 3.4, h = 0.3 + e, $fn = 32);
    // Taschen für Stahlscheiben im Kopfring
    for (p = mag_pos) translate([p[0], p[1], 77.8 - washer_h]) cylinder(d = washer_d + 0.1, h = washer_h + e, $fn = 32);
    // Nut für den Lichtleiter (vorne, 63–67,7)
    translate([-0.8, SEAT_D / 2 - 0.9, 62.9]) cube([1.6, 1, 4.9]);
  }
}

/* ============================ Kappe =========================== */
module cap_shape(off) {
  r = 5.3 - off;
  hull() {
    translate([0, 0, CAP_Z0 - (off > 0 ? e : 0)]) linear_extrude(e) stadium(24.4 - 2 * off, 14.6 - 2 * off);
    translate([0, 0, 86]) linear_extrude(e) stadium(23.4 - 2 * off, 14.0 - 2 * off);
    translate([0, 0, CAP_TOP - 5.3]) minkowski() { linear_extrude(e) stadium(11.8, 2.8); sphere(r, $fn = 32); }
  }
}
module kappe() {
  difference() {
    union() {
      difference() { cap_shape(0); cap_shape(cap_wall); translate([0, 0, CAP_Z0 - 5]) linear_extrude(5) square(40, center = true); }
      // Magnet-Dome innen am Rand
      difference() {
        intersection() {
          cap_shape(0.01);
          for (p = mag_pos) translate([p[0], p[1], CAP_Z0]) cylinder(d = mag_d + 1.2, h = mag_h + 0.6, $fn = 32);
        }
        slab(CAP_Z0 - 1, 4, 18.9 + 0.4, 12.4 + 0.4);   // 0,2 mm Luft zum Flansch
      }
    }
    for (p = mag_pos) translate([p[0], p[1], CAP_Z0 - e]) cylinder(d = mag_d + 0.1, h = mag_h + 0.05, $fn = 32);
    translate([0, 0, CAP_TOP - 2]) linear_extrude(4) rrect(slot[0], slot[1], 0.9);
  }
}

/* ======================= Kartusche ======================= */
module kartusche_unterteil() {
  difference() {
    slab(CART_Z0, LID_Z - CART_Z0, CART_W, CART_D);
    // Einlass unten Ø 2,4 (über dem Dichtungsloch Ø 3,0)
    translate([0, 0, CART_Z0 - e]) cylinder(d = 2.4, h = 1.2, $fn = 32);
    // Docht-Bohrung, unten 0,6 mm Luftraum über drei Stützrippen
    difference() {
      translate([0, 0, CART_Z0 + 1.0]) cylinder(d = bore_d, h = LID_Z - CART_Z0, $fn = 48);
      for (a = [0, 120, 240]) rotate(a) translate([bore_d / 2 - 1.0, -0.3, CART_Z0 + 1.0 - e]) cube([1.2, 0.6, 0.6]);
    }
    // Bypass-Rille a × a an der Bohrungswand (+x), über die ganze Dochtlänge
    if (bypass_a > 0) translate([bore_d / 2 - 0.05, -bypass_a / 2, CART_Z0 + 1.0]) cube([bypass_a + 0.05, bypass_a, LID_Z - CART_Z0]);
  }
}
module kartusche_oberteil() {
  funnel_z = 89.6;
  difference() {
    union() {
      slab(LID_Z, 1.0, CART_W, CART_D);                                  // Deckel
      translate([0, 0, LID_Z + 1.0 - e]) cylinder(d = neck_od, h = funnel_z - LID_Z - 1.0 + e, $fn = 48); // Stiel
      hull() {                                                             // Y-Trichter
        translate([0, 0, funnel_z - e]) cylinder(d = neck_od, h = e, $fn = 48);
        translate([0, 0, Y_TOP - e]) linear_extrude(e) stadium(10.3, 3.1);
      }
    }
    // Ventiltasche von unten (Flansch Ø 4,0 einpressen), Durchgang Ø 2,8
    translate([0, 0, LID_Z - e]) cylinder(d = valve_flange_d - 0.1, h = valve_flange_t + e, $fn = 48);
    translate([0, 0, LID_Z - e]) cylinder(d = neck_id, h = funnel_z - LID_Z + e, $fn = 32);
    hull() {
      translate([0, 0, funnel_z - e]) cylinder(d = neck_id, h = e, $fn = 32);
      translate([0, 0, Y_TOP]) linear_extrude(e + 0.1) stadium(7.4, 1.8);
    }
  }
}

/* ======================= Taste, Lichtleiter ======================= */
module taste() {
  y0 = D / 2 - wall;
  translate([0, y0, 49]) rotate([-90, 0, 0]) {
    translate([0, 0, -0.02 - e]) linear_extrude(wall + 0.12) stadium(4.4, 11.2); // Tastfläche im Fenster
    translate([0, 0, -0.52]) linear_extrude(0.5) stadium(5.9, 12.9);          // Halteflansch innen
    translate([0, 0, -1.6]) cylinder(d = 1.2, h = 1.1 + e, $fn = 16);         // Stößel zum Taster
  }
}
module lichtleiter() {
  // klar drucken (oder mit klarem Harz ausgießen); unten sitzt die weiße LED
  translate([-0.45, D / 2 - wall - 0.02, 60.65]) cube([0.9, wall + 0.02, 7.0]);
  translate([-0.7, SEAT_D / 2 - 0.85, 57.5]) cube([1.4, D / 2 - wall - (SEAT_D / 2 - 0.85) - 0.02, 10.1]);
}

/* ========================== V0-Chassis ========================= */
module chassis_v0() {
  // XIAO steht senkrecht (USB-C unten, z 1,2–22,2) zwischen Bodenkappe und Querplatte.
  // Darüber das Rückgrat: Akku hinten (Klebepad), Motor und Taster vorne, oben die Ablage
  // für das Sensor-Breakout. Die Seitenkanten klemmen in der Hülse.
  spine_y = [-1.0, 0.2];
  xz0 = 1.2; xz1 = xz0 + xiao[1];
  difference() {
    union() {
      translate([-8.8, xiao_y - 0.8, xz1 - 0.6]) cube([17.6, spine_y[1] - xiao_y + 0.8, 1.2]);      // Querplatte
      translate([-10.9, spine_y[0], xz1 + 0.6 - e]) cube([21.8, spine_y[1] - spine_y[0], 57.4 - xz1]); // Rückgrat
      translate([0, spine_y[1] - e, 30]) rotate([-90, 0, 0]) difference() {                          // Motortasche
        cylinder(d = motor[0] + 1.6, h = motor[1] + 0.2, $fn = 48);
        translate([0, 0, -e]) cylinder(d = motor[0] + 0.3, h = motor[1] + 1, $fn = 48);
      }
      translate([-tact[0] / 2 - 0.8, spine_y[1] - e, 49 - tact[1] / 2 - 0.8]) difference() {         // Tasterhalter
        cube([tact[0] + 1.6, 4.6 - tact[2] - spine_y[1] + 0.8, tact[1] + 1.6]);
        translate([0.8, 4.6 - tact[2] - spine_y[1] + e, 0.8]) cube([tact[0], 2, tact[1]]);
      }
      translate([0, 0, 57.4]) linear_extrude(1.2) rrect(16, 9, 2);                                   // Sensor-Ablage
      translate([-1.5, 3.8, 55.6]) cube([3, 2.4, 1.2]);                                              // LED-Halter
    }
    translate([0, xiao_y + xiao[2] / 2, xz1 - 0.6 - e]) cube([xiao[0] + 0.2, xiao[2] + 0.2, 1.6], center = true); // Schlitz für XIAO-Oberkante
    translate([-3, -4.6, 57]) cube([6, 3.2, 2]);                                                     // Kabeldurchlass
  }
}

/* =================== Dichtungen (2D für Laser/Stanze) =================== */
module dichtung_2d()       { difference() { stadium(11.4, 9.0); circle(d = 3.0); } }         // 1,4–1,5 mm Silikon, Shore 40A
module lippendichtung_2d() { difference() { stadium(10.6, 3.6); rrect(7.6, 2.2, 1.0); } }    // 0,6 mm Silikon, unter die Kappe kleben

/* ============================ Ausgabe ============================ */
module teile_farbig() {
  color("#c9b79d", 0.35) huelse();
  color("#1a1a1a") kopfteil();
  color("#6b635a", 0.45) kappe();
  color("#dfe8e4", 0.7) kartusche_unterteil();
  color("#e8d77a") translate([0, 0, CART_Z0 + 1.6]) cylinder(d = wick_d, h = wick_l, $fn = 48);
  color("#222222") kartusche_oberteil();
  color("#888888") translate([0, 0, 65.8]) linear_extrude(1.4) dichtung_2d();
  color("#b8ad9e") taste();
  color("#f4f4f4") lichtleiter();
  color("#2f6d57") translate([0, 0, 0]) chassis_v0();
  color("#333333") bodenkappe_v0();
}

if (part == "huelse") huelse();
else if (part == "bodenkappe_v0") bodenkappe_v0();
else if (part == "kopfteil") kopfteil();
else if (part == "kappe") kappe();
else if (part == "kartusche_unterteil") kartusche_unterteil();
else if (part == "kartusche_oberteil") kartusche_oberteil();
else if (part == "taste") taste();
else if (part == "lichtleiter") lichtleiter();
else if (part == "chassis_v0") chassis_v0();
else if (part == "dichtung_2d") dichtung_2d();
else if (part == "lippendichtung_2d") lippendichtung_2d();
else if (part == "schnitt") intersection() { teile_farbig(); translate([-30, -30, -1]) cube([60, 30, 110]); }
else teile_farbig();
