/* ============================================================
   QR Code Reader – Main Application Logic
   ============================================================
   Uses jsQR for decoding. We control the camera stream
   ourselves via getUserMedia, draw each frame to a hidden
   canvas, and run FOUR decode passes per frame:

   PASS 1 — Full frame, white quiet zone border, normal decode.
             Catches standard black-on-white QR codes.

   PASS 2 — Centre crop (60%) with large WHITE quiet zone.
             Catches standard codes printed hard to the edge
             with no quiet zone (e.g. sticker/label prints).

   PASS 3 — Full frame, BLACK quiet zone border, inverted decode.
             Catches inverted/negative QR codes (white-on-dark).
             The black border matches the dark background of the
             inverted code so jsQR can locate the finder corners.

   PASS 4 — Centre crop (60%) with large BLACK quiet zone,
             inverted decode. Catches inverted codes printed
             hard to the edge with no quiet zone.

   WHY FOUR PASSES?
   jsQR is a mathematical decoder — it needs clean contrast at
   the edge of the QR code to locate the finder pattern corners.
   Apple's native camera uses machine learning to reconstruct
   missing quiet zones automatically; jsQR cannot do this, so we
   simulate it by padding each frame with the correct border colour
   before decoding.
   ============================================================ */

(function () {

    /* ----------------------------------------------------------
       Element References
       ---------------------------------------------------------- */
    var btnStart       = document.getElementById('btnStartScan');
    var btnStop        = document.getElementById('btnStopScan');
    var btnCopy        = document.getElementById('btnCopy');
    var btnOpenLink    = document.getElementById('btnOpenLink');
    var btnScanAgain   = document.getElementById('btnScanAgain');
    var themeToggle    = document.getElementById('themeToggle');
    var themeIcon      = document.getElementById('themeIcon');

    var placeholder    = document.getElementById('scanner-placeholder');
    var resultsSection = document.getElementById('results-section');
    var typeBadge      = document.getElementById('qr-type-badge');
    var typeLabel      = document.getElementById('qr-type-label');
    var decodedContent = document.getElementById('qr-decoded-content');
    var rawDataPre     = document.getElementById('qr-raw-data');

    /* ----------------------------------------------------------
       Scanner State
       ---------------------------------------------------------- */
    var videoEl      = document.getElementById('qr-video');
    var canvasEl     = document.getElementById('qr-canvas');
    var overlayEl    = document.getElementById('qr-overlay');
    var activeStream = null;
    var animFrame    = null;
    var isScanning   = false;
    var lastResult   = null;

    /* ----------------------------------------------------------
       Quiet Zone Padding (pixels added to each side of the frame)
       ---------------------------------------------------------- */
    var QUIET_ZONE = 60;

    /* ----------------------------------------------------------
       Start Scanning
       ---------------------------------------------------------- */
    function startScanning() {
        placeholder.classList.add('d-none');
        btnStart.classList.add('d-none');
        btnStop.classList.remove('d-none');
        resultsSection.classList.add('d-none');
        videoEl.classList.remove('d-none');
        overlayEl.classList.remove('d-none');

        // Request rear camera — essential for iPhone
        var constraints = {
            video: {
                facingMode: { ideal: 'environment' },
                width:  { ideal: 1280 },
                height: { ideal: 720 }
            }
        };

        navigator.mediaDevices.getUserMedia(constraints)
            .then(function (stream) {
                activeStream = stream;
                videoEl.srcObject = stream;
                videoEl.setAttribute('playsinline', true); // Required for iOS Safari
                videoEl.play();
                isScanning = true;
                requestAnimationFrame(scanFrame);
            })
            .catch(function (err) {
                showCameraError(err);
            });
    }

    /* ----------------------------------------------------------
       Scan Loop — runs on every animation frame
       ---------------------------------------------------------- */
    function scanFrame() {
        if (!isScanning) return;

        if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
            var ctx  = canvasEl.getContext('2d');
            var vidW = videoEl.videoWidth;
            var vidH = videoEl.videoHeight;

            // Pre-calculate the centre crop coordinates used in Pass 2 & 4
            var LARGE_QUIET = 80;
            var cropW = Math.floor(vidW * 0.60);
            var cropH = Math.floor(vidH * 0.60);
            var cropX = Math.floor((vidW - cropW) / 2);
            var cropY = Math.floor((vidH - cropH) / 2);

            // ── PASS 1: Full frame, WHITE border, normal decode ──────────────
            // Catches standard black-on-white QR codes.
            canvasEl.width  = vidW + (QUIET_ZONE * 2);
            canvasEl.height = vidH + (QUIET_ZONE * 2);

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
            ctx.drawImage(videoEl, QUIET_ZONE, QUIET_ZONE, vidW, vidH);

            drawOverlay();

            var imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
            var code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert'
            });
            if (code && code.data) { onScanSuccess(code.data); return; }

            // ── PASS 2: Centre crop, large WHITE border, normal decode ───────
            // Catches standard codes printed with no quiet zone (stickers etc).
            canvasEl.width  = cropW + (LARGE_QUIET * 2);
            canvasEl.height = cropH + (LARGE_QUIET * 2);

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
            ctx.drawImage(videoEl, cropX, cropY, cropW, cropH,
                          LARGE_QUIET, LARGE_QUIET, cropW, cropH);

            var cropData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
            var code2 = jsQR(cropData.data, cropData.width, cropData.height, {
                inversionAttempts: 'dontInvert'
            });
            if (code2 && code2.data) { onScanSuccess(code2.data); return; }

            // ── PASS 3: Full frame, BLACK border, inverted decode ────────────
            // Catches inverted/negative QR codes (white modules on dark bg).
            // A black border matches the dark background so jsQR can find the
            // finder pattern corners — mirrors the manual pen-border fix.
            canvasEl.width  = vidW + (QUIET_ZONE * 2);
            canvasEl.height = vidH + (QUIET_ZONE * 2);

            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
            ctx.drawImage(videoEl, QUIET_ZONE, QUIET_ZONE, vidW, vidH);

            var invImageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
            var code3 = jsQR(invImageData.data, invImageData.width, invImageData.height, {
                inversionAttempts: 'onlyInvert'
            });
            if (code3 && code3.data) { onScanSuccess(code3.data); return; }

            // ── PASS 4: Centre crop, large BLACK border, inverted decode ─────
            // Catches inverted codes printed with no quiet zone.
            canvasEl.width  = cropW + (LARGE_QUIET * 2);
            canvasEl.height = cropH + (LARGE_QUIET * 2);

            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
            ctx.drawImage(videoEl, cropX, cropY, cropW, cropH,
                          LARGE_QUIET, LARGE_QUIET, cropW, cropH);

            var cropInvData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
            var code4 = jsQR(cropInvData.data, cropInvData.width, cropInvData.height, {
                inversionAttempts: 'onlyInvert'
            });
            if (code4 && code4.data) { onScanSuccess(code4.data); return; }
        }

        animFrame = requestAnimationFrame(scanFrame);
    }

    /* ----------------------------------------------------------
       Draw Scanning Overlay (cyan corner brackets)
       ---------------------------------------------------------- */
    function drawOverlay() {
        var ov  = overlayEl;
        var ctx = ov.getContext('2d');
        ov.width  = ov.offsetWidth;
        ov.height = ov.offsetHeight;

        var w = ov.width;
        var h = ov.height;

        var boxSize = Math.min(w, h) * 0.65;
        var left    = (w - boxSize) / 2;
        var top     = (h - boxSize) / 2;
        var right   = left + boxSize;
        var bottom  = top  + boxSize;
        var corner  = boxSize * 0.12;

        ctx.clearRect(0, 0, w, h);

        // Dim area outside the target box
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(0, 0, w, h);

        // Clear window in the centre
        ctx.clearRect(left, top, boxSize, boxSize);

        // Cyan corner brackets
        ctx.strokeStyle = '#00d2ff';
        ctx.lineWidth   = 3;
        ctx.lineCap     = 'round';
        ctx.beginPath();

        // Top-left
        ctx.moveTo(left, top + corner);
        ctx.lineTo(left, top);
        ctx.lineTo(left + corner, top);

        // Top-right
        ctx.moveTo(right - corner, top);
        ctx.lineTo(right, top);
        ctx.lineTo(right, top + corner);

        // Bottom-right
        ctx.moveTo(right, bottom - corner);
        ctx.lineTo(right, bottom);
        ctx.lineTo(right - corner, bottom);

        // Bottom-left
        ctx.moveTo(left + corner, bottom);
        ctx.lineTo(left, bottom);
        ctx.lineTo(left, bottom - corner);

        ctx.stroke();
    }

    /* ----------------------------------------------------------
       Stop Scanning
       ---------------------------------------------------------- */
    function stopScanning() {
        stopCamera();
        showIdleState();
    }

    function stopCamera() {
        isScanning = false;

        if (animFrame) {
            cancelAnimationFrame(animFrame);
            animFrame = null;
        }

        if (activeStream) {
            activeStream.getTracks().forEach(function (track) {
                track.stop();
            });
            activeStream = null;
        }

        videoEl.srcObject = null;
        videoEl.classList.add('d-none');
        overlayEl.classList.add('d-none');
    }

    function showIdleState() {
        placeholder.classList.remove('d-none');
        btnStop.classList.add('d-none');
        btnStart.classList.remove('d-none');
    }

    /* ----------------------------------------------------------
       Scan Success
       ---------------------------------------------------------- */
    function onScanSuccess(decodedText) {
        if (navigator.vibrate) {
            navigator.vibrate(100);
        }

        stopCamera();

        lastResult = QRParser.parse(decodedText);
        displayResult(lastResult, decodedText);
    }

    /* ----------------------------------------------------------
       Display Result
       ---------------------------------------------------------- */
    function displayResult(result, rawText) {
        typeBadge.textContent = result.badgeLabel;
        typeLabel.textContent = 'Type: ' + result.type;

        var html = '';
        for (var i = 0; i < result.fields.length; i++) {
            var field = result.fields[i];
            html += '<div class="field-value">';
            html += '  <div class="field-label">' + escapeHtml(field.label) + '</div>';
            if (/^https?:\/\//i.test(field.value)) {
                html += '  <div><a href="' + escapeHtml(field.value) + '" target="_blank" rel="noopener">'
                      + escapeHtml(field.value) + '</a></div>';
            } else {
                html += '  <div>' + escapeHtml(field.value) + '</div>';
            }
            html += '</div>';
        }
        decodedContent.innerHTML = html;

        rawDataPre.textContent = rawText;

        if (result.linkUrl) {
            btnOpenLink.classList.remove('d-none');
            btnOpenLink.onclick = function () {
                window.open(result.linkUrl, '_blank', 'noopener');
            };
        } else {
            btnOpenLink.classList.add('d-none');
            btnOpenLink.onclick = null;
        }

        btnStop.classList.add('d-none');
        btnStart.classList.remove('d-none');
        placeholder.classList.remove('d-none');
        resultsSection.classList.remove('d-none');

        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /* ----------------------------------------------------------
       Camera Error Handling
       ---------------------------------------------------------- */
    function showCameraError(err) {
        var msg = 'Could not access the camera.';
        var errStr = String(err);

        if (errStr.indexOf('NotAllowedError') !== -1) {
            msg = 'Camera access was denied. Please allow camera permissions in your browser settings and try again.';
        } else if (errStr.indexOf('NotFoundError') !== -1) {
            msg = 'No camera was found on this device.';
        } else if (errStr.indexOf('NotReadableError') !== -1) {
            msg = 'Camera is in use by another app. Please close other camera apps and try again.';
        } else if (errStr.indexOf('OverconstrainedError') !== -1) {
            msg = 'Could not access the rear camera. Please try again.';
        }

        placeholder.classList.remove('d-none');
        placeholder.innerHTML =
            '<i class="bi bi-exclamation-triangle-fill display-3 text-warning"></i>' +
            '<p class="mt-3 mb-0 text-muted">' + escapeHtml(msg) + '</p>';

        showIdleState();
    }

    /* ----------------------------------------------------------
       Copy to Clipboard
       ---------------------------------------------------------- */
    function copyToClipboard() {
        if (!lastResult || !lastResult.copyText) return;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(lastResult.copyText).then(function () {
                showCopyFeedback();
            }).catch(function () {
                fallbackCopy(lastResult.copyText);
            });
        } else {
            fallbackCopy(lastResult.copyText);
        }
    }

    function fallbackCopy(text) {
        var textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showCopyFeedback();
        } catch (e) {
            alert('Copy failed. Please copy manually:\n\n' + text);
        }
        document.body.removeChild(textarea);
    }

    function showCopyFeedback() {
        btnCopy.innerHTML = '<i class="bi bi-check-lg me-1"></i>Copied!';
        btnCopy.classList.add('btn-copy-success');
        setTimeout(function () {
            btnCopy.innerHTML = '<i class="bi bi-clipboard me-1"></i>Copy';
            btnCopy.classList.remove('btn-copy-success');
        }, 1500);
    }

    /* ----------------------------------------------------------
       Theme Toggle
       ---------------------------------------------------------- */
    function initTheme() {
        var saved = localStorage.getItem('qr-reader-theme');
        if (saved === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
            themeIcon.className = 'bi bi-sun-fill';
        }
    }

    function toggleTheme() {
        var current = document.documentElement.getAttribute('data-theme');
        if (current === 'light') {
            document.documentElement.removeAttribute('data-theme');
            themeIcon.className = 'bi bi-moon-fill';
            localStorage.setItem('qr-reader-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            themeIcon.className = 'bi bi-sun-fill';
            localStorage.setItem('qr-reader-theme', 'light');
        }
    }

    /* ----------------------------------------------------------
       Utility
       ---------------------------------------------------------- */
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(text));
        return div.innerHTML;
    }

    /* ----------------------------------------------------------
       Event Listeners
       ---------------------------------------------------------- */
    btnStart.addEventListener('click', startScanning);
    btnStop.addEventListener('click', stopScanning);
    btnCopy.addEventListener('click', copyToClipboard);
    btnScanAgain.addEventListener('click', function () {
        resultsSection.classList.add('d-none');
        startScanning();
    });
    themeToggle.addEventListener('click', toggleTheme);

    /* ----------------------------------------------------------
       Initialise
       ---------------------------------------------------------- */
    initTheme();

    /* ----------------------------------------------------------
       Register Service Worker (PWA)
       ---------------------------------------------------------- */
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('sw.js').catch(function (err) {
                console.log('Service Worker registration skipped:', err);
            });
        });
    }

})();
