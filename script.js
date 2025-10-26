class TradeOrFadeGame {
    constructor() {
      // Game state
      this.score = 0;
      this.highScore = 0;
      this.newRecordAchieved = false;
  
      this.lives = 3;
      this.level = 1;
      this.timer = 3;
      this.gameActive = true;
      this.currentDirection = null;
      this.timerInterval = null;
      this.isWaitingForNextRound = false;
  
      // Difficulty
      this.difficulty = 'easy';
  
      // Chart state
      this.candles = [];
      this.ema20 = [];
      this.canvas = null;
      this.ctx = null;
  
      // Audio
      this.musicStarted = false;
      this.sfx = {
        correct: this.makeAudio('correct.mp3', 0.15),
        fail: this.makeAudio('fail.mp3', 0.15),
        lose: this.makeAudio('lose.mp3', 0.11),
        newrecord: this.makeAudio('newrecord.mp3', 0.17),
        music: this.makeAudio('music.mp3', 0.08, true)
      };
  
      // DOM
      this.initializeElements();
      this.loadHighScore();
      this.bindEvents();
  
      // Start
      this.updateStats();
      this.startNewRound();
    }
  
    // ---------- AUDIO ----------
    makeAudio(src, volume = 0.5, loop = false) {
      const a = new Audio(src);
      a.volume = volume;
      a.loop = loop;
      a.preload = 'auto';
      return a;
    }
    ensureMusic() {
      if (this.musicStarted || !this.sfx.music) return;
      this.sfx.music.play().then(() => {
        this.musicStarted = true;
      }).catch(() => {
        // Autoplay blocked; will retry on next user gesture
      });
    }
    playSfx(name) {
      const a = this.sfx[name];
      if (!a) return;
      try {
        // Use clone to allow overlapping plays
        const c = a.cloneNode(true);
        c.volume = a.volume;
        c.play().catch(() => {});
      } catch (e) {}
    }
  
    // ---------- INIT / DOM ----------
    initializeElements() {
      this.scoreElement = document.getElementById('score');
      this.levelElement = document.getElementById('level');
      this.timerElement = document.getElementById('timer');
      this.chartElement = document.getElementById('chart');
      this.resultElement = document.getElementById('result');
      this.gameOverElement = document.getElementById('gameOver');
      this.finalScoreElement = document.getElementById('finalScore');
      this.finalHighScoreElement = document.getElementById('finalHighScore');
      this.finalNewRecordElement = document.getElementById('finalNewRecord');
      this.difficultyElement = document.getElementById('difficulty');
      this.highScoreElement = document.getElementById('highScore');
      this.newRecordBadge = document.getElementById('newRecord');
  
      this.lifeElements = [
        document.getElementById('life1'),
        document.getElementById('life2'),
        document.getElementById('life3'),
      ];
  
      this.btnUp = document.getElementById('btnUp');
      this.btnDown = document.getElementById('btnDown');
  
      // Prepare canvas inside chart container
      if (!this.canvas) {
        this.canvas = document.createElement('canvas');
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.display = 'block';
        this.chartElement.innerHTML = '';
        this.chartElement.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
      }
    }
  
    bindEvents() {
      this.btnUp.addEventListener('click', () => { this.ensureMusic(); this.makeChoice('up'); });
      this.btnDown.addEventListener('click', () => { this.ensureMusic(); this.makeChoice('down'); });
      window.addEventListener('resize', () => this.redrawChart());
      // Start music on first gesture if blocked
      window.addEventListener('pointerdown', () => this.ensureMusic(), { once: true });
      window.addEventListener('keydown', () => this.ensureMusic(), { once: true });
      window.restartGame = () => { this.ensureMusic(); this.restartGame(); };
    }
  
    // ---------- HIGH SCORE ----------
    loadHighScore() {
      const saved = localStorage.getItem('tof_highScore');
      this.highScore = saved ? parseInt(saved, 10) : 0;
      this.updateHighScoreUI();
    }
  
    maybeUpdateHighScore() {
      if (this.score > this.highScore) {
        this.highScore = this.score;
        localStorage.setItem('tof_highScore', String(this.highScore));
        this.newRecordAchieved = true;
        this.updateHighScoreUI(true);
        this.playSfx('newrecord');
      }
    }
  
    updateHighScoreUI(showBadge = false) {
      if (this.highScoreElement) this.highScoreElement.textContent = this.highScore;
      if (this.newRecordBadge) {
        if (showBadge) {
          this.newRecordBadge.classList.add('show');
          setTimeout(() => this.newRecordBadge.classList.remove('show'), 2500);
        }
      }
    }
  
    // ---------- ROUND FLOW ----------
    startNewRound() {
      if (!this.gameActive) return;
      this.isWaitingForNextRound = false;
      this.clearResult();
  
      // Adapt difficulty by score
      const d = Math.floor(this.score / 50);
      this.timer = Math.max(1, 3 - d);
      if (this.difficultyElement) {
        const label = this.timer >= 3 ? 'Easy' : this.timer === 2 ? 'Medium' : 'Hard';
        this.difficultyElement.textContent = `Difficulty: ${label}`;
      }
  
      // Generate realistic candles and draw
      this.generateCandles(48);
      this.computeEMA(20);
      this.setDirectionFromCandles();
      this.redrawChart();
  
      this.startTimer();
      this.enableButtons();
    }
  
    // ---------- DATA GEN ----------
    // Realistic candle generation using GBM + micro-variance for wicks and volume
    generateCandles(count = 48) {
      const mu = 0.0005;          // drift per step
      const sigma = 0.02;         // volatility per step
      const start = 100 + Math.random() * 20;
  
      const candles = [];
      let prevClose = start;
  
      for (let i = 0; i < count; i++) {
        const open = prevClose;
  
        // GBM return
        const z = this.randn();
        const ret = Math.exp((mu - 0.5 * sigma * sigma) + sigma * z);
        let close = open * ret;
  
        // Limit extremes for nicer look
        const maxMove = 0.035;
        const clampFactor = Math.max(-maxMove, Math.min(maxMove, (close - open) / open));
        close = open * (1 + clampFactor);
  
        // High/Low with micro-variance
        const body = Math.abs(close - open);
        const wickAmp = body * (0.6 + Math.random() * 1.2) + open * (0.001 + Math.random() * 0.004);
  
        const high = Math.max(open, close) + wickAmp * (0.4 + Math.random() * 0.8);
        const low  = Math.min(open, close) - wickAmp * (0.4 + Math.random() * 0.8);
  
        // Volume correlated with body + random
        const volBase = 1_000 + Math.random() * 2_000;
        const vol = volBase * (0.7 + (body / open) * 180 + Math.random() * 0.6);
  
        candles.push({ open, high, low, close, vol });
        prevClose = close;
      }
  
      this.candles = candles;
    }
  
    // Exponential Moving Average
    computeEMA(period = 20) {
      const ema = [];
      const k = 2 / (period + 1);
      let prev = null;
  
      for (let i = 0; i < this.candles.length; i++) {
        const price = this.candles[i].close;
        if (i === 0) {
          prev = price;
        } else {
          prev = price * k + prev * (1 - k);
        }
        ema.push(prev);
      }
      this.ema20 = ema;
    }
  
    setDirectionFromCandles() {
      if (!this.candles.length) {
        this.currentDirection = Math.random() < 0.5 ? 'up' : 'down';
        return;
      }
      const first = this.candles[0].open;
      const last = this.candles[this.candles.length - 1].close;
      this.currentDirection = last >= first ? 'up' : 'down';
    }
  
    // ---------- RENDER ----------
    redrawChart() {
      if (!this.canvas || !this.ctx) return;
  
      // Fit canvas to container and DPR
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const rect = this.chartElement.getBoundingClientRect();
      const cssW = Math.max(300, rect.width);
      const cssH = Math.max(180, rect.height);
      this.canvas.width = Math.floor(cssW * dpr);
      this.canvas.height = Math.floor(cssH * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.clearRect(0, 0, cssW, cssH);
  
      // Layout
      const padding = { top: 10, right: 48, bottom: 28, left: 8 };
      const volHeight = Math.max(36, Math.min(80, cssH * 0.22));
      const priceArea = {
        x: padding.left,
        y: padding.top,
        w: cssW - padding.left - padding.right,
        h: cssH - padding.top - padding.bottom - volHeight,
      };
      const volArea = {
        x: padding.left,
        y: priceArea.y + priceArea.h + 10,
        w: priceArea.w,
        h: volHeight - 10,
      };
  
      // Data ranges
      if (!this.candles.length) return;
      let minP = Infinity, maxP = -Infinity, maxV = 0;
      for (const c of this.candles) {
        if (c.low < minP) minP = c.low;
        if (c.high > maxP) maxP = c.high;
        if (c.vol > maxV) maxV = c.vol;
      }
      const pad = (maxP - minP) * 0.08 || 1;
      minP -= pad; maxP += pad;
  
      const n = this.candles.length;
      const gap = 2;
      const bodyW = Math.max(3, Math.floor(priceArea.w / n) - gap);
      const stepX = bodyW + gap;
  
      const yPrice = (v) => {
        const t = (v - minP) / (maxP - minP);
        return priceArea.y + priceArea.h - t * priceArea.h;
      };
      const yVol = (v) => volArea.y + volArea.h - (v / maxV) * volArea.h;
  
      // Grid + scale
      this.drawGrid(priceArea, minP, maxP, 4);
      this.drawRightScale(priceArea, minP, maxP, 4);
  
      // Volume bars
      for (let i = 0; i < n; i++) {
        const c = this.candles[i];
        const x = priceArea.x + i * stepX + (stepX - bodyW) / 2;
        const y = yVol(0);
        const yh = yVol(c.vol);
        const isUp = c.close >= c.open;
        this.ctx.fillStyle = isUp ? 'rgba(0, 255, 136, 0.45)' : 'rgba(255, 71, 87, 0.45)';
        this.ctx.fillRect(x, yh, bodyW, y - yh);
      }
  
      // Wicks and bodies
      for (let i = 0; i < n; i++) {
        const c = this.candles[i];
        const x = priceArea.x + i * stepX + (stepX - bodyW) / 2;
        const openY = yPrice(c.open);
        const closeY = yPrice(c.close);
        const highY = yPrice(c.high);
        const lowY = yPrice(c.low);
        const isUp = c.close >= c.open;
  
        // Wick
        this.ctx.strokeStyle = isUp ? '#00e07a' : '#e84557';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(x + bodyW / 2, highY);
        this.ctx.lineTo(x + bodyW / 2, lowY);
        this.ctx.stroke();
  
        // Body
        const top = Math.min(openY, closeY);
        const h = Math.max(2, Math.abs(closeY - openY));
        const grad = this.ctx.createLinearGradient(0, top, 0, top + h);
        if (isUp) {
          grad.addColorStop(0, '#00ff88');
          grad.addColorStop(1, '#00cc6a');
        } else {
          grad.addColorStop(0, '#ff4757');
          grad.addColorStop(1, '#cc3a46');
        }
        this.ctx.fillStyle = grad;
        this.ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        this.ctx.lineWidth = 0.5;
        this.ctx.fillRect(x, top, bodyW, h);
        this.ctx.strokeRect(x, top, bodyW, h);
      }
  
      // EMA(20)
      if (this.ema20 && this.ema20.length) {
        this.ctx.strokeStyle = '#7db1ff';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = priceArea.x + i * stepX + (stepX - bodyW) / 2 + bodyW / 2;
          const y = yPrice(this.ema20[i]);
          if (i === 0) this.ctx.moveTo(x, y);
          else this.ctx.lineTo(x, y);
        }
        this.ctx.stroke();
      }
    }
  
    drawGrid(area, minP, maxP, lines = 4) {
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= lines; i++) {
        const y = area.y + (area.h / lines) * i;
        ctx.beginPath();
        ctx.moveTo(area.x, y);
        ctx.lineTo(area.x + area.w, y);
        ctx.stroke();
      }
      ctx.restore();
    }
  
    drawRightScale(area, minP, maxP, ticks = 4) {
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.font = '12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const step = (maxP - minP) / ticks;
      for (let i = 0; i <= ticks; i++) {
        const v = minP + step * i;
        const y = area.y + area.h - (area.h / ticks) * i;
        const label = v.toFixed(2);
        ctx.fillText(label, area.x + area.w + 6, y);
      }
      ctx.restore();
    }
  
    // ---------- UTILS ----------
    randn() {
      // Box-Muller
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }
  
    startTimer() {
      clearInterval(this.timerInterval);
      this.timerElement.textContent = this.timer;
      let left = this.timer;
      this.timerInterval = setInterval(() => {
        left -= 1;
        this.timerElement.textContent = left;
        if (left <= 0) {
          clearInterval(this.timerInterval);
          this.handleWrong();
        }
      }, 1000);
    }
  
    enableButtons() {
      this.btnUp.disabled = false;
      this.btnDown.disabled = false;
    }
    disableButtons() {
      this.btnUp.disabled = true;
      this.btnDown.disabled = true;
    }
  
    makeChoice(choice) {
      if (this.isWaitingForNextRound) return;
      clearInterval(this.timerInterval);
      const correct = (choice === this.currentDirection);
      if (correct) this.handleCorrect(); else this.handleWrong();
    }
  
    handleCorrect() {
      this.score += 10;
      if (this.score % 50 === 0) this.level += 1;
      this.showResult(true);
      this.updateStats();
      this.playSfx('correct');
      this.maybeUpdateHighScore();
      this.queueNextRound();
    }
  
    handleWrong() {
      this.lives -= 1;
      this.showResult(false);
      this.updateStats();
      this.playSfx('fail');
      if (this.lives <= 0) this.endGame();
      else this.queueNextRound();
    }
  
    queueNextRound() {
      this.isWaitingForNextRound = true;
      this.disableButtons();
      setTimeout(() => this.startNewRound(), 600);
    }
  
    updateStats() {
      if (this.scoreElement) this.scoreElement.textContent = this.score;
      if (this.levelElement) this.levelElement.textContent = this.level;
      if (this.highScoreElement) this.highScoreElement.textContent = this.highScore;
      // lives UI
      this.lifeElements.forEach((el, i) => {
        if (!el) return;
        el.classList.toggle('lost', i >= this.lives);
      });
    }
  
    showResult(isCorrect) {
      if (!this.resultElement) return;
      this.resultElement.className = 'result ' + (isCorrect ? 'correct' : 'wrong');
      this.resultElement.textContent = isCorrect ? 'Correct!' : 'Wrong';
    }
  
    clearResult() {
      if (!this.resultElement) return;
      this.resultElement.className = 'result';
      this.resultElement.textContent = '';
    }
  
    endGame() {
      this.gameActive = false;
      this.disableButtons();
      this.maybeUpdateHighScore();
      this.finalScoreElement.textContent = this.score;
      this.finalHighScoreElement.textContent = this.highScore;
      if (this.newRecordAchieved) {
        this.finalNewRecordElement.style.display = 'block';
      } else {
        this.finalNewRecordElement.style.display = 'none';
      }
      this.playSfx('lose');
      this.gameOverElement.classList.add('show');
    }
  
    restartGame() {
      this.ensureMusic();
      this.score = 0;
      this.lives = 3;
      this.level = 1;
      this.timer = 3;
      this.gameActive = true;
      this.newRecordAchieved = false;
      this.clearResult();
      this.updateStats();
      this.gameOverElement.classList.remove('show');
      this.startNewRound();
    }
  }
  
  // Init
  document.addEventListener('DOMContentLoaded', () => {
    const chart = document.getElementById('chart');
    if (chart) {
      chart.style.position = 'relative';
    }
    new TradeOrFadeGame();
  });
  
  // Global for restart button
  function restartGame(){ /* replaced at runtime by class */ }
  