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
let peakVol = 0;          // Peak hold del VU meter (decae lentamente)
let peakSpike = 0;        // Peak hold del volSpike (para calibrar umbral palmada)
let sketchSeed;
let mic;
let fft;
let freqSensitivity = 1.0; // Slider 1: multiplicador de amplitud FFT (0.5×–4×)
let growthStep = 2.5;      // Slider 2: paso de crecimiento visual por frame (0.5–8)
let clapThreshold = 0.08;  // Slider 3: umbral de spike para detectar palmada (0.03–0.35)

// ── Interacción D: pulso de escala por silencio prolongado ──
let silenceStartTime = null; // timestamp (millis) del inicio del silencio actual; null = hay sonido
let isInteractionD = false;  // D activo: trazos pulsando en tamaño
let pulseClock     = 0;      // reloj interno del pulso (frames transcurridos en D)
let pulseElementIdx = 0;     // contador de elemento para cálculo de fase
const SILENCE_MS   = 5000;   // ms de silencio continuo para activar D (exactamente 5 s)
const PULSE_PERIOD = 180;    // frames de un ciclo completo (~3 s a 60 fps)
const PULSE_MAX    = 1.7;    // escala máxima del pulso (1.0 = tamaño original)

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
    // Se aplica freqSensitivity como ganancia antes de comparar con umbrales
    let bass    = min(fft.getEnergy("bass")    * freqSensitivity, 255);

    // LowMid (250–500 Hz): formante F1 del sonido "uuu" (~300–500 Hz)
    let lowMid  = min(fft.getEnergy("lowMid")  * freqSensitivity, 255);

    // Agudos PUROS: solo highMid (2000–4000 Hz) y treble (4000–20000 Hz)
    // NO incluimos mid (500–2000 Hz) porque esa banda también es activa en voz grave
    let highMid = min(fft.getEnergy("highMid") * freqSensitivity, 255);
    let treble  = min(fft.getEnergy("treble")  * freqSensitivity, 255);
    let highTotal = max(highMid, treble);

    const umbralVol = 0.01;

    // ── Detección de PALMADA (interacción C) ──
    // Una palmada genera un pico brusco de volumen en 1-2 frames.
    // clapThreshold es configurable desde el slider para adaptarse a headsets
    // que tienen AGC o ganancia diferente a un micrófono de escritorio.
    const volSpike = vol - prevVol;
    const umbralSpike   = clapThreshold;           // spike brusco
    const umbralVolClap = clapThreshold + 0.04;    // nivel mínimo absoluto

    if (volSpike > umbralSpike && vol > umbralVolClap && shakeFrames === 0) {
      isShaking = true;
      shakeFrames = 45;  // extendido de 30 a 45 para efecto más visible
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
        growthWhiteY += growthStep;
        if (growthWhiteY > 800) growthWhiteY = 800;

        growthY += growthStep;
        if (growthY > 800) growthY = 800;

        // ── Interacción A: "uuu" — bajo sostenido con formantes bajos ──
        // Huella acústica de "uuu": bass alto + lowMid alto + highMid BAJO + sin pico brusco
        // Se diferencia de "aaa"/"eee" porque esos tienen highMid más alto.
        // Se diferencia de la palmada porque volSpike es bajo (sonido sostenido).
      } else if (bass > 70 && lowMid > 50 && highMid < 60 && volSpike < 0.10) {
        if (growthY === -120) {
          growthY = 800;
        }
        growthY -= growthStep;
        if (growthY < -120) growthY = -120;

        if (growthWhiteY < 800) {
          growthWhiteY -= growthStep;
          if (growthWhiteY < -120) growthWhiteY = -120;
        }
      }
    }
  }

  // ── Detección de SILENCIO → Interacción D ──
  // Usa millis() en lugar de frames para que sean exactamente 5 s reales,
  // independientemente de la framerate real del sketch.
  if (mic) {
    const vol = mic.getLevel();
    if (vol < 0.01) {
      // Silencio: iniciar cronometro si no estaba corriendo
      if (silenceStartTime === null) silenceStartTime = millis();
      isInteractionD = (millis() - silenceStartTime) >= SILENCE_MS;
    } else {
      // Sonido detectado: cancelar cronómetro y desactivar D
      silenceStartTime = null;
      if (isInteractionD) {
        isInteractionD = false;
        pulseClock = 0;
      }
    }
  }
  if (isInteractionD) pulseClock++;

  // ── Countdown del temblor C ──
  if (shakeFrames > 0) {
    shakeFrames--;
    if (shakeFrames === 0) {
      isShaking = false;
      shakeIntensity = 0;
    }
  }

  updateAudioPanel();
  drawComposition();
}

/**
 * Actualiza el panel de control de audio en el DOM a tiempo real.
 * Se llama cada frame desde draw() con los valores de mic y fft actuales.
 */
function updateAudioPanel() {
  // Obtener valores actuales del audio
  const vol      = mic ? mic.getLevel() : 0;
  const volSpike = vol - prevVol; // recalculado para el panel (prevVol aún no se actualizó)
  const bass     = fft ? fft.getEnergy('bass')    : 0;
  const lowMid   = fft ? fft.getEnergy('lowMid')  : 0;
  const highMid  = fft ? fft.getEnergy('highMid') : 0;
  const treble   = fft ? fft.getEnergy('treble')  : 0;

  // ── Peak hold de volumen: sube rápido, baja lento ──
  if (vol > peakVol) {
    peakVol = vol;
  } else {
    peakVol = max(0, peakVol - 0.002);
  }

  // ── Peak hold de spike: sube instantáneo, decae en ~3 s ──
  // Permite ver cuánto spike máximo genera el headset ante una palmada
  if (volSpike > peakSpike) {
    peakSpike = volSpike;
  } else {
    peakSpike = max(0, peakSpike - 0.0008); // decae más lento que el vol
  }

  // ── VU Meter principal ──
  const vuBar = document.getElementById('vu-bar');
  if (vuBar) vuBar.style.width = (vol * 100).toFixed(1) + '%';
  const vuVal = document.getElementById('vu-val');
  if (vuVal) vuVal.textContent = vol.toFixed(3);
  const peakEl = document.getElementById('peak-val');
  if (peakEl) peakEl.textContent = peakVol.toFixed(3);

  // ── Barras de volumen y spike ──
  setBar('bar-vol',   vol,                    1.0,  'val-vol',    vol.toFixed(3));
  setBar('bar-spike', max(0, volSpike),        0.35, 'val-spike',  volSpike.toFixed(3));

  // ── Peak spike: actualiza el indicador de calibración ──
  const peakSpikeEl = document.getElementById('peak-spike-val');
  if (peakSpikeEl) peakSpikeEl.textContent = peakSpike.toFixed(3);
  // Coloreamos el indicador: rojo si supera el umbral, amarillo si está cerca, gris si lejos
  const spikeStatus = document.getElementById('spike-status');
  if (spikeStatus) {
    if (volSpike >= clapThreshold) {
      spikeStatus.className = 'spike-dot triggered';
    } else if (volSpike >= clapThreshold * 0.6) {
      spikeStatus.className = 'spike-dot near';
    } else {
      spikeStatus.className = 'spike-dot';
    }
  }

  // ── Barras de frecuencia (0-255 → 0-100%) ──
  setBar('bar-bass',    bass,    255, 'val-bass',    Math.round(bass));
  setBar('bar-lowmid',  lowMid,  255, 'val-lowmid',  Math.round(lowMid));
  setBar('bar-highmid', highMid, 255, 'val-highmid', Math.round(highMid));
  setBar('bar-treble',  treble,  255, 'val-treble',  Math.round(treble));

  // ── Estado de interacciones ──
  const isActiveA = vol > 0.01 && bass > 70 && lowMid > 50 && highMid < 60;
  const isActiveB = isAnimatingB;
  const isActiveC = isShaking;
  const isActiveD = isInteractionD;

  setDot('dot-a', isActiveA, 'active-a');
  setDot('dot-b', isActiveB, 'active-b');
  setDot('dot-c', isActiveC, 'active-c');
  setDot('dot-d', isActiveD, 'active-d');
}

/** Helper: actualiza el ancho de una barra y su etiqueta numérica */
function setBar(barId, value, maxVal, labelId, labelText) {
  const el = document.getElementById(barId);
  if (el) el.style.width = ((value / maxVal) * 100).toFixed(1) + '%';
  const lbl = document.getElementById(labelId);
  if (lbl) lbl.textContent = labelText;
}

/** Helper: activa/desactiva la clase CSS de un indicador de estado */
function setDot(dotId, isActive, activeClass) {
  const el = document.getElementById(dotId);
  if (!el) return;
  if (isActive) {
    el.classList.add(activeClass);
  } else {
    el.classList.remove(activeClass);
  }
}

function drawComposition() {
  randomSeed(sketchSeed);
  pulseElementIdx = 0; // resetear contador de fase D al inicio de cada frame
  background(255);

  // ── Interacción C: temblor por palmada ──
  // Aplicamos un translate aleatorio que decrece con los frames restantes
  if (isShaking && shakeFrames > 0) {
    const decay = shakeFrames / 330; // 1.0 al inicio → 0.0 al final (330 frames totales)
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
    const ps = getPulseScale(pulseElementIdx++);
    const shouldDraw = isAnimatingB
      ? true
      : (y > growthY && (y >= 240 || y < growthWhiteY));
    if (shouldDraw) {
      placeModuleDirect(img, x, y, scaleFactor * ps, angle, alpha, col);
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
    const ps = getPulseScale(pulseElementIdx++);
    const shouldDraw = isAnimatingB
      ? true
      : (y > growthY && (y >= 240 || y < growthWhiteY));
    if (shouldDraw) {
      placeModuleDirect(img, x, y, scaleFactor * ps, angle, alpha, col);
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
    const ps = getPulseScale(pulseElementIdx++);
    const shouldDraw = isAnimatingB
      ? true
      : (y > growthY && (y >= 240 || y < growthWhiteY));
    if (shouldDraw) {
      placeModuleDirect(img, x, y, scaleFactor * ps, angle, alpha, col);
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
    const ps = getPulseScale(pulseElementIdx++);
    const shouldDraw = isAnimatingB
      ? true
      : (y > growthY && (y >= 240 || y < growthWhiteY));
    if (shouldDraw) {
      placeModuleDirect(img, x, y, scaleFactor * ps, angle, alpha, col);
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
    const ps = getPulseScale(pulseElementIdx++);
    const shouldDraw = isAnimatingB
      ? true
      : (y > growthY && (y >= 240 || y < growthWhiteY));
    if (shouldDraw) {
      placeModuleDirect(img, x, y, scaleFactor * ps, angle, alpha, col);
    }
  }

  // ── Capa superior de manchas blancas (`mancha04.png`) ──
  // Dibuja manchas blancas para tapar orgánicamente el graffiti de arriba, imitando la referencia.
  // El pulso de escala se reduce al 70% para que no tapen demasiado la zona superior.
  for (let i = 0; i < 75; i++) {
    const x = random(-80, width + 80);
    const y = random(-120, 160);
    const scaleFactor = random(0.42, 0.90);
    const rawPs = getPulseScale(pulseElementIdx++);
    const ps = 1.0 + (rawPs - 1.0) * 0.7; // 30% menos amplitud de pulso para blancos
    if (y < growthWhiteY) {
      placeModuleDirect(manchaBlanca, x, y, scaleFactor * ps, random(-PI, PI), random(230, 255), '#FFFFFF');
    }
  }

  // ── Crecimiento Procedural por encima de las manchas blancas ──
  // Si el frente de crecimiento (growthY) ha entrado en la zona superior,
  // re-dibujamos los elementos del grafiti original que caen en la zona revelada (y > growthY)
  // por encima de las manchas blancas para que queden al frente, simulando que "se comen" el blanco.
  if (growthY < 220) {
    randomSeed(sketchSeed); // Reiniciamos la semilla para reproducir la misma posición y color exactos
    pulseElementIdx = 0;    // Reiniciamos el índice de pulso para sincronizar fases con el primer pase

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
      const ps = getPulseScale(pulseElementIdx++);
      if (y < 220 && y > growthY && y < growthWhiteY) {
        placeModuleDirect(img, x, y, scaleFactor * ps, angle, alpha, col);
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
      const ps = getPulseScale(pulseElementIdx++);
      if (y < 220 && y > growthY && y < growthWhiteY) {
        placeModuleDirect(img, x, y, scaleFactor * ps, angle, alpha, col);
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
      const ps = getPulseScale(pulseElementIdx++);
      if (y < 220 && y > growthY && y < growthWhiteY) {
        placeModuleDirect(img, x, y, scaleFactor * ps, angle, alpha, col);
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
      const ps = getPulseScale(pulseElementIdx++);
      if (y < 220 && y > growthY && y < growthWhiteY) {
        placeModuleDirect(img, x, y, scaleFactor * ps, angle, alpha, col);
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
      const ps = getPulseScale(pulseElementIdx++);
      if (y < 220 && y > growthY && y < growthWhiteY) {
        placeModuleDirect(img, x, y, scaleFactor * ps, angle, alpha, col);
      }
    }
  }
}

/**
 * Calcula el multiplicador de escala (onda triangular lineal) para el elemento #idx.
 * Cada elemento tiene un desfase de fase proporcional a su índice dentro del total (850),
 * lo que hace que el crecimiento/decrecimiento ocurra de forma independiente y escalonada.
 * Devuelve 1.0 si la interacción D no está activa.
 */
function getPulseScale(idx) {
  if (!isInteractionD) return 1.0;
  // Desfase proporcional: los 850 elementos cubren un ciclo completo de PULSE_PERIOD
  const phase = (idx % 850) / 850 * PULSE_PERIOD;
  const t = (pulseClock + phase) % PULSE_PERIOD;
  const half = PULSE_PERIOD / 2;
  if (t < half) {
    // Crecimiento lineal: 1.0 → PULSE_MAX
    return 1.0 + (PULSE_MAX - 1.0) * (t / half);
  } else {
    // Decrecimiento lineal: PULSE_MAX → 1.0
    return PULSE_MAX - (PULSE_MAX - 1.0) * ((t - half) / half);
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

/**
 * Callback del slider de Sensibilidad.
 * Actualiza freqSensitivity y refresca el indicador numérico y el gradiente de la pista.
 */
function onSensitivityChange(val) {
  freqSensitivity = parseFloat(val);
  const display = document.getElementById('sensitivity-val');
  if (display) display.textContent = freqSensitivity.toFixed(1) + '×';

  // Actualiza el gradiente del track para mostrar el progreso
  const slider = document.getElementById('sensitivity-slider');
  if (slider) {
    const min  = parseFloat(slider.min);   // 0.5
    const max  = parseFloat(slider.max);   // 4.0
    const pct  = ((freqSensitivity - min) / (max - min) * 100).toFixed(1);
    slider.style.background =
      `linear-gradient(to right, #00bcd4 0%, #00bcd4 ${pct}%, #2a2a2a ${pct}%, #2a2a2a 100%)`;
  }
}

/**
 * Callback del slider de Velocidad de Crecimiento.
 * Actualiza growthStep y refresca el indicador numérico y el gradiente de la pista.
 */
function onSpeedChange(val) {
  growthStep = parseFloat(val);
  const display = document.getElementById('speed-val');
  if (display) display.textContent = growthStep.toFixed(1);

  // Actualiza el gradiente del track
  const slider = document.getElementById('speed-slider');
  if (slider) {
    const min  = parseFloat(slider.min);   // 0.5
    const max  = parseFloat(slider.max);   // 8.0
    const pct  = ((growthStep - min) / (max - min) * 100).toFixed(1);
    slider.style.background =
      `linear-gradient(to right, #ff7043 0%, #ff7043 ${pct}%, #2a2a2a ${pct}%, #2a2a2a 100%)`;
  }
}

/**
 * Callback del slider de Umbral Palmada.
 * Controla cuán brusco debe ser el pico de volumen para disparar la interacción C.
 * Bajar este valor hace la detección más sensible (ideal para headsets con AGC).
 */
function onClapThresholdChange(val) {
  clapThreshold = parseFloat(val);
  const display = document.getElementById('clap-threshold-val');
  if (display) display.textContent = clapThreshold.toFixed(2);

  // Actualiza el gradiente del track
  const slider = document.getElementById('clap-threshold-slider');
  if (slider) {
    const min  = parseFloat(slider.min);   // 0.03
    const max  = parseFloat(slider.max);   // 0.35
    const pct  = ((clapThreshold - min) / (max - min) * 100).toFixed(1);
    slider.style.background =
      `linear-gradient(to right, #f06292 0%, #f06292 ${pct}%, #2a2a2a ${pct}%, #2a2a2a 100%)`;
  }
}

/**
 * Resetea el peak hold del spike (botón de calibración).
 */
function resetSpikeHold() {
  peakSpike = 0;
}
