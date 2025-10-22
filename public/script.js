console.log('script.js loaded');

// DOM Elements
const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const cameraBtn = document.getElementById('cameraBtn');
const retryBtn = document.getElementById('retryBtn');
const permissionMessage = document.getElementById('permissionMessage');
const questionBar = document.getElementById('questionBar');
const scoreValueEl = document.getElementById('scoreValue');
const timerBar = document.getElementById('timerBar');
const startQuizBtn = document.getElementById('startQuizBtn');
const lockAnswerBtn = document.getElementById('lockAnswerBtn'); // May be null if commented out
const leaderboardBtn = document.getElementById('leaderboardBtn');
const usernameModal = document.getElementById('usernameModal');
const usernameInput = document.getElementById('usernameInput');
const submitUsername = document.getElementById('submitUsername');
const leaderboardModal = document.getElementById('leaderboardModal');
const closeLeaderboard = document.getElementById('closeLeaderboard');
const leaderboardList = document.getElementById('leaderboardList');
const finalScoreModal = document.getElementById('finalScoreModal');
const finalScoreDisplay = document.getElementById('finalScoreDisplay');
const restartQuizBtn = document.getElementById('restartQuizBtn');
const viewLeaderboardBtn = document.getElementById('viewLeaderboardBtn');
const resetLeaderboardBtn = document.getElementById('resetLeaderboardBtn');
const switchCameraBtn = document.getElementById('switchCameraBtn');

// Game State Variables
let appWidth, appHeight;
let score = 0;
let boxes = [];
let questionIndex = 0;
let quizActive = false;
let mpCamera = null;
let lastPointer = null;
let showReadingCountdown = false;
let readingCountdownValue = 0;
let currentUsername = '';
let feedbackAnimationActive = false;
let feedbackAnimationId = null;
let currentFacingMode = 'user'; // 'user' for front camera, 'environment' for back camera

// Timer Variables
let readingTimer = null;
let answerTimer = null;
let readingTime = 3; // 3 seconds to read question
let answerTime = 15; // 5 seconds to answer
let currentAnswerTime = 5;

// Question Data
let ALL_QUESTIONS = []; // Will be loaded from JSON
let QUESTIONS = []; // Selected 10 questions for current quiz

// Utility function to shuffle array
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Load questions from JSON file
async function loadQuestions() {
  try {
    const response = await fetch('questions.json');
    if (!response.ok) {
      throw new Error('Failed to load questions');
    }
    ALL_QUESTIONS = await response.json();
    
    if (ALL_QUESTIONS.length < 10) {
      throw new Error('Minimum 10 questions required in questions.json');
    }
    
    console.log(`Loaded ${ALL_QUESTIONS.length} questions from JSON`);
    selectRandomQuestions();
  } catch (error) {
    console.error('Error loading questions:', error);
    alert('Failed to load questions. Please check questions.json file.');
  }
}

// Select 10 random questions and shuffle options
function selectRandomQuestions() {
  // Shuffle all questions and pick 10
  const shuffledQuestions = shuffleArray(ALL_QUESTIONS);
  const selectedQuestions = shuffledQuestions.slice(0, 10);
  
  // Transform to the format used by the game
  QUESTIONS = selectedQuestions.map(q => {
    // Combine correct and wrong answers
    const allAnswers = [q.correctAnswer, ...q.wrongAnswers];
    // Shuffle the answers
    const shuffledAnswers = shuffleArray(allAnswers);
    // Find the new position of the correct answer
    const correctIndex = shuffledAnswers.indexOf(q.correctAnswer);
    
    return {
      q: q.question,
      answers: shuffledAnswers,
      correct: correctIndex
    };
  });
  
  console.log('Selected and shuffled 10 questions for quiz');
}

// Leaderboard Storage
function getLeaderboard() {
  const data = localStorage.getItem('quizLeaderboard');
  return data ? JSON.parse(data) : [];
}

function saveToLeaderboard(username, score) {
  const leaderboard = getLeaderboard();
  leaderboard.push({
    name: username,
    score: score,
    date: new Date().toISOString()
  });
  // Sort by score descending
  leaderboard.sort((a, b) => b.score - a.score);
  // Keep only top 50
  const topLeaderboard = leaderboard.slice(0, 50);
  localStorage.setItem('quizLeaderboard', JSON.stringify(topLeaderboard));
}

function resetLeaderboard() {
  if (confirm('Are you sure you want to reset the leaderboard? This action cannot be undone.')) {
    localStorage.removeItem('quizLeaderboard');
    displayLeaderboard();
    // Close the leaderboard modal after reset
    leaderboardModal.classList.add('hidden');
    
    // If no quiz is active and no camera is running, show camera button
    if (!quizActive && (!video.srcObject || !mpCamera)) {
      cameraBtn.classList.remove('hidden');
      cameraBtn.classList.remove('loading');
      cameraBtn.disabled = false;
      cameraBtn.innerText = 'Open Camera';
      startQuizBtn.classList.add('hidden');
    }
  }
}

function displayLeaderboard() {
  const leaderboard = getLeaderboard();
  
  if (leaderboard.length === 0) {
    leaderboardList.innerHTML = '<div class="leaderboard-empty">No scores yet. Be the first!</div>';
    return;
  }
  
  leaderboardList.innerHTML = leaderboard.map((entry, index) => {
    const rank = index + 1;
    let rankClass = '';
    let rankDisplay = rank;
    
    if (rank === 1) {
      rankClass = 'gold';
      rankDisplay = '🥇';
    } else if (rank === 2) {
      rankClass = 'silver';
      rankDisplay = '🥈';
    } else if (rank === 3) {
      rankClass = 'bronze';
      rankDisplay = '🥉';
    }
    
    const itemClass = rank <= 3 ? 'leaderboard-item top-3' : 'leaderboard-item';
    
    return `
      <div class="${itemClass}">
        <div class="leaderboard-rank ${rankClass}">${rankDisplay}</div>
        <div class="leaderboard-name">${entry.name}</div>
        <div class="leaderboard-score">${entry.score}/${QUESTIONS.length}</div>
      </div>
    `;
  }).join('');
}

// Setup canvas size
function resizeCanvasToDisplaySize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  appWidth = rect.width;
  appHeight = rect.height;
}

// Compute 3x3 grid boxes
function computeBoxes() {
  boxes = [];
  const padding = 12;
  const cols = 3;
  const rows = 3;
  
  // Adjust top margin based on screen size - reduced gap
  const isMobile = window.innerWidth <= 768;
  const topMargin = isMobile ? 80 : 120;
  
  const boxW = (appWidth - padding * (cols + 1)) / cols;
  const boxH = (appHeight - topMargin - padding * (rows + 1)) / rows;
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = padding + c * (boxW + padding);
      const y = topMargin + padding + r * (boxH + padding);
      boxes.push({ x, y, w: boxW, h: boxH, label: "", isCorrect: false });
    }
  }
}

// Draw overlay
function drawOverlay(pointer) {
  // Don't draw if feedback animation is active
  if (feedbackAnimationActive) {
    return;
  }
  
  resizeCanvasToDisplaySize();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Semi-transparent overlay
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 0, appWidth, appHeight);

  // Show big countdown during reading time
  if (showReadingCountdown) {
    ctx.save();
    ctx.font = 'bold 120px Inter, Arial, sans-serif';
    ctx.fillStyle = '#00d2ff';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 8;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = readingCountdownValue > 0 ? readingCountdownValue.toString() : 'GO!';
    ctx.strokeText(text, appWidth / 2, appHeight / 2);
    ctx.fillText(text, appWidth / 2, appHeight / 2);
    ctx.restore();
    return;
  }

  // Draw boxes if quiz is active
  if (quizActive && boxes.length > 0) {
    // Fun colors for kids - each box gets a different color
    const boxColors = [
      'rgba(255, 107, 107, 0.15)', // Red
      'rgba(255, 195, 113, 0.15)', // Orange
      'rgba(255, 234, 167, 0.15)', // Yellow
      'rgba(106, 176, 76, 0.15)',  // Green
      'rgba(34, 166, 179, 0.15)',  // Teal
      'rgba(72, 219, 251, 0.15)',  // Cyan
      'rgba(162, 155, 254, 0.15)', // Purple
      'rgba(255, 159, 243, 0.15)', // Pink
      'rgba(255, 127, 80, 0.15)'   // Coral
    ];
    
    const borderColors = [
      'rgba(255, 107, 107, 0.4)',
      'rgba(255, 195, 113, 0.4)',
      'rgba(255, 234, 167, 0.4)',
      'rgba(106, 176, 76, 0.4)',
      'rgba(34, 166, 179, 0.4)',
      'rgba(72, 219, 251, 0.4)',
      'rgba(162, 155, 254, 0.4)',
      'rgba(255, 159, 243, 0.4)',
      'rgba(255, 127, 80, 0.4)'
    ];
    
    boxes.forEach((b, index) => {
      // Box background with fun colors
      ctx.fillStyle = boxColors[index] || 'rgba(255,255,255,0.06)';
      roundRect(ctx, b.x, b.y, b.w, b.h, 10, true, false);
      
      // Box border
      ctx.strokeStyle = borderColors[index] || 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 2;
      roundRect(ctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, 10, false, true);
      
      // Check if pointer is hovering over this box
      let isHovered = false;
      if (pointer) {
        if (pointer.x >= b.x && pointer.x <= b.x + b.w && 
            pointer.y >= b.y && pointer.y <= b.y + b.h) {
          isHovered = true;
          // Highlight hovered box with bright cyan
          ctx.fillStyle = 'rgba(0,210,255,0.35)';
          roundRect(ctx, b.x, b.y, b.w, b.h, 10, true, false);
          ctx.strokeStyle = 'rgba(0,210,255,1)';
          ctx.lineWidth = 4;
          roundRect(ctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, 10, false, true);
        }
      }
      
      // Label - bigger and more colorful for kids
      ctx.fillStyle = isHovered ? '#ffff00' : 'white';
      
      // Adjust font size based on screen width and text length
      const isMobile = window.innerWidth <= 768;
      const label = b.label || '';
      const maxWidth = b.w - 20; // Padding
      
      // Start with initial font size
      let fontSize = isMobile ? 18 : 28;
      ctx.font = `bold ${fontSize}px Inter, system-ui, Arial`;
      
      // Reduce font size until text fits
      while (ctx.measureText(label).width > maxWidth && fontSize > 10) {
        fontSize -= 1;
        ctx.font = `bold ${fontSize}px Inter, system-ui, Arial`;
      }
      
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Add shadow for better visibility
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      
      // Check if still too long - try word wrap
      if (ctx.measureText(label).width > maxWidth) {
        const words = label.split(' ');
        if (words.length > 1) {
          // Try to split into two lines
          let line1 = '';
          let line2 = '';
          let midPoint = Math.ceil(words.length / 2);
          
          line1 = words.slice(0, midPoint).join(' ');
          line2 = words.slice(midPoint).join(' ');
          
          // Check if lines fit
          const line1Width = ctx.measureText(line1).width;
          const line2Width = ctx.measureText(line2).width;
          
          if (line1Width <= maxWidth && line2Width <= maxWidth) {
            // Both lines fit, draw them
            ctx.fillText(line1, b.x + b.w / 2, b.y + b.h / 2 - fontSize * 0.6);
            ctx.fillText(line2, b.x + b.w / 2, b.y + b.h / 2 + fontSize * 0.6);
          } else {
            // Still too long, truncate with ellipsis
            let truncated = label;
            while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
              truncated = truncated.slice(0, -1);
            }
            ctx.fillText(truncated + '...', b.x + b.w / 2, b.y + b.h / 2);
          }
        } else {
          // Single long word - truncate with ellipsis
          let truncated = label;
          while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
            truncated = truncated.slice(0, -1);
          }
          ctx.fillText(truncated + (truncated !== label ? '...' : ''), b.x + b.w / 2, b.y + b.h / 2);
        }
      } else {
        // Text fits, draw normally
        ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2);
      }
      
      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    });
  }

  // Draw pointer (finger tip)
  if (pointer && quizActive && !showReadingCountdown) {
    const { x, y, conf } = pointer;
    const s = Math.max(8, 18 * conf);
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,210,255,0.95)';
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.stroke();
  }
}

// Helper: rounded rectangle
function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  if (typeof radius === 'undefined') radius = 5;
  if (typeof radius === 'number') radius = { tl: radius, tr: radius, br: radius, bl: radius };
  ctx.beginPath();
  ctx.moveTo(x + radius.tl, y);
  ctx.lineTo(x + width - radius.tr, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
  ctx.lineTo(x + width, y + height - radius.br);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
  ctx.lineTo(x + radius.bl, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
  ctx.lineTo(x, y + radius.tl);
  ctx.quadraticCurveTo(x, y, x + radius.tl, y);
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// Start Camera
async function startCamera() {
  console.log('Starting camera...');
  permissionMessage.classList.add('hidden');
  cameraBtn.disabled = true;
  cameraBtn.innerText = 'Starting...';
  cameraBtn.classList.add('loading');
  
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera API not supported. Please use HTTPS or localhost.');
    }
    
    // Check if MediaPipe Camera is available
    if (typeof window.Camera === 'undefined') {
      throw new Error('MediaPipe Camera not loaded. Please refresh the page.');
    }
    
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        width: { ideal: 1280 },
        height: { ideal: 960 },
        facingMode: currentFacingMode
      }, 
      audio: false 
    });
    
    video.srcObject = stream;
    
    // Wait for video to be ready
    await new Promise((resolve) => {
      video.onloadedmetadata = () => resolve();
    });
    
    await video.play();
    console.log('Video playing');
    
    resizeCanvasToDisplaySize();
    computeBoxes();
    
    // Initialize MediaPipe Camera using window.Camera
    mpCamera = new window.Camera(video, {
      onFrame: async () => {
        await hands.send({ image: video });
      },
      width: 1280,
      height: 960
    });
    
    console.log('Starting MediaPipe camera...');
    await mpCamera.start();
    
    // Hide camera button, show Start Quiz and Switch Camera buttons
    cameraBtn.classList.remove('loading');
    cameraBtn.classList.add('hidden');
    startQuizBtn.classList.remove('hidden');
    startQuizBtn.classList.add('pulse');
    switchCameraBtn.classList.remove('hidden');
    
    console.log('Camera started successfully');
  } catch (err) {
    console.error('Camera error:', err);
    cameraBtn.classList.remove('loading');
    
    let errorMsg = 'Camera access failed. ';
    if (err.name === 'NotAllowedError') {
      errorMsg += 'Please allow camera permissions.';
    } else if (err.name === 'NotFoundError') {
      errorMsg += 'No camera found on your device.';
    } else if (err.message.includes('HTTPS')) {
      errorMsg += 'Please use HTTPS or localhost.';
    } else if (err.message.includes('MediaPipe')) {
      errorMsg += 'Please refresh the page and try again.';
    } else {
      errorMsg += err.message;
    }
    
    permissionMessage.innerHTML = errorMsg + '<br><button id="retryBtn" class="btn-small">Retry</button>';
    permissionMessage.classList.remove('hidden');
    
    const newRetryBtn = document.getElementById('retryBtn');
    if (newRetryBtn) {
      newRetryBtn.addEventListener('click', startCamera);
    }
    
    cameraBtn.disabled = false;
    cameraBtn.innerText = 'Open Camera';
    cameraBtn.classList.remove('hidden');
  }
}

// Start Quiz
function startQuiz() {
  // Show username modal
  usernameModal.classList.remove('hidden');
  usernameInput.value = '';
  usernameInput.focus();
}

// Switch Camera (front/back)
async function switchCamera() {
  try {
    // Toggle facing mode
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    
    // Stop current camera
    if (mpCamera && mpCamera.stop) {
      mpCamera.stop();
    }
    if (video && video.srcObject) {
      video.srcObject.getTracks().forEach(track => track.stop());
    }
    
    // Restart camera with new facing mode
    await startCamera();
  } catch (error) {
    console.error('Error switching camera:', error);
    alert('Failed to switch camera. Your device may not have multiple cameras.');
    // Revert to previous facing mode
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
  }
}

// Actually start the quiz after username is entered
function beginQuiz() {
  // Select new random 10 questions for this user
  selectRandomQuestions();
  
  startQuizBtn.classList.add('hidden');
  switchCameraBtn.classList.add('hidden'); // Hide switch camera button during quiz
  questionIndex = 0;
  score = 0;
  scoreValueEl.innerText = score;
  quizActive = true;
  showQuestion();
}

// Show Question with reading time countdown
function showQuestion() {
  if (questionIndex >= QUESTIONS.length) {
    endQuiz();
    return;
  }
  
  // Cancel any previous feedback animation and reset state
  if (feedbackAnimationId) {
    cancelAnimationFrame(feedbackAnimationId);
    feedbackAnimationId = null;
  }
  feedbackAnimationActive = false;
  
  // Clear canvas completely
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const question = QUESTIONS[questionIndex];
  
  // Show question with slide-up animation
  questionBar.innerText = question.q;
  questionBar.classList.remove('hidden');
  questionBar.classList.add('slide-up');
  
  // Hide boxes, lock button and timer during reading time
  boxes.forEach(b => {
    b.label = "";
    b.isCorrect = false;
  });
  if (lockAnswerBtn) {
    lockAnswerBtn.classList.add('hidden');
  }
  timerBar.classList.add('hidden');
  document.getElementById('timerContainer').classList.add('hidden');
  
  // Start big countdown animation
  showReadingCountdown = true;
  readingCountdownValue = readingTime;
  
  const countdownInterval = setInterval(() => {
    readingCountdownValue--;
    
    if (readingCountdownValue < 0) {
      clearInterval(countdownInterval);
      showReadingCountdown = false;
      showAnswerOptions(question);
    }
  }, 1000);
}

// Show answer options after reading time
function showAnswerOptions(question) {
  // Ensure feedback animation is stopped
  feedbackAnimationActive = false;
  if (feedbackAnimationId) {
    cancelAnimationFrame(feedbackAnimationId);
    feedbackAnimationId = null;
  }
  
  // Fill boxes with answers
  for (let i = 0; i < 9; i++) {
    boxes[i].label = question.answers[i] || "";
    boxes[i].isCorrect = (i === question.correct);
  }
  
  // Remove slide-up animation
  questionBar.classList.remove('slide-up');
  
  // Show lock answer button if it exists
  if (lockAnswerBtn) {
    lockAnswerBtn.classList.remove('hidden');
  }
  
  // Show timer container and start answer timer
  document.getElementById('timerContainer').classList.remove('hidden');
  currentAnswerTime = answerTime;
  timerBar.innerText = `${currentAnswerTime}s`;
  timerBar.classList.remove('hidden');
  
  // Force immediate redraw of the canvas with new options
  drawOverlay(lastPointer);
  
  answerTimer = setInterval(() => {
    currentAnswerTime--;
    timerBar.innerText = `${currentAnswerTime}s`;
    
    if (currentAnswerTime <= 0) {
      clearInterval(answerTimer);
      lockAnswer();
    }
  }, 1000);
}

// Lock Answer (either manually or when time runs out)
function lockAnswer() {
  if (!quizActive) return;
  
  // Clear timers
  if (readingTimer) clearTimeout(readingTimer);
  if (answerTimer) clearInterval(answerTimer);
  
  // Find which box the hand is on
  let selectedBox = null;
  let selectedIndex = -1;
  
  if (lastPointer) {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (lastPointer.x >= b.x && lastPointer.x <= b.x + b.w && 
          lastPointer.y >= b.y && lastPointer.y <= b.y + b.h) {
        selectedBox = b;
        selectedIndex = i;
        break;
      }
    }
  }
  
  // Check if answer is correct
  if (selectedBox && selectedBox.isCorrect) {
    score++;
    scoreValueEl.innerText = score;
    showFeedback(true, selectedIndex);
  } else {
    showFeedback(false, selectedIndex);
  }
  
  // Move to next question after 2 seconds
  setTimeout(() => {
    questionIndex++;
    showQuestion();
  }, 2000);
}

// Show feedback
function showFeedback(isCorrect, selectedIndex) {
  if (lockAnswerBtn) {
    lockAnswerBtn.classList.add('hidden');
  }
  timerBar.classList.add('hidden');
  document.getElementById('timerContainer').classList.add('hidden');
  
  // Find the correct answer box
  let correctIndex = -1;
  for (let i = 0; i < boxes.length; i++) {
    if (boxes[i].isCorrect) {
      correctIndex = i;
      break;
    }
  }
  
  // Cancel any previous feedback animation
  if (feedbackAnimationId) {
    cancelAnimationFrame(feedbackAnimationId);
    feedbackAnimationId = null;
  }
  
  // Always show the correct answer in green
  if (correctIndex !== -1) {
    const correctBox = boxes[correctIndex];
    
    // Set feedback animation active to prevent normal drawing
    feedbackAnimationActive = true;
    
    // Animate the correct answer box
    let animationStart = performance.now();
    let animationDuration = 2000; // 2 seconds
    
    function animateCorrectBox(timestamp) {
      let elapsed = timestamp - animationStart;
      
      if (elapsed < animationDuration) {
        // Redraw everything
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(0, 0, appWidth, appHeight);
        
        // Draw all boxes
        boxes.forEach((b, idx) => {
          const boxColors = [
            'rgba(255, 107, 107, 0.15)', 'rgba(255, 195, 113, 0.15)', 'rgba(255, 234, 167, 0.15)',
            'rgba(106, 176, 76, 0.15)', 'rgba(34, 166, 179, 0.15)', 'rgba(72, 219, 251, 0.15)',
            'rgba(162, 155, 254, 0.15)', 'rgba(255, 159, 243, 0.15)', 'rgba(255, 127, 80, 0.15)'
          ];
          
          ctx.fillStyle = boxColors[idx] || 'rgba(255,255,255,0.06)';
          roundRect(ctx, b.x, b.y, b.w, b.h, 10, true, false);
          
          ctx.fillStyle = 'white';
          
          // Dynamic font sizing for feedback animation
          const isMobile = window.innerWidth <= 768;
          const label = b.label || '';
          const maxWidth = b.w - 20;
          let fontSize = isMobile ? 18 : 28;
          ctx.font = `bold ${fontSize}px Inter, system-ui, Arial`;
          
          // Reduce font size until text fits
          while (ctx.measureText(label).width > maxWidth && fontSize > 10) {
            fontSize -= 1;
            ctx.font = `bold ${fontSize}px Inter, system-ui, Arial`;
          }
          
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;
          ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2);
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        });
        
        // Highlight correct answer in green with pulsing effect
        let pulseAlpha = 0.7 + Math.sin(elapsed / 150) * 0.2; // Pulse effect
        ctx.fillStyle = `rgba(46, 224, 110, ${pulseAlpha})`;
        roundRect(ctx, correctBox.x, correctBox.y, correctBox.w, correctBox.h, 10, true, false);
        
        ctx.strokeStyle = 'rgba(46, 224, 110, 1)';
        ctx.lineWidth = 5;
        roundRect(ctx, correctBox.x + 2, correctBox.y + 2, correctBox.w - 4, correctBox.h - 4, 10, false, true);
        
        // Draw correct answer label in white with green glow
        ctx.fillStyle = 'white';
        
        // Dynamic font sizing for correct answer with glow
        const correctLabel = correctBox.label || '';
        const correctMaxWidth = correctBox.w - 20;
        let correctFontSize = isMobile ? 22 : 32;
        ctx.font = `bold ${correctFontSize}px Inter, system-ui, Arial`;
        
        // Reduce font size until text fits
        while (ctx.measureText(correctLabel).width > correctMaxWidth && correctFontSize > 10) {
          correctFontSize -= 1;
          ctx.font = `bold ${correctFontSize}px Inter, system-ui, Arial`;
        }
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(46, 224, 110, 1)';
        ctx.shadowBlur = 15;
        ctx.fillText(correctLabel, correctBox.x + correctBox.w / 2, correctBox.y + correctBox.h / 2);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        
        feedbackAnimationId = requestAnimationFrame(animateCorrectBox);
      } else {
        // Animation complete
        feedbackAnimationActive = false;
        feedbackAnimationId = null;
      }
    }
    
    feedbackAnimationId = requestAnimationFrame(animateCorrectBox);
  }
  
  // Show feedback message
  questionBar.innerText = isCorrect ? '✓ Correct!' : '✗ Wrong Answer - See the correct one!';
  questionBar.style.color = isCorrect ? '#2ee06e' : '#ff5c7a';
  
  setTimeout(() => {
    questionBar.style.color = '';
  }, 2000);
}

// End Quiz
function endQuiz() {
  quizActive = false;
  
  // Stop camera and MediaPipe
  if (mpCamera && mpCamera.stop) {
    mpCamera.stop();
  }
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
  
  // Save score to leaderboard
  if (currentUsername) {
    saveToLeaderboard(currentUsername, score);
  }
  
  // Show final score modal
  finalScoreDisplay.innerHTML = `
    <div style="font-size: 20px; opacity: 0.8; margin-bottom: 10px;">Great job, ${currentUsername}!</div>
    ${score} / ${QUESTIONS.length}
  `;
  finalScoreModal.classList.remove('hidden');
  
  // Hide other UI elements
  questionBar.classList.add('hidden');
  timerBar.classList.add('hidden');
  document.getElementById('timerContainer').classList.add('hidden');
  if (lockAnswerBtn) {
    lockAnswerBtn.classList.add('hidden');
  }
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Restart Quiz
function restartQuiz() {
  // Close modals
  finalScoreModal.classList.add('hidden');
  leaderboardModal.classList.add('hidden');
  
  // Reset camera and start over
  if (mpCamera && mpCamera.stop) mpCamera.stop();
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Reset state
  score = 0;
  scoreValueEl.innerText = score;
  questionIndex = 0;
  quizActive = false;
  currentUsername = '';
  mpCamera = null;
  
  // Reset camera button to initial state
  cameraBtn.classList.remove('hidden');
  cameraBtn.classList.remove('loading');
  cameraBtn.disabled = false;
  cameraBtn.innerText = 'Open Camera';
  startQuizBtn.classList.add('hidden');
  questionBar.classList.add('hidden');
}

// MediaPipe Hands Setup
let hands;

// Initialize MediaPipe after page loads
window.addEventListener('load', () => {
  console.log('Page loaded. Checking MediaPipe...');
  console.log('window.Hands:', typeof window.Hands);
  console.log('window.Camera:', typeof window.Camera);
  
  // Load questions from JSON
  loadQuestions();
  
  if (typeof window.Hands !== 'undefined') {
    hands = new window.Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    });

    // Handle hand tracking results
    hands.onResults((results) => {
      resizeCanvasToDisplaySize();
      
      let pointer = null;
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        const indexTip = landmarks[8]; // Index finger tip
        
        const x = indexTip.x * appWidth;
        const y = indexTip.y * appHeight;
        const conf = indexTip.visibility || 0.8;
        
        pointer = { x, y, conf };
      }
      
      lastPointer = pointer;
      drawOverlay(pointer);
    });
    
    console.log('MediaPipe Hands initialized successfully');
  } else {
    console.error('MediaPipe Hands not loaded');
    permissionMessage.innerHTML = 'Failed to load MediaPipe. Please refresh the page.<br><button id="retryBtn" class="btn-small" onclick="location.reload()">Refresh Page</button>';
    permissionMessage.classList.remove('hidden');
    cameraBtn.disabled = true;
  }
  
  resizeCanvasToDisplaySize();
  computeBoxes();
});

// Event Listeners
cameraBtn.addEventListener('click', startCamera);
startQuizBtn.addEventListener('click', startQuiz);
switchCameraBtn.addEventListener('click', switchCamera);

if (lockAnswerBtn) {
  lockAnswerBtn.addEventListener('click', lockAnswer);
}

// Username submission
submitUsername.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  if (name.length > 0) {
    currentUsername = name;
    usernameModal.classList.add('hidden');
    beginQuiz();
  } else {
    usernameInput.style.borderColor = '#ff5c7a';
    setTimeout(() => {
      usernameInput.style.borderColor = 'rgba(255, 255, 255, 0.3)';
    }, 500);
  }
});

// Allow Enter key to submit username
usernameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    submitUsername.click();
  }
});

// Leaderboard buttons
leaderboardBtn.addEventListener('click', () => {
  displayLeaderboard();
  leaderboardModal.classList.remove('hidden');
});

closeLeaderboard.addEventListener('click', () => {
  leaderboardModal.classList.add('hidden');
  
  // If coming from final score modal and quiz is not active, show camera button
  if (!quizActive && finalScoreModal.classList.contains('hidden')) {
    cameraBtn.classList.remove('hidden');
    cameraBtn.classList.remove('loading');
    cameraBtn.disabled = false;
    cameraBtn.innerText = 'Open Camera';
    startQuizBtn.classList.add('hidden');
  }
});

viewLeaderboardBtn.addEventListener('click', () => {
  finalScoreModal.classList.add('hidden');
  displayLeaderboard();
  leaderboardModal.classList.remove('hidden');
});

resetLeaderboardBtn.addEventListener('click', resetLeaderboard);

restartQuizBtn.addEventListener('click', restartQuiz);

// Window resize handler
window.addEventListener('resize', () => {
  resizeCanvasToDisplaySize();
  computeBoxes();
});

// Collapsible instructions for mobile/tablet
const instructionsHeader = document.querySelector('#instructions h3');
const instructionsList = document.getElementById('instructionsList');

instructionsHeader.addEventListener('click', () => {
  instructionsHeader.classList.toggle('collapsed');
  instructionsList.classList.toggle('collapsed');
});

// Initialize collapsed state on mobile/tablet
function checkMobileView() {
  if (window.innerWidth <= 1024) {
    instructionsList.classList.add('collapsed');
    instructionsHeader.classList.add('collapsed');
  } else {
    instructionsList.classList.remove('collapsed');
    instructionsHeader.classList.remove('collapsed');
  }
}

checkMobileView();
window.addEventListener('resize', checkMobileView);