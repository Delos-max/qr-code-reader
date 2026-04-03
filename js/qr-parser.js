/* ============================================================
   QR Code Parser
   ============================================================
   Takes raw QR code text and identifies the type, then
   returns structured data for display.

   Supported types:
   - URL
   - Email (mailto:)
   - Phone (tel:)
   - SMS (sms: / smsto:)
   - WiFi (WIFI:...)
   - vCard (BEGIN:VCARD)
   - Calendar Event (BEGIN:VEVENT)
   - Geo Location (geo:)
   - Plain Text (fallback)
   ============================================================ */

var QRParser = (function () {

    /**
     * Main entry point: analyse raw QR string and return a result object.
     *
     * Returns: {
     *   type:       string   – human-readable type name
     *   badgeLabel: string   – short label for the badge
     *   fields:     array    – [{ label: '...', value: '...' }, ...]
     *   linkUrl:    string|null – if the result contains an openable link
     *   copyText:   string   – plain text version for clipboard
     * }
     */
    function parse(rawText) {
        if (!rawText || typeof rawText !== 'string') {
            return fallbackPlainText('');
        }

        var trimmed = rawText.trim();

        // Check each type in order of specificity
        if (isVCard(trimmed))       return parseVCard(trimmed);
        if (isVEvent(trimmed))      return parseVEvent(trimmed);
        if (isWifi(trimmed))        return parseWifi(trimmed);
        if (isEmail(trimmed))       return parseEmail(trimmed);
        if (isPhone(trimmed))       return parsePhone(trimmed);
        if (isSMS(trimmed))         return parseSMS(trimmed);
        if (isGeo(trimmed))         return parseGeo(trimmed);
        if (isURL(trimmed))         return parseURL(trimmed);

        return fallbackPlainText(trimmed);
    }

    /* ----------------------------------------------------------
       Type Detection Helpers
       ---------------------------------------------------------- */

    function isURL(text) {
        return /^https?:\/\//i.test(text) || /^www\./i.test(text);
    }

    function isEmail(text) {
        return /^mailto:/i.test(text) || /^MATMSG:/i.test(text);
    }

    function isPhone(text) {
        return /^tel:/i.test(text);
    }

    function isSMS(text) {
        return /^smsto?:/i.test(text);
    }

    function isWifi(text) {
        return /^WIFI:/i.test(text);
    }

    function isVCard(text) {
        return /^BEGIN:VCARD/i.test(text);
    }

    function isVEvent(text) {
        return /^BEGIN:VEVENT/i.test(text) || /^BEGIN:VCALENDAR/i.test(text);
    }

    function isGeo(text) {
        return /^geo:/i.test(text);
    }

    /* ----------------------------------------------------------
       Parsers
       ---------------------------------------------------------- */

    // ----- URL -----
    function parseURL(text) {
        var url = text;
        if (/^www\./i.test(url)) {
            url = 'https://' + url;
        }
        return {
            type: 'URL / Website Link',
            badgeLabel: 'URL',
            fields: [
                { label: 'URL', value: url }
            ],
            linkUrl: url,
            copyText: url
        };
    }

    // ----- Email (mailto: and MATMSG:) -----
    function parseEmail(text) {
        var to = '', subject = '', body = '';

        if (/^MATMSG:/i.test(text)) {
            to      = extractParam(text, 'TO');
            subject = extractParam(text, 'SUB');
            body    = extractParam(text, 'BODY');
        } else {
            // mailto:address?subject=...&body=...
            var parts = text.replace(/^mailto:/i, '').split('?');
            to = decodeURIComponent(parts[0] || '');
            if (parts[1]) {
                var params = parseQueryString(parts[1]);
                subject = params.subject || '';
                body    = params.body || '';
            }
        }

        var fields = [{ label: 'Email To', value: to }];
        if (subject) fields.push({ label: 'Subject', value: subject });
        if (body)    fields.push({ label: 'Body', value: body });

        return {
            type: 'Email Address',
            badgeLabel: 'Email',
            fields: fields,
            linkUrl: 'mailto:' + encodeURIComponent(to) +
                     (subject ? '?subject=' + encodeURIComponent(subject) : ''),
            copyText: to
        };
    }

    // ----- Phone -----
    function parsePhone(text) {
        var number = text.replace(/^tel:/i, '').trim();
        return {
            type: 'Phone Number',
            badgeLabel: 'Phone',
            fields: [
                { label: 'Phone Number', value: number }
            ],
            linkUrl: 'tel:' + number,
            copyText: number
        };
    }

    // ----- SMS -----
    function parseSMS(text) {
        var cleaned = text.replace(/^smsto?:/i, '');
        var parts   = cleaned.split(':');
        var number  = (parts[0] || '').trim();
        var message = (parts[1] || '').trim();

        // Some SMS QR codes use ? for the body
        if (!message && number.indexOf('?') !== -1) {
            var qParts = number.split('?');
            number = qParts[0];
            var params = parseQueryString(qParts[1]);
            message = params.body || '';
        }

        var fields = [{ label: 'Phone Number', value: number }];
        if (message) fields.push({ label: 'Message', value: message });

        return {
            type: 'SMS Message',
            badgeLabel: 'SMS',
            fields: fields,
            linkUrl: 'sms:' + number + (message ? '?body=' + encodeURIComponent(message) : ''),
            copyText: number
        };
    }

    // ----- WiFi -----
    function parseWifi(text) {
        var ssid     = extractWifiParam(text, 'S');
        var password = extractWifiParam(text, 'P');
        var authType = extractWifiParam(text, 'T') || 'Open';
        var hidden   = extractWifiParam(text, 'H');

        var fields = [
            { label: 'Network Name (SSID)', value: ssid || '(unknown)' },
            { label: 'Security Type', value: authType.toUpperCase() }
        ];

        if (password) {
            fields.push({ label: 'Password', value: password });
        }
        if (hidden && hidden.toLowerCase() === 'true') {
            fields.push({ label: 'Hidden Network', value: 'Yes' });
        }

        return {
            type: 'WiFi Network',
            badgeLabel: 'WiFi',
            fields: fields,
            linkUrl: null,
            copyText: password || ssid
        };
    }

    // ----- vCard (Contact) -----
    function parseVCard(text) {
        var fields = [];
        var copyParts = [];

        var name  = extractVCardField(text, 'FN');
        var org   = extractVCardField(text, 'ORG');
        var title = extractVCardField(text, 'TITLE');
        var tel   = extractVCardField(text, 'TEL');
        var email = extractVCardField(text, 'EMAIL');
        var url   = extractVCardField(text, 'URL');
        var adr   = extractVCardField(text, 'ADR');
        var note  = extractVCardField(text, 'NOTE');

        if (name)  { fields.push({ label: 'Name',         value: name });  copyParts.push(name); }
        if (org)   { fields.push({ label: 'Organization',  value: org });   copyParts.push(org); }
        if (title) { fields.push({ label: 'Title',         value: title }); copyParts.push(title); }
        if (tel)   { fields.push({ label: 'Phone',         value: tel });   copyParts.push(tel); }
        if (email) { fields.push({ label: 'Email',         value: email }); copyParts.push(email); }
        if (url)   { fields.push({ label: 'Website',       value: url });   copyParts.push(url); }
        if (adr) {
            // vCard ADR fields are separated by semicolons
            var formattedAddr = adr.replace(/;+/g, ', ').replace(/^,\s*/, '').replace(/,\s*$/, '');
            fields.push({ label: 'Address', value: formattedAddr });
            copyParts.push(formattedAddr);
        }
        if (note) { fields.push({ label: 'Note', value: note }); }

        if (fields.length === 0) {
            fields.push({ label: 'Contact Data', value: '(Could not parse vCard fields)' });
        }

        return {
            type: 'Contact Card (vCard)',
            badgeLabel: 'Contact',
            fields: fields,
            linkUrl: null,
            copyText: copyParts.join('\n')
        };
    }

    // ----- Calendar Event (VEVENT) -----
    function parseVEvent(text) {
        var fields = [];

        var summary  = extractICalField(text, 'SUMMARY');
        var location = extractICalField(text, 'LOCATION');
        var dtstart  = extractICalField(text, 'DTSTART');
        var dtend    = extractICalField(text, 'DTEND');
        var desc     = extractICalField(text, 'DESCRIPTION');
        var organizer = extractICalField(text, 'ORGANIZER');

        if (summary)  fields.push({ label: 'Event',     value: summary });
        if (dtstart)  fields.push({ label: 'Start',     value: formatICalDate(dtstart) });
        if (dtend)    fields.push({ label: 'End',       value: formatICalDate(dtend) });
        if (location) fields.push({ label: 'Location',  value: location });
        if (organizer) fields.push({ label: 'Organizer', value: organizer });
        if (desc)     fields.push({ label: 'Description', value: desc });

        if (fields.length === 0) {
            fields.push({ label: 'Event Data', value: '(Could not parse event fields)' });
        }

        return {
            type: 'Calendar Event',
            badgeLabel: 'Event',
            fields: fields,
            linkUrl: null,
            copyText: (summary || 'Event') + (dtstart ? ' – ' + formatICalDate(dtstart) : '')
        };
    }

    // ----- Geo Location -----
    function parseGeo(text) {
        var coords = text.replace(/^geo:/i, '').split(/[,;?]/);
        var lat = coords[0] || '';
        var lng = coords[1] || '';

        var fields = [
            { label: 'Latitude',  value: lat },
            { label: 'Longitude', value: lng }
        ];

        // Build a Google Maps link
        var mapsUrl = 'https://maps.google.com/?q=' + lat + ',' + lng;
        fields.push({ label: 'Open in Maps', value: mapsUrl });

        return {
            type: 'Geo Location',
            badgeLabel: 'Location',
            fields: fields,
            linkUrl: mapsUrl,
            copyText: lat + ', ' + lng
        };
    }

    // ----- Plain Text Fallback -----
    function fallbackPlainText(text) {
        return {
            type: 'Plain Text',
            badgeLabel: 'Text',
            fields: [
                { label: 'Content', value: text || '(empty)' }
            ],
            linkUrl: null,
            copyText: text
        };
    }

    /* ----------------------------------------------------------
       Utility Helpers
       ---------------------------------------------------------- */

    /** Extract a WIFI: parameter like S, P, T, H */
    function extractWifiParam(text, key) {
        var regex = new RegExp('[;:]' + key + ':([^;]*)', 'i');
        var match = text.match(regex);
        return match ? match[1] : '';
    }

    /** Extract MATMSG-style parameter */
    function extractParam(text, key) {
        var regex = new RegExp(key + ':([^;]*)', 'i');
        var match = text.match(regex);
        return match ? match[1].trim() : '';
    }

    /** Parse a basic query string into an object */
    function parseQueryString(qs) {
        var obj = {};
        var pairs = qs.split('&');
        for (var i = 0; i < pairs.length; i++) {
            var kv = pairs[i].split('=');
            if (kv[0]) {
                obj[kv[0].toLowerCase()] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
            }
        }
        return obj;
    }

    /** Extract a vCard field value (handles property parameters like TEL;TYPE=CELL:...) */
    function extractVCardField(text, fieldName) {
        // Match fieldName with optional parameters (;...) followed by : and value
        var regex = new RegExp('^' + fieldName + '(?:[;][^:]*)?:(.+)$', 'im');
        var match = text.match(regex);
        return match ? match[1].trim() : '';
    }

    /** Extract an iCal field value */
    function extractICalField(text, fieldName) {
        var regex = new RegExp('^' + fieldName + '(?:[;][^:]*)?:(.+)$', 'im');
        var match = text.match(regex);
        return match ? match[1].trim() : '';
    }

    /** Format an iCal date string like 20260315T140000Z into readable text */
    function formatICalDate(dtStr) {
        if (!dtStr || dtStr.length < 8) return dtStr;
        try {
            var year  = dtStr.substring(0, 4);
            var month = dtStr.substring(4, 6);
            var day   = dtStr.substring(6, 8);
            var result = year + '-' + month + '-' + day;

            if (dtStr.length >= 15 && dtStr.charAt(8) === 'T') {
                var hour = dtStr.substring(9, 11);
                var min  = dtStr.substring(11, 13);
                result += ' at ' + hour + ':' + min;
            }
            return result;
        } catch (e) {
            return dtStr;
        }
    }

    /* ----------------------------------------------------------
       Public API
       ---------------------------------------------------------- */
    return {
        parse: parse
    };

})();
