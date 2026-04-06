/* ============================================================
   QR Code Reader – Main Application Logic
   ============================================================
   Handles:
   - Starting / stopping the camera scanner
   - Processing scan results via QRParser
   - Displaying decoded information
   - Copy-to-clipboard
   - Dark / light theme toggle
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
       Scanner Setup
       ---------------------------------------------------------- */

    // Holds the ZXing reader instance
    var codeReader = null;

    // Holds the active MediaStream so we can stop the camera tracks properly
    var activeStream = null;

    // Prevent firing onScanSuccess more than once per scan session
    var scanHandled = false;

    // Keep track of whether the scanner is running
    var isScanning = false;

    // Store the last scanned result so the "Open Link" button works
    var lastResult = null;

    /* ----------------------------------------------------------
       Start Scanning
       ---------------------------------------------------------- */
    function startScanning() {
        // Reset the "already handled" guard
        scanHandled = false;

        // Hide the placeholder, show the stop button
        placeholder.classList.add('d-none');
        btnStart.classList.add('d-none');
        btnStop.classList.remove('d-none');
        resultsSection.classList.add('d-none');

        // Build ZXing hints:
        // - TRY_HARDER makes it work on dense / high-resolution QR codes
        // - ALSO_INVERTED enables reading white-on-dark (inverted) QR codes
        var hints = new Map();
        hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
        hints.set(ZXing.DecodeHintType.ALSO_INVERTED, true);

        codeReader = new ZXing.BrowserQRCodeReader(hints);

        // Ask for the rear (environment-facing) camera explicitly.
        // This is essential for iPhone – without it Safari may pick the front camera
        // or refuse to decode at all.
        var videoConstraints = {
            facingMode: { ideal: 'environment' }
        };

        codeReader.decodeFromConstraints(
            { video: videoConstraints },
            'qr-reader',
            function (result, err) {
                if (result && !scanHandled) {
                    scanHandled = true;
                    onScanSuccess(result.getText());
                }
                // Errors on every empty frame are normal – ZXing throws
                // NotFoundException continuously; we silently ignore them.
            }
        ).then(function (controls) {
            // Save the stream controls so we can stop the camera later
            activeStream = controls;
            isScanning = true;
        }).catch(function (err) {
            console.error('Camera error:', err);
            showCameraError(err);
        });
    }

    /* ----------------------------------------------------------
       Stop Scanning  (ZXing-compatible)
       ---------------------------------------------------------- */
    function stopScanning() {
        stopCamera();
        showIdleState();
    }

    /** Cleanly stops the camera stream and the ZXing reader */
    function stopCamera() {
        // Stop via the controls object returned by decodeFromConstraints
        if (activeStream && typeof activeStream.stop === 'function') {
            activeStream.stop();
        }
        // Also call reset() on the reader itself as a belt-and-braces measure
        if (codeReader && typeof codeReader.reset === 'function') {
            codeReader.reset();
        }
        // Belt-and-braces: directly stop any live video tracks
        var videoEl = document.getElementById('qr-reader');
        if (videoEl && videoEl.srcObject) {
            videoEl.srcObject.getTracks().forEach(function (track) {
                track.stop();
            });
            videoEl.srcObject = null;
        }
        activeStream = null;
        isScanning = false;
    }

    /** Reset UI to the idle / not-scanning state */
    function showIdleState() {
        placeholder.classList.remove('d-none');
        btnStop.classList.add('d-none');
        btnStart.classList.remove('d-none');
    }

    /* ----------------------------------------------------------
       Scan Callbacks
       ---------------------------------------------------------- */

    /** Called when a QR code is successfully decoded */
    function onScanSuccess(decodedText) {
        // Vibrate briefly if the phone supports it (nice tactile feedback)
        if (navigator.vibrate) {
            navigator.vibrate(100);
        }

        // Stop the camera
        stopCamera();

        // Parse the raw QR text
        lastResult = QRParser.parse(decodedText);

        // Display the results
        displayResult(lastResult, decodedText);
    }

    /* ----------------------------------------------------------
       Display Result
       ---------------------------------------------------------- */
    function displayResult(result, rawText) {
        // Update the badge and type label
        typeBadge.textContent  = result.badgeLabel;
        typeLabel.textContent  = 'Type: ' + result.type;

        // Build the decoded content HTML
        var html = '';
        for (var i = 0; i < result.fields.length; i++) {
            var field = result.fields[i];
            html += '<div class="field-value">';
            html += '  <div class="field-label">' + escapeHtml(field.label) + '</div>';

            // If the value looks like a URL, make it a clickable link
            if (/^https?:\/\//i.test(field.value)) {
                html += '  <div><a href="' + escapeHtml(field.value) + '" target="_blank" rel="noopener">'
                      + escapeHtml(field.value) + '</a></div>';
            } else {
                html += '  <div>' + escapeHtml(field.value) + '</div>';
            }

            html += '</div>';
        }
        decodedContent.innerHTML = html;

        // Raw data
        rawDataPre.textContent = rawText;

        // Show / hide the "Open Link" button
        if (result.linkUrl) {
            btnOpenLink.classList.remove('d-none');
            btnOpenLink.onclick = function () {
                window.open(result.linkUrl, '_blank', 'noopener');
            };
        } else {
            btnOpenLink.classList.add('d-none');
            btnOpenLink.onclick = null;
        }

        // Hide scanner UI, show results
        btnStop.classList.add('d-none');
        btnStart.classList.remove('d-none');
        placeholder.classList.remove('d-none');
        resultsSection.classList.remove('d-none');

        // Scroll results into view
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
            msg = 'Could not find a rear camera. Please try again.';
        }

        // Show error in the placeholder area
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

    /** Fallback copy method for older browsers */
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

    /** Brief visual feedback on the Copy button */
    function showCopyFeedback() {
        btnCopy.innerHTML = '<i class="bi bi-check-lg me-1"></i>Copied!';
        btnCopy.classList.add('btn-copy-success');
        setTimeout(function () {
            btnCopy.innerHTML = '<i class="bi bi-clipboard me-1"></i>Copy';
            btnCopy.classList.remove('btn-copy-success');
        }, 1500);
    }

    /* ----------------------------------------------------------
       Theme Toggle (Dark / Light)
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
