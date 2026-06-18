(() => {
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const screens = { title: $('#screen-title'), game: $('#screen-game'), result: $('#screen-result') };
    const els = {
        btnStart: $('#btn-start'),
        editionBtns: $$('.edition-btn'),
        gameEdition: $('#game-edition'),
        gameLevel: $('#game-level'),
        gameScore: $('#game-score'),
        timerCircle: $('#timer-circle'),
        timerText: $('#timer-text'),
        spellingSlots: $('#spelling-slots'),
        spellingHint: $('#spelling-hint'),
        indoWord: $('#indo-word'),
        indoCard: $('#indo-card'),
        cardInner: $('#card-inner'),
        playArea: $('#play-area'),
        btnHint: $('#btn-hint'),
        btnSkip: $('#btn-skip'),
        btnQuit: $('#btn-quit'),
        resultStamp: $('#result-stamp'),
        resultHeadline: $('#result-headline'),
        resultSubhead: $('#result-subhead'),
        resultScore: $('#result-score'),
        resultSolved: $('#result-solved'),
        resultAccuracy: $('#result-accuracy'),
        resultStreak: $('#result-streak'),
        resultWords: $('#result-words'),
        btnReplay: $('#btn-replay'),
        btnHome: $('#btn-home'),
    };

    let difficulty = 'easy';
    let words = [];
    let currentIndex = 0;
    let currentWord = null;
    let spelledSoFar = '';
    let score = 0;
    let totalAttempts = 0;
    let correctAttempts = 0;
    let streak = 0;
    let bestStreak = 0;
    let hintsUsed = 0;
    let timer = null;
    let timeLeft = 0;
    let maxTime = 30;
    let results = [];
    const WORDS_PER_ROUND = 10;
    const TIMER_CIRCUMFERENCE = 2 * Math.PI * 16;

    const editionNames = { easy: 'Morning Edition', medium: 'Afternoon Edition', hard: 'Evening Edition' };
    const timeLimits = { easy: 30, medium: 25, hard: 20 };

    // Page ordering: which screens sit on top of which.
    // "forward" = title -> game -> result (flipping pages off the top).
    // "backward" = result -> title, game -> title (putting pages back on top).
    const pageOrder = ['result', 'game', 'title'];

    // ===== NAVIGATION — STACKED NEWSPAPER PAGES =====
    let isTransitioning = false;
    let currentScreen = 'title';

    function initStack() {
        // All screens visible, layered by data-layer.
        // Title is on top (layer 2), game underneath (layer 1), result at bottom (layer 0).
        Object.values(screens).forEach(s => s.classList.add('visible'));
        screens.title.classList.add('active');
    }

    function showScreen(name, onReady) {
        if (isTransitioning || name === currentScreen) return;

        isTransitioning = true;

        const fromIdx = pageOrder.indexOf(currentScreen);
        const toIdx = pageOrder.indexOf(name);
        const goingForward = fromIdx > toIdx;

        if (goingForward) {
            flipForward(currentScreen, name, onReady);
        } else {
            flipBackward(name, currentScreen, onReady);
        }
    }

    function flipForward(fromName, toName, onReady) {
        const from = screens[fromName];
        const to = screens[toName];

        to.classList.add('active');
        from.classList.add('flip-out');

        function onDone(e) {
            if (e.animationName !== 'pageFlipOut') return;
            from.removeEventListener('animationend', onDone);
            from.classList.remove('flip-out', 'active', 'visible');
            currentScreen = toName;
            isTransitioning = false;
            if (onReady) onReady();
        }
        from.addEventListener('animationend', onDone);
    }

    function flipBackward(toName, fromName, onReady) {
        const to = screens[toName];
        const from = screens[fromName];

        to.classList.add('flip-in', 'active', 'visible');

        function onDone(e) {
            if (e.animationName !== 'pageFlipIn') return;
            to.removeEventListener('animationend', onDone);
            to.classList.remove('flip-in');
            from.classList.remove('active');
            currentScreen = toName;
            isTransitioning = false;
            if (onReady) onReady();
        }
        to.addEventListener('animationend', onDone);
    }

    function flipToNextWord() {
        const gameScreen = screens.game;
        const clone = gameScreen.cloneNode(true);
        clone.removeAttribute('id');
        clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
        clone.classList.add('word-flip-clone');
        clone.style.zIndex = '50';

        gameScreen.parentNode.insertBefore(clone, gameScreen.nextSibling);
        gameScreen.classList.remove('active');

        loadWordVisuals();

        clone.classList.add('flip-out');

        clone.addEventListener('animationend', function onDone(e) {
            if (e.animationName !== 'pageFlipOut') return;
            clone.removeEventListener('animationend', onDone);
            clone.remove();
            gameScreen.classList.add('active');
            startTimer();
        });
    }

    // ===== EVENT LISTENERS =====
    els.editionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            els.editionBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            difficulty = btn.dataset.difficulty;
        });
    });

    els.btnStart.addEventListener('click', startGame);
    els.btnReplay.addEventListener('click', () => {
        resetStack();
        startGame();
    });
    els.btnHome.addEventListener('click', () => {
        resetStack();
    });
    els.btnQuit.addEventListener('click', () => {
        stopTimer();
        resetStack();
    });
    els.btnHint.addEventListener('click', useHint);
    els.btnSkip.addEventListener('click', skipWord);

    function resetStack() {
        stopTimer();
        isTransitioning = false;

        document.querySelectorAll('.word-flip-clone').forEach(el => el.remove());

        Object.values(screens).forEach(s => {
            s.classList.remove('flip-out', 'flip-in', 'active');
            s.classList.add('visible');
            s.style.transform = '';
        });

        screens.title.dataset.layer = '2';
        screens.game.dataset.layer = '1';
        screens.result.dataset.layer = '0';

        screens.title.style.zIndex = '';
        screens.game.style.zIndex = '';
        screens.result.style.zIndex = '';

        screens.title.classList.add('active');
        currentScreen = 'title';
    }

    // ===== GAME =====
    function startGame() {
        const bank = [...WORD_BANK[difficulty]];
        shuffleArray(bank);
        words = bank.slice(0, WORDS_PER_ROUND);
        currentIndex = 0;
        score = 0;
        totalAttempts = 0;
        correctAttempts = 0;
        streak = 0;
        bestStreak = 0;
        hintsUsed = 0;
        results = [];
        maxTime = timeLimits[difficulty];

        els.gameEdition.textContent = editionNames[difficulty];
        els.gameScore.textContent = '0';
        loadWordVisuals();
        showScreen('game', () => startTimer());
    }

    function loadWordVisuals() {
        currentWord = words[currentIndex];
        spelledSoFar = '';
        hintsUsed = 0;

        els.gameLevel.textContent = `Word ${currentIndex + 1} / ${words.length}`;
        els.indoWord.textContent = currentWord.id;
        els.cardInner.style.clipPath = generateTornClipPath();
        els.spellingHint.textContent = 'click the scattered letters to spell the English word';

        renderSlots();
        renderLetters();
    }

    function loadWord() {
        if (currentIndex >= words.length) { endGame(); return; }
        loadWordVisuals();
        startTimer();
    }

    function renderSlots() {
        els.spellingSlots.innerHTML = '';
        for (let i = 0; i < currentWord.en.length; i++) {
            const slot = document.createElement('div');
            slot.className = 'spell-slot';
            slot.dataset.index = i;
            els.spellingSlots.appendChild(slot);
        }
    }

    function renderLetters() {
        els.playArea.querySelectorAll('.letter-tile').forEach(t => t.remove());

        const letters = currentWord.en.split('');
        const extras = generateDecoyLetters(currentWord.en, difficulty);
        const allLetters = [...letters, ...extras];
        shuffleArray(allLetters);

        allLetters.forEach((letter, i) => {
            const tile = document.createElement('div');
            tile.className = 'letter-tile';

            const inner = document.createElement('div');
            inner.className = 'tile-inner';
            inner.textContent = letter;
            inner.style.clipPath = generateTornClipPath();
            tile.appendChild(inner);

            tile.addEventListener('click', () => onLetterClick(tile, letter));
            els.playArea.appendChild(tile);
        });

        requestAnimationFrame(() => {
            requestAnimationFrame(() => scatterLetters());
        });
    }

    function generateDecoyLetters(word, diff) {
        const counts = { easy: 2, medium: 4, hard: 6 };
        const count = counts[diff] || 2;
        const alphabet = 'abcdefghijklmnopqrstuvwxyz';
        const decoys = [];
        for (let i = 0; i < count; i++) {
            decoys.push(alphabet[Math.floor(Math.random() * 26)]);
        }
        return decoys;
    }

    function generateTornClipPath() {
        const points = [];
        const segs = 6;
        const jitter = 5;

        for (let i = 0; i <= segs; i++) {
            points.push(`${(i / segs) * 100}% ${Math.random() * jitter}%`);
        }
        for (let i = 1; i <= segs; i++) {
            points.push(`${100 - Math.random() * jitter}% ${(i / segs) * 100}%`);
        }
        for (let i = segs; i >= 0; i--) {
            points.push(`${(i / segs) * 100}% ${100 - Math.random() * jitter}%`);
        }
        for (let i = segs - 1; i >= 1; i--) {
            points.push(`${Math.random() * jitter}% ${(i / segs) * 100}%`);
        }
        return `polygon(${points.join(', ')})`;
    }

    function scatterLetters() {
        const area = els.playArea;
        const tiles = Array.from(area.querySelectorAll('.letter-tile'));
        if (!tiles.length) return;

        const aW = area.clientWidth;
        const aH = area.clientHeight;
        const cx = aW / 2;
        const cy = aH * 0.45;
        const count = tiles.length;

        const tileW = tiles[0].offsetWidth || 66;
        const tileH = tiles[0].offsetHeight || 68;

        const card = els.indoCard;
        const halfCardW = card.offsetWidth / 2 + 10;
        const halfCardH = card.offsetHeight / 2 + 10;

        const maxDistX = Math.max(cx - tileW / 2 - 4, halfCardW + tileW);
        const maxDistY = Math.max(aH / 2 - tileH / 2 - 4, halfCardH + tileH);

        const placed = [];

        tiles.forEach((tile, i) => {
            const baseAngle = (2 * Math.PI / count) * i - Math.PI / 2;
            let x, y, attempts = 0;
            let bestX = 0, bestY = 0, bestDist = 0;

            do {
                const angle = baseAngle + (Math.random() - 0.5) * (1.8 / count) * Math.PI;
                const rFactor = 0.1 + Math.random() * 0.35;
                const rx = (halfCardW + tileW * 0.3) + (maxDistX - halfCardW) * rFactor;
                const ry = (halfCardH + tileH * 0.3) + (maxDistY - halfCardH) * rFactor;

                x = cx + Math.cos(angle) * rx - tileW / 2;
                y = cy + Math.sin(angle) * ry - tileH / 2;

                x = Math.max(2, Math.min(aW - tileW - 2, x));
                y = Math.max(2, Math.min(aH - tileH - 2, y));

                const dx = (x + tileW / 2) - cx;
                const dy = (y + tileH / 2) - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > bestDist && !hasOverlap(x, y, tileW, tileH, placed)) {
                    bestDist = dist;
                    bestX = x;
                    bestY = y;
                }

                attempts++;
            } while (attempts < 40);

            if (bestDist > 0) { x = bestX; y = bestY; }

            placed.push({ x, y });
            tile.style.left = x + 'px';
            tile.style.top = y + 'px';
        });
    }

    function hasOverlap(x, y, w, h, placed) {
        const pad = 6;
        return placed.some(p =>
            Math.abs(x - p.x) < w - pad && Math.abs(y - p.y) < h - pad
        );
    }

    // ===== LETTER CLICK =====
    function onLetterClick(tile, letter) {
        if (tile.classList.contains('used')) return;

        const expected = currentWord.en[spelledSoFar.length];
        totalAttempts++;

        if (letter === expected) {
            correctAttempts++;
            tile.classList.add('used');
            spelledSoFar += letter;

            const slot = els.spellingSlots.children[spelledSoFar.length - 1];
            slot.classList.add('filled');
            slot.innerHTML = `<span class="slot-letter">${letter}</span>`;

            spawnParticles(slot, ['✳', '✦', '•']);

            if (spelledSoFar === currentWord.en) {
                wordComplete(true);
            }
        } else {
            tile.classList.add('wrong-pick');
            setTimeout(() => tile.classList.remove('wrong-pick'), 400);
            streak = 0;
            showToast('Wrong letter!');
        }
    }

    function wordComplete(solved) {
        stopTimer();

        if (solved) {
            streak++;
            if (streak > bestStreak) bestStreak = streak;

            const timeBonus = Math.floor(timeLeft * 3);
            const streakBonus = (streak >= 3) ? streak * 10 : 0;
            const basePoints = currentWord.en.length * 10;
            const hintPenalty = hintsUsed * 15;
            const wordScore = Math.max(basePoints + timeBonus + streakBonus - hintPenalty, 10);

            score += wordScore;
            els.gameScore.textContent = score;

            els.spellingSlots.querySelectorAll('.spell-slot').forEach(s => s.classList.add('correct'));
            els.playArea.classList.add('word-complete');

            if (streak >= 3) showStreakBanner(streak);
            showPointsPopup(`+${wordScore}`);

            results.push({ word: currentWord, solved: true, score: wordScore });
        } else {
            streak = 0;
            results.push({ word: currentWord, solved: false, score: 0 });
            revealAnswer();
        }

        currentIndex++;
        const delay = solved ? (streak >= 3 ? 2300 : 1100) : 2100;
        setTimeout(() => {
            els.playArea.classList.remove('word-complete');

            if (currentIndex >= words.length) {
                endGame();
                return;
            }

            flipToNextWord();
        }, delay);
    }

    function revealAnswer() {
        els.spellingSlots.innerHTML = '';
        for (const ch of currentWord.en) {
            const slot = document.createElement('div');
            slot.className = 'spell-slot filled';
            slot.innerHTML = `<span class="slot-letter">${ch}</span>`;
            slot.style.color = 'var(--error)';
            slot.style.borderBottomColor = 'var(--error)';
            els.spellingSlots.appendChild(slot);
        }
        els.spellingHint.textContent = `The answer was: ${currentWord.en}`;
    }

    // ===== HINT =====
    function useHint() {
        if (!currentWord) return;
        const nextIndex = spelledSoFar.length;
        if (nextIndex >= currentWord.en.length) return;

        const nextLetter = currentWord.en[nextIndex];

        const tiles = els.playArea.querySelectorAll('.letter-tile:not(.used)');
        for (const tile of tiles) {
            if (tile.querySelector('.tile-inner').textContent.toLowerCase() === nextLetter) {
                hintsUsed++;

                tile.classList.add('used');
                spelledSoFar += nextLetter;

                const slot = els.spellingSlots.children[spelledSoFar.length - 1];
                slot.classList.add('filled');
                slot.innerHTML = `<span class="slot-letter">${nextLetter}</span>`;

                showToast('Letter revealed! (−15 pts)');

                if (spelledSoFar === currentWord.en) {
                    wordComplete(true);
                }
                return;
            }
        }
    }

    function skipWord() {
        if (!currentWord) return;
        wordComplete(false);
    }

    // ===== TIMER =====
    function startTimer() {
        stopTimer();
        timeLeft = maxTime;
        updateTimerDisplay();

        timer = setInterval(() => {
            timeLeft--;
            updateTimerDisplay();
            if (timeLeft <= 0) {
                showToast("Time's up!");
                wordComplete(false);
            }
        }, 1000);
    }

    function stopTimer() {
        if (timer) { clearInterval(timer); timer = null; }
    }

    function updateTimerDisplay() {
        els.timerText.textContent = timeLeft;
        const offset = TIMER_CIRCUMFERENCE * (1 - timeLeft / maxTime);
        els.timerCircle.style.strokeDashoffset = offset;
        els.timerCircle.classList.toggle('urgent', timeLeft <= 5);
    }

    // ===== END GAME =====
    function endGame() {
        stopTimer();
        const solved = results.filter(r => r.solved).length;
        const acc = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;

        els.resultScore.textContent = score;
        els.resultSolved.textContent = `${solved} / ${words.length}`;
        els.resultAccuracy.textContent = `${acc}%`;
        els.resultStreak.textContent = bestStreak;

        if (solved === words.length) {
            els.resultStamp.textContent = 'PERFECT';
            els.resultStamp.style.color = 'var(--success)';
            els.resultStamp.style.borderColor = 'var(--success)';
            els.resultHeadline.textContent = 'STOP THE PRESS!';
        } else if (solved >= words.length * 0.7) {
            els.resultStamp.textContent = 'WELL DONE';
            els.resultStamp.style.color = 'var(--gold)';
            els.resultStamp.style.borderColor = 'var(--gold)';
            els.resultHeadline.textContent = 'EXTRA! EXTRA!';
        } else {
            els.resultStamp.textContent = 'TRY AGAIN';
            els.resultStamp.style.color = 'var(--accent)';
            els.resultStamp.style.borderColor = 'var(--accent)';
            els.resultHeadline.textContent = 'Late Edition';
        }
        els.resultSubhead.textContent = `${editionNames[difficulty]} — Final Report`;

        els.resultWords.innerHTML = '';
        results.forEach(r => {
            const row = document.createElement('div');
            row.className = 'result-word-row';
            row.innerHTML = `
                <span class="result-word-indo">${r.word.id}</span>
                <span class="result-word-en">${r.word.en}</span>
                <span class="result-word-status ${r.solved ? 'solved' : 'missed'}">${r.solved ? 'solved' : 'missed'}</span>
            `;
            els.resultWords.appendChild(row);
        });

        showScreen('result');
    }

    // ===== EFFECTS =====
    function spawnParticles(element, symbols) {
        const rect = element.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        for (let i = 0; i < 5; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            p.textContent = symbols[Math.floor(Math.random() * symbols.length)];
            const angle = (Math.PI * 2 / 5) * i + Math.random() * 0.5;
            const dist = 30 + Math.random() * 30;
            p.style.left = cx + 'px';
            p.style.top = cy + 'px';
            p.style.setProperty('--px', Math.cos(angle) * dist + 'px');
            p.style.setProperty('--py', Math.sin(angle) * dist + 'px');
            p.style.color = '#3a3a3a';
            document.body.appendChild(p);
            setTimeout(() => p.remove(), 800);
        }
    }

    function showToast(msg) {
        document.querySelectorAll('.toast').forEach(t => {
            t.classList.add('hide');
            t.addEventListener('animationend', () => t.remove(), { once: true });
        });
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => {
            t.classList.add('hide');
            t.addEventListener('animationend', () => t.remove(), { once: true });
        }, 1500);
    }

    function showPointsPopup(text) {
        const header = document.querySelector('.game-header');
        if (!header) return;
        header.querySelectorAll('.points-popup').forEach(p => p.remove());
        const el = document.createElement('div');
        el.className = 'points-popup';
        el.textContent = text;
        header.appendChild(el);
        setTimeout(() => el.remove(), 1300);
    }

    function showStreakBanner(n) {
        const b = document.createElement('div');
        b.className = 'streak-banner';
        b.textContent = `${n}× Streak!`;
        document.body.appendChild(b);
        setTimeout(() => b.remove(), 2000);
    }

    function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    // ===== KEYBOARD SUPPORT =====
    document.addEventListener('keydown', (e) => {
        if (currentScreen !== 'game' || !currentWord) return;

        const key = e.key.toLowerCase();
        if (key.length === 1 && key >= 'a' && key <= 'z') {
            const tiles = els.playArea.querySelectorAll('.letter-tile:not(.used)');
            for (const tile of tiles) {
                if (tile.querySelector('.tile-inner').textContent.toLowerCase() === key) {
                    tile.click();
                    break;
                }
            }
        }
    });

    // ===== INIT =====
    initStack();
})();
