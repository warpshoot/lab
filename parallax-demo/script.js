// DOM Elements
const video = document.getElementById('video');
const status = document.getElementById('status');
const debug = document.getElementById('debug');
const startBtn = document.getElementById('start-btn');
const layer = document.getElementById('layer-front');

// Configuration
const ROTATION_STRENGTH = 50;
const SMOOTHING = 0.12;
const MIRROR_MODE = true;

// State
let smoothedX = 0.5;
let smoothedY = 0.5;
let isRunning = false;

/**
 * Updates the 3D transform of the layer based on face position.
 * @param {number} normalizedX - 0 to 1
 * @param {number} normalizedY - 0 to 1
 */
function updateParallax(normalizedX, normalizedY) {
  const offsetX = (normalizedX - 0.5) * 2; // -1 to 1
  const offsetY = (normalizedY - 0.5) * 2; // -1 to 1

  // Calculate rotation (Inverted for "Window" effect: Moving Right shows Left side of object)
  // If we move Right (offsetX > 0), we want to see the Left side of the cube.
  // The Left side is at rotateY(-90deg). To bring it front, we need container rotateY(+90deg).
  // So offsetX > 0 should lead to positive rotateY.

  // Wait, if I move RIGHT, I am looking at the object from the RIGHT side.
  // So I should see the RIGHT face.
  // Right face is at rotateY(90deg). To bring it front, container needs rotateY(-90deg).
  // So offsetX > 0 (Right) -> rotateY should be Negative.
  const rotateY = -offsetX * ROTATION_STRENGTH;

  // If I move DOWN (offsetY > 0), I am looking from BELOW.
  // I should see the BOTTOM face.
  // Bottom face is rotateX(-90deg). To bring it front, container needs rotateX(+90deg).
  // So offsetY > 0 (Down) -> rotateX should be Positive.
  const rotateX = offsetY * ROTATION_STRENGTH;

  // Apply 3D transform
  layer.style.transform = `translate(-50%, -50%) rotateY(${rotateY}deg) rotateX(${rotateX}deg)`;

  debug.textContent = `X: ${offsetX.toFixed(2)} / Y: ${offsetY.toFixed(2)} / RotY: ${rotateY.toFixed(1)}°`;
}

/**
 * Main application entry point
 */
async function start() {
  if (isRunning) return;

  startBtn.classList.add('hidden');
  status.textContent = 'SYSTEM :: INITIALIZING CAMERA...';
  status.className = ''; // Reset classes

  try {
    // 1. Setup Camera
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 },
      audio: false
    });
    video.srcObject = stream;
    await video.play();

    status.textContent = 'SYSTEM :: LOADING NEURAL NET...';

    // 2. Setup FaceDetection
    // Using simple CDN import (relies on global FaceDetection loaded via script tag)
    const faceDetection = new FaceDetection({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`;
      }
    });

    faceDetection.setOptions({
      model: 'short',
      minDetectionConfidence: 0.5
    });

    faceDetection.onResults((results) => {
      if (results.detections.length > 0) {
        const detection = results.detections[0];
        const box = detection.boundingBox;

        // boundingBox: xCenter, yCenter, width, height (0-1 normalized)
        const centerX = box.xCenter;
        const centerY = box.yCenter;

        // Smooth the raw input
        smoothedX += (centerX - smoothedX) * SMOOTHING;
        smoothedY += (centerY - smoothedY) * SMOOTHING;

        // Mirror X if needed (Selfie camera usually needs mirroring for natural feeling)
        const targetX = MIRROR_MODE ? (1 - smoothedX) : smoothedX;

        updateParallax(targetX, smoothedY);
      }
    });

    // 3. Start Camera Loop
    const camera = new Camera(video, {
      onFrame: async () => {
        await faceDetection.send({ image: video });
      },
      width: 640,
      height: 480
    });

    await camera.start();

    isRunning = true;
    status.textContent = 'SYSTEM :: TRACKING ACTIVE';
    status.classList.add('ready');

  } catch (err) {
    status.textContent = 'ERROR :: ' + err.message;
    status.classList.add('error');
    console.error(err);
    startBtn.classList.remove('hidden');
    isRunning = false;
  }
}

// Event Listeners
startBtn.addEventListener('click', start);
