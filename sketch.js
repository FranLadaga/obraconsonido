// Carga y réplica del collage de referencia usando módulos PNG de manchas y trazos.
// Autor: Antigravity

let manchas = [];
let trazos = [];
let manchaBlanca;
let growthY = -120; // Altura del frente de crecimiento procedural
let growthWhiteY = 800; // Frente de crecimiento de los elementos blancos
let isAnimatingB = false; // Estado de la animación B
let isShaking = false;    // Estado del temblor (interacción C)
let shakeFrames = 0;      // Frames restantes de temblor
let shakeIntensity = 0;   // Intensidad actual del desplazamiento
let prevVol = 0;          // Volumen del frame anterior (para detectar pico brusco)
let sketchSeed;
let mic;
let fft;

// Paleta ajustada por distancia RGB respecto a referencia.jpeg
const PALETTE_HEX = [
  '#151515', // Negro Profundo
  '#990033', // Borgoña intenso (era #8B0024)
  '#D61C2A', // Rojo Brillante
  '#1F4096', // Azul Eléctrico
  '#00A3C4', // Turquesa / Cian
  '#8AAEDD', // Celeste frío (era #8BBCE5)
  '#5B2C84', // Violeta / Púrpura
  '#00B030', // Verde brillante puro (era #24B14C)
  '#FED300', // Amarillo Sol
  '#F7941D', // Naranja Energético
  '#CC0055'  // Magenta/fucsia intenso (era #E52E71)
];

function preload() {
  // Carga de módulos PNG
  for (let i = 0; i < 4; i++) {
    const img = loadImage(`mancha0${i}.png`, loaded => {
      preprocessImage(loaded);
    });
    manchas.push(img);
  }
  // Carga de la mancha blanca para la parte superior
  manchaBlanca = loadImage('mancha04.png', loaded => {
    preprocessImage(loaded);
  });
  for (let i = 0; i <= 12; i++) {
    const img = loadImage(`trazo${i.toString().padStart(2, '0')}.png`, loaded => {
      preprocessImage(loaded);
    });
    trazos.push(img);
  }
}

function setup() {
  // Lienzo estático de 800x800 píxeles
  const canvas = createCanvas(800, 800);
  canvas.parent('canvas-container');
  sketchSeed = floor(random(10000));

  // Inicializar entrada de micrófono y FFT
  mic = new p5.AudioIn();
  mic.start();
  fft = new p5.FFT();
  fft.setInput(mic);
  userStartAudio(); // Habilitar la escucha de micrófono constante
}

// Helper functions removed for original version

// Scale selection removed for original version

function draw() {
  // B está activo si hay blancos en el canvas
  isAnimatingB = growthWhiteY < 800;

  if (mic) {
    let vol = mic.getLevel();
    fft.analyze();

    // Bass (20–250 Hz): fundamental de la voz
    let bass = fft.getEnergy("bass");

    // LowMid (250–500 Hz): formante F1 del sonido "uuu" (~300–500 Hz)
    let lowMid = fft.getEnergy("lowMid");

    // Agudos PUROS: solo highMid (2000–4000 Hz) y treble (4000–20000 Hz)
    // NO incluimos mid (500–2000 Hz) porque esa banda también es activa en voz grave
    let highMid = fft.getEnergy("highMid");
    let treble = fft.getEnergy("treble");
    let highTotal = max(highMid, treble);

    const umbralVol = 0.01;

    // ── Detección de PALMADA (interacción C) ──
    // Una palmada genera un pico brusco de volumen en 1-2 frames.
    const volSpike = vol - prevVol;
    const umbralSpike = 0.18;
    const umbralVolClap = 0.20;

    if (volSpike > umbralSpike && vol > umbralVolClap && shakeFrames === 0) {
      isShaking = true;
      shakeFrames = 30;
      shakeIntensity = map(vol, umbralVolClap, 1.0, 6, 18);
    }
    prevVol = vol;

    if (vol > umbralVol) {
      const umbralHigh = 25;

      // ── Interacción B: sonido agudo PURO (silbido, "sss") ──
      if (highTotal > umbralHigh) {
        if (growthWhiteY >= 800 || growthWhiteY <= -120) {
          growthWhiteY = Math.max(growthY, 300);
        }
        growthWhiteY += 2.5;
        if (growthWhiteY > 800) growthWhiteY = 800;

        growthY += 2.5;
        if (growthY > 800) growthY = 800;

        // ── Interacción A: "uuu" — bajo sostenido con formantes bajos ──
        // Huella acústica de "uuu": bass alto + lowMid alto + highMid BAJO + sin pico brusco
        // Se diferencia de "aaa"/"eee" porque esos tienen highMid más alto.
        // Se diferencia de la palmada porque volSpike es bajo (sonido sostenido).
      } else if (bass > 70 && lowMid > 50 && highMid < 60 && volSpike < 0.10) {
        if (growthY === -120) {
          growthY = 800;
        }
        growthY -= 2.5;
        if (growthY < -120) growthY = -120;

        if (growthWhiteY < 800) {
          growthWhiteY -= 2.5;
          if (growthWhiteY < -120) growthWhiteY = -120;
        }
      }
    }
  }

  // ── Countdown del temblor C ──
  if (shakeFrames > 0) {
    shakeFrames--;
    if (shakeFrames === 0) {
      isShaking = false;
      shakeIntensity = 0;
    }
  }

  drawComposition();
}

function drawComposition() {
  randomSeed(sketchSeed);
  background(255);

  // ── Interacción C: temblor por palmada ──
  // Aplicamos un translate aleatorio que decrece con los frames restantes
  if (isShaking && shakeFrames > 0) {
    const decay = shakeFrames / 30; // 1.0 al inicio → 0.0 al final
    const ox = random(-shakeIntensity, shakeIntensity) * decay;
    const oy = random(-shakeIntensity, shakeIntensity) * decay;
    translate(ox, oy);
  }

  const graffitiLimitY = -100;
  const smallSpotColors = ['#151515', '#990033', '#D61C2A', '#1F4096', '#00A3C4', '#00B030', '#FED300', '#F7941D', '#CC0055', '#5B2C84'];
  const bigStrokeColors = ['#D61C2A', '#1F4096', '#00A3C4', '#00B030', '#FED300', '#F7941D', '#CC0055', '#8AAEDD', '#151515', '#FFFFFF', '#5B2C84', '#990033'];
  const overlayColors = ['#151515', '#FFFFFF', '#D61C2A', '#00A3C4', '#CC0055', '#5B2C84'];

  // ── Manchas muy pequeñas y puntuales ──
  for (let i = 0; i < 140; i++) {
    const x = random(0, width);
    const y = random(graffitiLimitY, height);
    const img = random(manchas);
    const safeScale = getSafeScale(img, y, graffitiLimitY);
    const scaleFactor = random(0.024, min(0.072, safeScale)); // +20% vs versión anterior
    const angle = random(-PI / 10, PI / 10);
    const alpha = random(180, 230);
    const col = random(smallSpotColors);
    const shouldDraw = isAnimatingB
      ? true
      : (y > growthY && (y >= 240 || y < growthWhiteY));
    if (shouldDraw) {
      placeModuleDirect(img, x, y, scaleFactor, angle, alpha, col);
    }
  }

  // ── Trazos grandes base ──
  for (let i = 0; i < 250; i++) {
    const x = random(-120, width + 120);
    const y = random(graffitiLimitY, height + 120);
    const img = random(trazos);
    const safeScale = getSafeScale(img, y, graffitiLimitY);
    const scaleFactor = random(0.34, min(0.60, safeScale));
    const angle = random(-PI / 8, PI / 8);
    const alpha = random(210, 255);
    const col = random(bigStrokeColors);
    const shouldDraw = isAnimatingB
      ? true
      : (y > growthY && (y >= 240 || y < growthWhiteY));
    if (shouldDraw) {
      placeModuleDirect(img, x, y, scaleFactor, angle, alpha, col);
    }
  }

  // ── Trazos superpuestos densos ──
  for (let i = 0; i < 240; i++) {
    const x = random(-140, width + 140);
    const y = random(graffitiLimitY, height + 140);
    const img = random(trazos);
    const safeScale = getSafeScale(img, y, graffitiLimitY);
    const scaleFactor = random(0.30, min(0.55, safeScale));
    const angle = random(-PI / 6, PI / 6);
    const alpha = random(200, 255);
    const col = random(bigStrokeColors);
    const shouldDraw = isAnimatingB
      ? true
      : (y > growthY && (y >= 240 || y < growthWhiteY));
    if (shouldDraw) {
      placeModuleDirect(img, x, y, scaleFactor, angle, alpha, col);
    }
  }

  // ── Capas de contraste y trazos estructurales ──
  for (let i = 0; i < 130; i++) {
    const x = random(-100, width + 100);
    const y = random(graffitiLimitY, height + 100);
    const img = random(trazos);
    const safeScale = getSafeScale(img, y, graffitiLimitY);
    const scaleFactor = random(0.22, min(0.48, safeScale));
    const angle = random(-PI / 5, PI / 5);
    const alpha = random(215, 255);
    const col = random(overlayColors);
    const shouldDraw = isAnimatingB
      ? true
      : (y > growthY && (y >= 240 || y < growthWhiteY));
    if (shouldDraw) {
      placeModuleDirect(img, x, y, scaleFactor, angle, alpha, col);
    }
  }

  // ── Manchas pequeñas finales encima de todo ──
  for (let i = 0; i < 90; i++) {
    const x = random(0, width);
    const y = random(graffitiLimitY, height);
    const img = random(manchas);
    const safeScale = getSafeScale(img, y, graffitiLimitY);
    const scaleFactor = random(0.02, min(0.06, safeScale));
    const angle = random(-PI / 8, PI / 8);
    const alpha = random(190, 240);
    const col = random(smallSpotColors);
    const shouldDraw = isAnimatingB
      ? true
      : (y > growthY && (y >= 240 || y < growthWhiteY));
    if (shouldDraw) {
      placeModuleDirect(img, x, y, scaleFactor, angle, alpha, col);
    }
  }

  // ── Capa superior de manchas blancas (`mancha04.png`) ──
  // Dibuja manchas blancas para tapar orgánicamente el graffiti de arriba, imitando la referencia
  for (let i = 0; i < 75; i++) {
    const x = random(-80, width + 80);
    const y = random(-120, 160);
    const scaleFactor = random(0.42, 0.90); // +20% vs versión anterior (manchaBlanca)
    if (y < growthWhiteY) {
      placeModuleDirect(manchaBlanca, x, y, scaleFactor, random(-PI, PI), random(230, 255), '#FFFFFF');
    }
  }

  // ── Crecimiento Procedural por encima de las manchas blancas ──
  // Si el frente de crecimiento (growthY) ha entrado en la zona superior,
  // re-dibujamos los elementos del grafiti original que caen en la zona revelada (y > growthY)
  // por encima de las manchas blancas para que queden al frente, simulando que "se comen" el blanco.
  if (growthY < 220) {
    randomSeed(sketchSeed); // Reiniciamos la semilla para reproducir la misma posición y color exactos

    // 1. Manchas muy pequeñas y puntuales
    for (let i = 0; i < 140; i++) {
      const x = random(0, width);
      const y = random(graffitiLimitY, height);
      const img = random(manchas);
      const safeScale = getSafeScale(img, y, graffitiLimitY);
      const scaleFactor = random(0.02, min(0.06, safeScale));
      const angle = random(-PI / 10, PI / 10);
      const alpha = random(180, 230);
      const col = random(smallSpotColors);
      if (y < 220 && y > growthY && y < growthWhiteY) {
        placeModuleDirect(img, x, y, scaleFactor, angle, alpha, col);
      }
    }

    // 2. Trazos grandes base
    for (let i = 0; i < 250; i++) {
      const x = random(-120, width + 120);
      const y = random(graffitiLimitY, height + 120);
      const img = random(trazos);
      const safeScale = getSafeScale(img, y, graffitiLimitY);
      const scaleFactor = random(0.34, min(0.60, safeScale));
      const angle = random(-PI / 8, PI / 8);
      const alpha = random(210, 255);
      const col = random(bigStrokeColors);
      if (y < 220 && y > growthY && y < growthWhiteY) {
        placeModuleDirect(img, x, y, scaleFactor, angle, alpha, col);
      }
    }

    // 3. Trazos superpuestos densos
    for (let i = 0; i < 240; i++) {
      const x = random(-140, width + 140);
      const y = random(graffitiLimitY, height + 140);
      const img = random(trazos);
      const safeScale = getSafeScale(img, y, graffitiLimitY);
      const scaleFactor = random(0.30, min(0.55, safeScale));
      const angle = random(-PI / 6, PI / 6);
      const alpha = random(200, 255);
      const col = random(bigStrokeColors);
      if (y < 220 && y > growthY && y < growthWhiteY) {
        placeModuleDirect(img, x, y, scaleFactor, angle, alpha, col);
      }
    }

    // 4. Capas de contraste y trazos estructurales
    for (let i = 0; i < 130; i++) {
      const x = random(-100, width + 100);
      const y = random(graffitiLimitY, height + 100);
      const img = random(trazos);
      const safeScale = getSafeScale(img, y, graffitiLimitY);
      const scaleFactor = random(0.22, min(0.48, safeScale));
      const angle = random(-PI / 5, PI / 5);
      const alpha = random(215, 255);
      const col = random(overlayColors);
      if (y < 220 && y > growthY && y < growthWhiteY) {
        placeModuleDirect(img, x, y, scaleFactor, angle, alpha, col);
      }
    }

    // 5. Manchas pequeñas finales encima de todo
    for (let i = 0; i < 90; i++) {
      const x = random(0, width);
      const y = random(graffitiLimitY, height);
      const img = random(manchas);
      const safeScale = getSafeScale(img, y, graffitiLimitY);
      const scaleFactor = random(0.02, min(0.06, safeScale));
      const angle = random(-PI / 8, PI / 8);
      const alpha = random(190, 240);
      const col = random(smallSpotColors);
      if (y < 220 && y > growthY && y < growthWhiteY) {
        placeModuleDirect(img, x, y, scaleFactor, angle, alpha, col);
      }
    }
  }
}

/**
 * Coloca un módulo de imagen aplicando tintado, escala y rotación.
 */
function placeModuleDirect(img, posX, posY, scaleFactor, angle, alpha, tintColor) {
  // Temblor en el lugar: jitter pequeño de posición + sacudida de rotación
  const sx = isShaking ? (Math.random() - 0.5) * 12 : 0;
  const sy = isShaking ? (Math.random() - 0.5) * 12 : 0;
  const shakeAngle = isShaking ? (Math.random() - 0.5) * 0.4 : 0;
  push();
  translate(posX + sx, posY + sy);
  rotate(angle + shakeAngle);

  let activeImg = img;
  let activeTintColor = tintColor;

  // En el 30% superior del lienzo (posY < 240), o si la animación B está activa y el elemento está por encima del frente, forzar a color blanco
  if (posY < 240 || (isAnimatingB && posY < growthWhiteY)) {
    activeImg = img.whiteVersion || img;
    activeTintColor = '#FFFFFF';
  }

  const scaleAdjustment = (activeImg.originalWidth || activeImg.width) / activeImg.width;
  scale(scaleFactor * scaleAdjustment * 0.924); // +10% adicional (era 0.84)

  if (activeTintColor) {
    const c = color(activeTintColor);
    c.setAlpha(alpha);
    tint(c);
  } else {
    noTint();
  }

  imageMode(CENTER);
  image(activeImg, 0, 0);
  pop();
}

/**
 * Calcula la escala máxima para garantizar que la imagen nunca supere el límite vertical (yLimit).
 * Usa la diagonal de la imagen para asegurar que se cumpla bajo cualquier rotación.
 */
function getSafeScale(img, posY = null, yLimit = null) {
  const w = img.originalWidth || img.width;
  const h = img.originalHeight || img.height;
  const diag = sqrt(w * w + h * h);
  if (posY !== null && yLimit !== null) {
    if (posY <= yLimit) return 0.001; // si ya está arriba del límite, escala mínima
    return (2 * (posY - yLimit)) / diag;
  }
  return min(0.75, width / diag);
}

function preprocessImage(img) {
  img.originalWidth = img.width;
  img.originalHeight = img.height;

  const targetWidth = img.width > 500 ? 500 : (img.width > 300 ? 300 : img.width);
  if (img.width > targetWidth) {
    img.resize(targetWidth, 0);
  }

  removeBlackBackground(img);
  featherEdges(img, 35); // Suaviza bordes rectangulares duros con un fade de 35px
  img.whiteVersion = createWhiteImg(img);
}

/**
 * Aplica un fade-out progresivo en la zona de borde del rectángulo de la imagen.
 * Los píxeles a menos de featherSize px del borde tienen su alpha reducido.
 * No afecta a los PNG orgánicos porque sus píxeles de borde ya son transparentes.
 */
function featherEdges(img, featherSize) {
  img.loadPixels();
  const px = img.pixels;
  const w = img.width;
  const h = img.height;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (px[idx + 3] === 0) continue; // Ya transparente, saltar

      // Distancia al borde rectangular más cercano
      const dx = min(x, w - 1 - x);
      const dy = min(y, h - 1 - y);
      const d = min(dx, dy);

      if (d < featherSize) {
        // Factor 0 en el borde, 1 al llegar a featherSize
        const factor = d / featherSize;
        px[idx + 3] = Math.round(px[idx + 3] * factor);
      }
    }
  }
  img.updatePixels();
}

function createWhiteImg(img) {
  let whiteImg = createImage(img.width, img.height);
  whiteImg.copy(img, 0, 0, img.width, img.height, 0, 0, img.width, img.height);
  whiteImg.loadPixels();
  const pixels = whiteImg.pixels;
  const len = pixels.length;
  for (let i = 0; i < len; i += 4) {
    if (pixels[i + 3] > 0) {
      pixels[i] = 255;
      pixels[i + 1] = 255;
      pixels[i + 2] = 255;
    }
  }
  whiteImg.updatePixels();
  whiteImg.originalWidth = img.originalWidth;
  whiteImg.originalHeight = img.originalHeight;
  return whiteImg;
}

function removeBlackBackground(img) {
  img.loadPixels();
  const pixels = img.pixels;
  const len = pixels.length;
  const threshold = 90;
  const range = 255 - threshold;

  for (let i = 0; i < len; i += 4) {
    const alpha = pixels[i + 3];
    if (alpha === 0) continue;

    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const brightness = (r + g + b) / 3;

    if (brightness < threshold) {
      pixels[i + 3] = 0;
    } else {
      let opacity = 100 + ((brightness - threshold) * 155) / range;
      if (opacity < 100) opacity = 100;
      else if (opacity > 255) opacity = 255;
      pixels[i + 3] = opacity;
    }
  }
  img.updatePixels();
}

function windowResized() {
  // Sin redimensionamiento dinámico interno para preservar la fidelidad matemática de las escalas
}

// Las interacciones son controladas por micrófono, se desactivaron los disparadores de teclado.
