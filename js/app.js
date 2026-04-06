/* ============================================================
   QR Code Reader – Main Application Logic
   ============================================================
   Uses jsQR for decoding. We control the camera stream
   ourselves via getUserMedia and process every frame twice:

   PASS 1 — Normal frame + white quiet zone padding
             Decodes standard black-on-white QR codes.

   PASS 2 — Pixel-inverted frame + white quiet zone padding
             We manually flip every pixel (255 - value) before
             passing to jsQR. This reliably decodes white-on-dark
             (inverted) QR codes such as those printed in the
             Olivier Awards brochure. This is more reliable than
             jsQR's built-in 'attemptBoth' flag which can miss
             inverted codes under real camera lighting conditions.
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

    // White border added around every frame before decoding.
    // Compensates for QR codes printed without a quiet zone.
    var QUIET_ZONE = 40;

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
                videoEl.setAttribute('playsinline', true);
                videoEl.play();
                isScanning = true;
                requestAnimationFrame(scanFrame);
            })
            .catch(function (err) {
                showCameraError(err);
            });
    }

    /* ----------------------------------------------------------
       Scan Loop
       ---------------------------------------------------------- */
    function scanFrame() {
        if (!isScanning) return;

        if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
            var ctx   = canvasEl.getContext('2d');
            var vidW  = videoEl.videoWidth;
            var vidH  = videoEl.videoHeight;
            var padW  = vidW + (QUIET_ZONE * 2);
            var padH  = vidH + (QUIET_ZONE * 2);

            canvasEl.width  = padW;
            canvasEl.height = padH;

            // Fill white — this is the quiet zone border
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, padW, padH);

            // Draw video frame inset inside the white border
            ctx.drawImage(videoEl, QUIET_ZONE, QUIET_ZONE, vidW, vidH);

            // Draw scanning overlay
            drawOverlay();

            // Get pixel data
            var imageData = ctx.getImageData(0, 0, padW, padH);

            /* --------------------------------------------------
               PASS 1: Try to decode the frame as-is
               Handles normal black-on-white QR codes
               -------------------------------------------------- */
            var code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert'
            });

            if (code && code.data) {
                onScanSuccess(code.data);
                return;
            }

            /* --------------------------------------------------
               PASS 2: Manually invert every pixel, then decode
               Handles white-on-dark (inverted) QR codes.
               We flip each R, G, B value: newValue = 255 - oldValue
               The alpha channel (every 4th byte) is left at 255.
               -------------------------------------------------- */
            var data    = imageData.data;
            var invData = new Uint8ClampedArray(data.length);

            for (var i = 0; i < data.length; i += 4) {
                invData[i]     = 255 - data[i];     // Red
                invData[i + 1] = 255 - data[i + 1]; // Green
                invData[i + 2] = 255 - data[i + 2]; // Blue
                invData[i + 3] = 255;                // Alpha — keep fully opaque
            }

            var invImageData = new ImageData(invData, padW, padH);

            var codeInv = jsQR(invImageData.data, invImageData.width, invImageData.height, {
                inversionAttempts: 'dontInvert'
            });

            if (codeInv && codeInv.data) {
                onScanSuccess(codeInv.data);
                return;
            }
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

        var w      = ov.width;
        var h      = ov.height;
        var boxSize = Math.min(w, h) * 0.65;
        var left    = (w - boxSize) / 2;
        var top     = (h - boxSize) / 2;
        var right   = left + boxSize;
        var bottom  = top  + boxSize;
        var corner  = boxSize * 0.12;

        ctx.clearRect(0, 0, w, h);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(0, 0, w, h);
        ctx.clearRect(left, top, boxSize, boxSize);

        ctx.strokeStyle = '#00d2ff';
        ctx.lineWidth   = 3;
        ctx.lineCap     = 'round';
        ctx.beginPath();

        ctx.moveTo(left, top + corner);
        ctx.lineTo(left, top);
        ctx.lineTo(left + corner, top);

        ctx.moveTo(right - corner, top);
        ctx.lineTo(right, top);
        ctx.lineTo(right, top + corner);

        ctx.moveTo(right, bottom - corner);
        ctx.lineTo(right, bottom);
        ctx.lineTo(right - corner, bottom);

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
