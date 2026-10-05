/////// Modifies the behaviour of the Clay settings page for Hybrid Weather.
//
// Clay serialises this whole function into the config page, so it must be
// self-contained: no require(), and nothing from outside this function.

module.exports = function(minified) {
    var config = this;

    // Bottom slot dropdown values (must match config.json and SlotOption in HybridToo.h)
    var SLOT_STEPS = 0;
    var SLOT_TEXT = 1;
    var SLOT_TEMP = 2;
    var SLOT_BATT_VALUE = 3;
    var SLOT_BATT_ICON = 4;

    // "Custom Colours" theme values (must match config.json and the THEME enums in HybridToo.h)
    var THEME_CUSTOM = 5;
    var BW_THEME_CUSTOM = 3;

    // ---- Helpers for reading the current value of a setting ----

    var getInt = function(key) {
        var item = config.getItemByMessageKey(key);
        return item ? parseInt(item.get(), 10) : NaN;
    };

    var getBool = function(key) {
        var item = config.getItemByMessageKey(key);
        return item ? !!item.get() : false;
    };

    // Weather is used if either bottom slot shows the current temperature, or the extra
    // weather screens on shake are on - the same rule as weatherWanted() in index.js and
    // UseWeather on the watch.
    var weatherInUse = function() {
        return getInt("BottomLeft") === SLOT_TEMP ||
               getInt("BottomRight") === SLOT_TEMP ||
               getBool("ShakeWeather");
    };

    // Each rule shows its items while visible() is true and hides them otherwise.
    // `controls` are the settings whose changes re-check the rule (a rule is skipped
    // entirely if none of them are on this page); `keys` are message
    // keys and `ids` are item ids to show/hide. `sectionOf` hides the whole section card
    // that contains that item id (so no empty white box is left behind).
    var VISIBILITY_RULES = [
        {
            controls: ["BottomLeft"],
            visible: function() { return getInt("BottomLeft") === SLOT_TEXT; },
            keys: ["LogoText"]
        },
        {
            controls: ["BottomRight"],
            visible: function() { return getInt("BottomRight") === SLOT_TEXT; },
            keys: ["LogoTextRight"]
        },
        {
            controls: ["BottomLeft", "BottomRight", "ShakeWeather"],
            visible: weatherInUse,
            ids: ["WEATHER_HEADING", "WEATHER_SAVE"],
            // Lat/Long are never shown: the location search fills them in
            keys: ["WeatherProv", "LocationQuery", "APIKEY_User", "UpSlider", "WeatherUnit",
                   "RainUnit", "PressureUnit", "WindUnit"],
            sectionOf: "WEATHER_HEADING"
        },
        {
            // Colour watches: custom colour pickers only with the Custom Colours theme
            controls: ["ThemeSelect"],
            visible: function() { return getInt("ThemeSelect") === THEME_CUSTOM; },
            ids: ["CUSTOM_COLOURS_HEADING", "WATCH_PREVIEW_4"],
            keys: ["BackgroundColor1", "FGColor", "LineColor", "TextColor1", "BTQTColor",
                   "MajorTickColor", "MinorTickColor",
                   "HoursHandBorderColor", "HoursHandColor",
                   "MinutesHandBorderColor", "MinutesHandColor", "SecondsHandColor"]
        },
        {
            // Colour watches: Shadow Colour only matters with Custom Colours, Shadow on, and a
            // round face (a round watch, or Watchface Style set to Round on a rectangular one)
            controls: ["ThemeSelect", "ShadowOn", "ForegroundShape"],
            visible: function() {
                var shapeItem = config.getItemByMessageKey("ForegroundShape");   // only on rectangular watches
                var roundFace = !shapeItem || !!shapeItem.get();
                return getInt("ThemeSelect") === THEME_CUSTOM && getBool("ShadowOn") && roundFace;
            },
            keys: ["ShadowColor"]
        },
        {
            // Colour watches: the UV / rain gauge colours (and their mini-preview) only
            // matter with Custom Colours AND the extra weather screens on shake, which
            // is the only place the gauges appear
            controls: ["ThemeSelect", "ShakeWeather"],
            visible: function() { return getInt("ThemeSelect") === THEME_CUSTOM && getBool("ShakeWeather"); },
            ids: ["UV_RAIN_PREVIEW", "UV_RAIN_TEXT_EMERY_GABBRO", "UV_RAIN_TEXT_SMALL"],
            keys: ["UVArcColor", "UVMaxColor", "UVNowColor"]
        },
        {
            // B&W watches: same, for the B&W theme list
            controls: ["BWThemeSelect"],
            visible: function() { return getInt("BWThemeSelect") === BW_THEME_CUSTOM; },
            ids: ["BW_CUSTOM_COLOURS_HEADING", "WATCH_PREVIEW_6"],
            keys: ["BackgroundColor1", "FGColor", "LineColor", "TextColor1", "TickColor",
                   "HoursHandBorderColor", "HoursHandColor",
                   "MinutesHandBorderColor", "MinutesHandColor", "SecondsHandColor"]
        },
        {
            // B&W watches: UV / rain gauge colours, as for colour watches
            controls: ["BWThemeSelect", "ShakeWeather"],
            visible: function() { return getInt("BWThemeSelect") === BW_THEME_CUSTOM && getBool("ShakeWeather"); },
            ids: ["BW_UV_RAIN_PREVIEW", "BW_UV_RAIN_TEXT_SMALL"],
            keys: ["UVArcColor", "UVMaxColor", "UVNowColor"]
        }
    ];

    // ---- Showing and hiding ----

    var setVisible = function(item, visible) {
        if (!item) return;
        if (visible) { item.show(); } else { item.hide(); }
    };

    // Every built item with this message key. Some settings exist twice in config.json
    // (e.g. aplite / other platforms); normally Clay only builds the one for this watch,
    // but handle both just in case.
    var itemsForKey = function(key) {
        if (typeof config.getAllItems === 'function') {
            return config.getAllItems().filter(function(item) {
                return item.messageKey === key;
            });
        }
        var item = config.getItemByMessageKey(key);
        return item ? [item] : [];
    };

    // The section card (<div class="section">) an item sits in, if any.
    var sectionElementOf = function(id) {
        var item = config.getItemById(id);
        var el = item && item.$element && (item.$element[0] || item.$element);
        while (el && el.parentNode) {
            el = el.parentNode;
            if (el.classList && el.classList.contains('section')) return el;
        }
        return null;
    };

    var applyRule = function(rule) {
        var visible = rule.visible();

        (rule.keys || []).forEach(function(key) {
            itemsForKey(key).forEach(function(item) {
                setVisible(item, visible);
            });
        });
        (rule.ids || []).forEach(function(id) {
            setVisible(config.getItemById(id), visible);
        });
        // Any location-search message goes with the rest; it reappears by itself on the next error
        if (rule.sectionOf && !visible) setVisible(config.getItemById("LOCATION_DEBUG"), false);
        if (rule.sectionOf) {
            var section = sectionElementOf(rule.sectionOf);
            if (section) section.style.display = visible ? '' : 'none';
        }
    };

    // =================================================================
    // Location search (OpenStreetMap data via Photon), replacing manual
    // latitude/longitude entry. Picking a suggestion fills in the hidden
    // Lat/Long settings, which index.js uses for weather; leaving the box
    // empty means "use the phone's GPS".
    // =================================================================

    var LOCATION_MIN_QUERY_LENGTH = 2;
    var LOCATION_DEBOUNCE_MS = 150;
    var LOCATION_TIMEOUT_MS = 8000;    // how long to wait for Photon before giving up on a search
    var LOCATION_HIDE_DELAY_MS = 600;  // how long the list stays after the input loses focus
    var LOCATION_MAX_SUGGESTIONS = 16;
    var PHOTON_URL = 'https://photon.komoot.io/api/';

    var locationSuggestionBox = null;
    var locationDebounceTimer = null;
    var locationRequestSeq = 0;        // stops an older, slower request overwriting a newer one
    var locationCache = {};            // query (lower case) -> matches, so retyping is instant
    var lastLocationMatches = [];      // what the list is showing now
    var selectedLocationDisplay = "";  // text of the last suggestion picked (or restored from a save)
    var locationEventsWired = false;
    // True from the moment a finger / mouse goes down on the suggestion list until the
    // choice is made (or the user taps elsewhere). While it's set the list is frozen and
    // the input's blur handling is held off - see the notes in wireLocationInputEvents.
    var pointerInSuggestions = false;

    var getInputElement = function(item) {
        return item.$manipulatorTarget[0] || item.$manipulatorTarget;
    };

    var SUGGESTION_BOX_CSS = 'position:absolute;top:100%;left:0;right:0;z-index:1000;list-style:none;' +
        'margin:0;padding:0;background:#fff;color:#222;border:1px solid #ccc;' +
        'max-height:200px;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;display:none';
    var SUGGESTION_ROW_CSS = 'padding:10px 8px;cursor:pointer;color:#222;background:#fff;touch-action:manipulation';

    // A hidden suggestion list positioned directly under the input
    var createSuggestionBox = function(inputElement) {
        var parent = inputElement.parentNode;
        parent.style.position = 'relative';
        parent.style.overflow = 'visible';
        var box = document.createElement('ul');
        box.className = 'location-suggestions';
        box.style.cssText = SUGGESTION_BOX_CSS;
        box.addEventListener('touchstart', function() { pointerInSuggestions = true; }, { passive: true });
        // Dragging / scrolling the list puts the keyboard away so more of the list is visible.
        // The list itself stays: pointerInSuggestions holds off the blur handling.
        box.addEventListener('touchmove', function() {
            if (document.activeElement === inputElement) inputElement.blur();
        }, { passive: true });
        box.addEventListener('mousedown', function() { pointerInSuggestions = true; });
        parent.insertBefore(box, inputElement.nextSibling);
        return box;
    };

    var hideLocationSuggestions = function() {
        if (locationSuggestionBox) locationSuggestionBox.style.display = 'none';
    };

    // matches: array of { display, lat, lon }
    var showLocationSuggestions = function(matches, inputElement, item, latItem, longItem) {
        if (!locationSuggestionBox) locationSuggestionBox = createSuggestionBox(inputElement);
        // Never rebuild the list under someone's finger: a late reply would swap the rows
        // between touch-down and tap, so they'd pick a different place to the one they aimed at
        if (pointerInSuggestions) return;
        var box = locationSuggestionBox;
        box.innerHTML = '';
        lastLocationMatches = matches;

        if (!matches.length) {
            // Keep the box open with a note rather than letting it vanish mid-typing
            var none = document.createElement('li');
            none.textContent = 'No matches yet - keep typing';
            none.style.cssText = SUGGESTION_ROW_CSS + ';color:#888;cursor:default';
            box.appendChild(none);
            box.style.display = 'block';
            return;
        }

        matches.forEach(function(match) {
            var li = document.createElement('li');
            li.textContent = match.display;
            li.style.cssText = SUGGESTION_ROW_CSS;
            li.addEventListener('mouseenter', function() { li.style.background = '#eee'; });
            li.addEventListener('mouseleave', function() { li.style.background = '#fff'; });
            // Keep focus in the input while the mouse is down on a row (desktop)
            li.addEventListener('mousedown', function(e) { e.preventDefault(); });
            // 'click' fires for a tap but not for a scroll gesture, so scrolling the list
            // no longer risks picking a row, and a tap picks reliably on touch screens
            li.addEventListener('click', function(e) {
                e.preventDefault();
                inputElement.value = match.display;
                item.set(match.display);
                latItem.set(String(match.lat));
                longItem.set(String(match.lon));
                selectedLocationDisplay = match.display;
                pointerInSuggestions = false;
                hideLocationSuggestions();
                inputElement.blur();   // also dismisses the on-screen keyboard
            });
            box.appendChild(li);
        });

        box.style.display = 'block';
    };

    var updateLocationDebug = function(message) {
        var debug = config.getItemById("LOCATION_DEBUG");
        if (debug) {
            debug.show();
            debug.set(message);
        }
    };

    var hideLocationDebug = function() {
        var debug = config.getItemById("LOCATION_DEBUG");
        if (debug) debug.hide();
    };

    // "name, region, country", leaving out a region that repeats the name
    var buildLocationDisplay = function(namePart, regionPart, countryPart) {
        var parts = [namePart];
        if (regionPart && regionPart !== namePart) parts.push(regionPart);
        if (countryPart) parts.push(countryPart);
        return parts.join(', ');
    };

    // Two places with the same label get the county added, or failing that their coordinates
    var disambiguateLocationMatches = function(matches) {
        var counts = {};
        var i;
        for (i = 0; i < matches.length; i++) {
            counts[matches[i].display] = (counts[matches[i].display] || 0) + 1;
        }
        for (i = 0; i < matches.length; i++) {
            var m = matches[i];
            if (counts[m.display] <= 1) continue;
            if (m.county && m.county !== m.name) {
                m.display = buildLocationDisplay(m.name + ' (' + m.county + ')', m.region, m.country);
            } else {
                m.display = m.display + ' [' + m.lat.toFixed(3) + ', ' + m.lon.toFixed(3) + ']';
            }
        }
        // Second pass for any tie the county didn't break
        var countsAfter = {};
        for (i = 0; i < matches.length; i++) {
            countsAfter[matches[i].display] = (countsAfter[matches[i].display] || 0) + 1;
        }
        for (i = 0; i < matches.length; i++) {
            var m2 = matches[i];
            if (countsAfter[m2.display] > 1 && m2.display.indexOf('[') === -1) {
                m2.display = m2.display + ' [' + m2.lat.toFixed(3) + ', ' + m2.lon.toFixed(3) + ']';
            }
        }
        return matches;
    };

    // ---- Place search (Photon, OpenStreetMap data) ----

    var locationXhrs = [];   // requests in flight, aborted when a newer search starts

    var abortLocationRequests = function() {
        locationXhrs.forEach(function(x) { x.abort(); });
        locationXhrs = [];
    };

    // GET url and turn the JSON into matches with parse(json).
    // Resolves with an array, or null on failure / abort.
    var requestMatches = function(url, parse) {
        return new Promise(function(resolve) {
            var xhr = new XMLHttpRequest();
            locationXhrs.push(xhr);
            var done = false;
            var finish = function(result) {
                if (done) return;
                done = true;
                clearTimeout(timeoutId);
                locationXhrs = locationXhrs.filter(function(x) { return x !== xhr; });
                resolve(result);
            };
            var timeoutId = setTimeout(function() { xhr.abort(); finish(null); }, LOCATION_TIMEOUT_MS);

            xhr.onload = function() {
                if (xhr.status !== 200) { finish(null); return; }
                try { finish(parse(JSON.parse(xhr.responseText))); }
                catch (e) { finish(null); }
            };
            xhr.onerror = function() { finish(null); };
            xhr.onabort = function() { finish(null); };

            xhr.open('GET', url);
            xhr.send();
        });
    };

    var searchPhoton = function(query) {
        var url = PHOTON_URL +
            '?q=' + encodeURIComponent(query) +
            '&limit=' + LOCATION_MAX_SUGGESTIONS +
            '&lang=en';
        return requestMatches(url, function(json) {
            var features = json.features || [];
            var matches = [];
            for (var i = 0; i < features.length; i++) {
                var props = features[i].properties || {};
                var coords = (features[i].geometry && features[i].geometry.coordinates) || [];
                var lon = parseFloat(coords[0]); // GeoJSON order is [lon, lat]
                var lat = parseFloat(coords[1]);
                if (isNaN(lat) || isNaN(lon)) continue;
                // Postcodes, streets and addresses come back as finer-grained results than
                // towns: name them by postcode / street and add the town so they're recognisable
                var type = props.type || '';
                var finer = type === 'house' || type === 'street' || type === 'other' ||
                            props.osm_key === 'postcode' || props.osm_value === 'postal_code';
                var name = props.name || (finer ? props.street : props.city) ||
                           props.city || props.street || props.postcode || 'Unknown';
                var shownName = name;
                if (finer && props.postcode && name.indexOf(props.postcode) === -1) {
                    shownName = name + ' (' + props.postcode + ')';
                }
                var regionParts = [];
                var town = props.city || props.district || props.locality || '';
                if (finer && town && town !== name) regionParts.push(town);
                if (props.state) regionParts.push(props.state);
                var region = regionParts.join(', ');
                var country = props.country || '';
                matches.push({
                    display: buildLocationDisplay(shownName, region, country),
                    name: name, region: region, country: country,
                    county: props.county || props.district || '',
                    lat: lat, lon: lon
                });
            }
            return matches;
        });
    };

    // Resolves with an array of matches, or null if this search was superseded
    // or failed - in which case the list on screen is left as it is.
    var geocodeLocation = function(query) {
        var thisRequestSeq = ++locationRequestSeq;
        var cacheKey = query.toLowerCase();

        if (locationCache[cacheKey]) {
            return Promise.resolve(locationCache[cacheKey]);
        }

        // Only the newest search matters: drop anything still in flight
        abortLocationRequests();

        return searchPhoton(query).then(function(matches) {
            if (thisRequestSeq !== locationRequestSeq) return null;   // stale
            if (matches === null) {
                updateLocationDebug("Location search isn't responding - check your connection and try again.");
                return null;
            }
            matches = disambiguateLocationMatches(matches);
            locationCache[cacheKey] = matches;
            hideLocationDebug();
            return matches;
        });
    };

    // Open the connection to Photon ahead of time (on page load, and again on focus
    // if it's been a while), so the first real search doesn't also pay for DNS and TLS setup.
    var lastLocationWarmUp = 0;
    var warmUpLocationSearch = function() {
        var now = Date.now();
        if (now - lastLocationWarmUp < 20000) return;
        lastLocationWarmUp = now;
        try {
            var x = new XMLHttpRequest();
            x.open('GET', PHOTON_URL + '?q=lo&limit=1');
            x.send();
        } catch (e) { /* warm-up is only an optimisation */ }
    };

    // While waiting for the network, narrow the list already showing to entries
    // that still contain every word typed, so it responds on every keystroke.
    var filterShownMatches = function(query) {
        var words = query.toLowerCase().split(/[\s,]+/).filter(function(w) { return w; });
        return lastLocationMatches.filter(function(m) {
            var text = m.display.toLowerCase();
            return words.every(function(w) { return text.indexOf(w) !== -1; });
        });
    };

    // On blur, anything that isn't exactly a picked suggestion is cleared, along
    // with its Lat/Long - that's what makes the user pick from the list. Empty is
    // always valid and means "use GPS".
    var validateLocation = function(inputElement, item, latItem, longItem) {
        var value = inputElement.value;
        if (value === '' || value !== selectedLocationDisplay) {
            inputElement.value = '';
            item.set('');
            latItem.set('');
            longItem.set('');
            selectedLocationDisplay = '';
        }
    };

    var wireLocationInputEvents = function(item, latItem, longItem) {
        if (locationEventsWired) return;
        locationEventsWired = true;

        var inputElement = getInputElement(item);
        inputElement.setAttribute('autocomplete', 'off');
        inputElement.addEventListener('focus', warmUpLocationSearch);

        inputElement.addEventListener('input', function() {
            pointerInSuggestions = false;
            var query = inputElement.value;
            if (locationDebounceTimer) {
                clearTimeout(locationDebounceTimer);
                locationDebounceTimer = null;
            }
            if (query.length < LOCATION_MIN_QUERY_LENGTH) {
                hideLocationSuggestions();
                return;
            }
            // Instant feedback: cached results for this exact text, or the current
            // list narrowed down to what still matches
            var cached = locationCache[query.toLowerCase()];
            if (cached) {
                showLocationSuggestions(cached, inputElement, item, latItem, longItem);
                return;
            }
            var narrowed = filterShownMatches(query);
            if (narrowed.length) {
                showLocationSuggestions(narrowed, inputElement, item, latItem, longItem);
            }

            locationDebounceTimer = setTimeout(function() {
                geocodeLocation(query).then(function(matches) {
                    // null = superseded or failed: keep whatever is showing
                    if (matches && inputElement.value === query) {
                        showLocationSuggestions(matches, inputElement, item, latItem, longItem);
                    }
                });
            }, LOCATION_DEBOUNCE_MS);
        });

        // Phones often blur the input as soon as a finger lands on the list (the keyboard
        // closes, the page resizes), which used to clear the box and hide the list before the
        // tap registered. So while the list is being touched, blur does nothing; if the user
        // then taps anywhere else instead of picking, the handler below does the tidy-up.
        inputElement.addEventListener('blur', function() {
            setTimeout(function() {
                if (pointerInSuggestions) return;
                validateLocation(inputElement, item, latItem, longItem);
                hideLocationSuggestions();
            }, LOCATION_HIDE_DELAY_MS);
        });

        var onTapElsewhere = function(e) {
            var target = e.target;
            if (locationSuggestionBox && locationSuggestionBox.contains(target)) return;
            var wasInList = pointerInSuggestions;
            pointerInSuggestions = false;
            if (wasInList && target !== inputElement) {
                validateLocation(inputElement, item, latItem, longItem);
                hideLocationSuggestions();
            }
        };
        document.addEventListener('touchstart', onTapElsewhere, { passive: true });
        document.addEventListener('mousedown', onTapElsewhere);
    };

    var initLocationSearch = function() {
        var item = config.getItemByMessageKey("LocationQuery");
        var latItem = config.getItemByMessageKey("Lat");
        var longItem = config.getItemByMessageKey("Long");
        if (!item || !latItem || !longItem) return;

        // Lat/Long are only ever written by picking a suggestion - never shown
        latItem.hide();
        longItem.hide();
        hideLocationDebug();

        // Coordinates typed in by hand in an older version have no place name:
        // show them as the location text so they're visible and kept.
        if (!item.get() && latItem.get() && longItem.get()) {
            item.set(latItem.get() + ", " + longItem.get());
        }

        // Whatever was saved last time is trusted as-is (Lat/Long were set to match it)
        selectedLocationDisplay = item.get() || "";

        wireLocationInputEvents(item, latItem, longItem);
        warmUpLocationSearch();
    };

    // =================================================================
    // Live preview of the front screen
    //
    // Draws a canvas that approximates the watchface's front screen and
    // redraws it whenever a setting that affects it changes. Geometry comes
    // from the per-platform UIConfig blocks in HybridToo.c and the drawing
    // order matches the watch's layers:
    //   background & ticks -> centre shadow, hour & minute hands
    //   -> seconds hand -> foreground (shape, time, date, bottom slots, lines)
    //
    // It is an approximation, not a pixel-exact match:
    //   - Emery and Gabbro draw their text with fctx (DIN); the preview uses
    //     the same DIN glyphs through the browser, so spacing differs slightly.
    //   - The other watches use Pebble's built-in Gothic font for the small
    //     text, which isn't available here; Alternate Gothic No.2 stands in.
    //   - Sample values: 09:34:07, Wednesday 30 September, battery 80%,
    //     21 degrees, 8,532 steps. The Bluetooth (disconnected) and Quiet Time
    //     icons are always shown, so their position and colour can be checked.
    //   - Colours on colour watches are "sunlight corrected" to look closer to
    //     the reflective display; greys on B&W watches are shown flat rather
    //     than dithered.
    // =================================================================

    // Every "text" item in config.json whose id starts with WATCH_PREVIEW becomes a preview canvas.
    var PREVIEW_ANCHOR_IDS = ["WATCH_PREVIEW", "WATCH_PREVIEW_2", "WATCH_PREVIEW_3", "WATCH_PREVIEW_4", "WATCH_PREVIEW_5", "WATCH_PREVIEW_6", "WATCH_PREVIEW_7"];

    var getPreviewAnchorIds = function() {
        if (typeof config.getAllItems !== 'function') return PREVIEW_ANCHOR_IDS;
        var ids = [];
        config.getAllItems().forEach(function(item) {
            if (item.id && /^WATCH_PREVIEW/.test(item.id) && ids.indexOf(item.id) === -1) ids.push(item.id);
        });
        return ids;
    };

    // ---- Fonts: subsets of DINPro-CondensedMedium.ttf, Alternate Gothic No.2 (below) and dripicons (battery t u v w, Bluetooth z, Quiet Time U+E061) ----
    var DIN_WOFF2_B64 = "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";
    var DRIPICONS_WOFF2_B64 = "d09GMgABAAAAAAK4AAwAAAAABegAAAJqAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGhYGVgBEEQgKhxyFcAE2AiQDEAsQAAQgBQYHIBtXBACOxDiG8hXbJCp4ntzK94GVGdi7qBts1AxIp1JdFZcquT7ubab/F/3dT5yLF0kbUNpowhObYNVX8Oibnt6r7c8f/Plv+pWeutVokBXUITvV+eptCOABABaCkEQQC9lLgrT0kclA98X+oyQbGxYJxWKkAJwxYHLXiXRg4ctx8tK8pJ4lU1BRAdhCEWyEdmjgpr2WLy5heXeTASzcrTO7TOVPIjiRGFiQKfwcrX1IO5CpAIAzE0hQDnaplFOgUAGiXurzSoFKtl1Ml5miZV2kve0HYW3oZnbEIi4uXRcN8SSTlXWx6+4IYe1BrbdHfj5ZrF4brAMdtc2fUK2R0NseiQSYcdxjhcAjM9Ed24lowO1gxyA/dviEbFwsiIochCCqcrCkP+Rg0XBH8SxrqeueW+J1xYYPHIAMHBEVGaLnpF0/vyEWe93QINJailvHhUUO6u3FgiHMiWJO8J58uqifjYuGRYZ8alOwrb6qL6qn+q9+qvgBbQuqx2qQetz1yNqHa7n9bLjKudVhIr3dC+xpqbvcnKy1eqJGqKevSgykTsyQGK7E04MaCrc1eYG71yasuhYuHCbzvwpm/Pj/Fiw+dy8/N69f3+85319OnjhpkuEXmtSvX15ufkNHBwsXB4X82UV/7MOa77z4cPfS9FlNDbjuNN0+Gmh74NsCpwrUXtOn72RdY28Ntbl336ovmDCpJrfv6CWbU8nQ6NAp/GFyXkSjzf3o2AkA5HtTtd0nmo7JbfMvrSwAnhc5vBPg/ae5hwAsLAf+qGgQsMSgnkXFMoJjEIsqrKBglZBiAAntpgUpdAAKktjICQAA";

    // Weather Icons: sun (U+F00D) and umbrella (U+F084), for the UV / rain mini-preview
    var WEATHER_ICONS_WOFF2_B64 = "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";

    var PREVIEW_FONT_DIN = "HybridDinPreview";
    var PREVIEW_FONT_WEATHER = "HybridWeatherPreview";
    var PREVIEW_FONT_ICONS = "HybridDripiconsPreview";
    var DIN_FAMILY = "'" + PREVIEW_FONT_DIN + "', 'Arial Narrow', 'Roboto Condensed', sans-serif";
    // Pebble's built-in Gothic font isn't available here, so Alternate Gothic No.2 (embedded,
    // the same on every phone) stands in for it. It's drawn at 1.06x the Gothic size so its
    // capitals are ~0.71 of the size, like Gothic's.
    var GOTHIC_WOFF2_B64 = "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";
    var PREVIEW_FONT_GOTHIC = "HybridGothicPreview";
    var GOTHIC_FAMILY = "'" + PREVIEW_FONT_GOTHIC + "', 'Arial Narrow', 'Roboto Condensed', sans-serif";
    var GOTHIC_SCALE = 1.06;
    var GOTHIC_CAP_HEIGHT = 667 / 1000;   // capitals / digits as a fraction of the em

    // DIN line metrics as a fraction of the em (hhea 1093 / 216 over 1000 units)
    var DIN_ASCENT = 1093 / 1000;
    var DIN_DESCENT = 216 / 1000;
    var DRIP_ASCENT = 513 / 512;
    var WEATHER_ASCENT = 2245 / 2048;

    var previewFontsReady = null;
    var loadPreviewFonts = function() {
        if (previewFontsReady) return previewFontsReady;
        if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
            previewFontsReady = Promise.resolve();
            return previewFontsReady;
        }
        var faceFor = function(family, b64) {
            return new FontFace(family, "url(data:font/woff2;base64," + b64 + ")");
        };
        previewFontsReady = Promise.all([
            faceFor(PREVIEW_FONT_DIN, DIN_WOFF2_B64).load(),
            faceFor(PREVIEW_FONT_ICONS, DRIPICONS_WOFF2_B64).load(),
            faceFor(PREVIEW_FONT_WEATHER, WEATHER_ICONS_WOFF2_B64).load(),
            faceFor(PREVIEW_FONT_GOTHIC, GOTHIC_WOFF2_B64).load()
        ]).then(function(faces) {
            faces.forEach(function(f) { document.fonts.add(f); });
        }).catch(function(err) {
            console.error("Preview font load failed, falling back to system fonts:", err);
        });
        return previewFontsReady;
    };

    // ---- Platforms ----
    // geom picks the UIConfig block from HybridToo.c; fctx = text drawn with fctx (DIN)
    var PREVIEW_SCREENS = {
        aplite:  { w: 144, h: 168, round: false, bw: true,  geom: "rect",   fctx: false, aplite: true, gothicSmall: 14, gothicMedium: 24, dinTime: 38, btqtPx: 12, wxSmall: 14, wxSmallMedium: 18, wxIconPx: 10, icon: 18 },
        basalt:  { w: 144, h: 168, round: false, bw: false, geom: "rect",   fctx: false, gothicSmall: 14, gothicMedium: 24, dinTime: 38, btqtPx: 12, wxSmall: 14, wxSmallMedium: 18, wxIconPx: 10, icon: 18 },
        chalk:   { w: 180, h: 180, round: true,  bw: false, geom: "round",  fctx: false, gothicSmall: 14, gothicMedium: 24, dinTime: 46, btqtPx: 12, wxSmall: 14, wxSmallMedium: 18, wxIconPx: 10, icon: 18 },
        diorite: { w: 144, h: 168, round: false, bw: true,  geom: "rect",   fctx: false, gothicSmall: 14, gothicMedium: 24, dinTime: 38, btqtPx: 12, wxSmall: 14, wxSmallMedium: 18, wxIconPx: 10, icon: 18 },
        emery:   { w: 200, h: 228, round: false, bw: false, geom: "emery",  fctx: true,  btqtPx: 16, wxSmall: 18, wxSmallMedium: 28, wxIconPx: 12, icon: 24 },
        flint:   { w: 144, h: 168, round: false, bw: true,  geom: "rect",   fctx: false, gothicSmall: 14, gothicMedium: 24, dinTime: 38, btqtPx: 12, wxSmall: 14, wxSmallMedium: 18, wxIconPx: 10, icon: 18 },
        gabbro:  { w: 260, h: 260, round: true,  bw: false, geom: "gabbro", fctx: true,  btqtPx: 16, wxSmall: 18, wxSmallMedium: 28, wxIconPx: 12, icon: 24 }
    };

    // Generated from the UIConfig blocks in HybridToo.c
    var PREVIEW_GEOMETRY = {
        emery: {"xOffset": 4, "yOffset": 4, "yOffsetBattery": 10, "yOffsetDate": 2, "yOffsetPercent": 11, "second_hand_a": 94, "second_hand_b": 6, "hour_hand_a": 22, "min_hand_a": 9, "min_hand_b": 28, "fg_radius": 74, "tick_inset_outer": -4, "time_font_size": 54, "info_font_size": 30, "other_text_font_size": 20, "Line45yOffset": 2, "Line3yOffset": 6, "corner_radius_majortickrect": 20, "corner_radius_minortickrect": 28, "majortickrect_w": 86, "majortickrect_h": 100, "minortickrect_w": 90, "minortickrect_h": 104, "corner_radius_foreground": 16, "foregroundrect_x": 36, "foregroundrect_y": 36, "foregroundrect_w": 128, "foregroundrect_h": 156, "corner_radius_secondshand": 24, "hourhandwidth": 9, "hour_hand_a_round": 12, "min_hand_a_round": 2, "min_hand_b_round": 17, "second_hand_a_round": 0, "second_hand_b_round": 28, "tick_inset_inner_round": 18, "tick_inset_outer_round": 2, "minor_tick_inset_round": 15, "BTxOffset": 33, "QTxOffset": 101, "BTQTRectWidth": 30, "BTIconYOffset": -61, "QTIconYOffset": -61, "UVDayValueRect": [57, 97, 25, 25], "uv_arc_bounds": [51, 98, 37, 37], "uv_arc_bounds_max": [49, 96, 41, 41], "uv_arc_bounds_now": [46, 93, 47, 47], "uv_icon": [74, 124, 45, 20], "RainDayValueRect": [118, 110, 25, 25], "Rain1hValueRect": [118, 97, 25, 25], "Rain_arc_bounds": [112, 98, 37, 37], "Rain_arc_bounds_max": [110, 96, 41, 41], "Rain_arc_bounds_now": [107, 93, 47, 47], "Rain_icon": [81, 95, 45, 20]},
        gabbro: {"xOffset": 4, "yOffset": 5, "yOffsetBattery": 12, "yOffsetDate": 3, "yOffsetPercent": 13, "second_hand_a": 6, "second_hand_b": 40, "hour_hand_a": 106, "min_hand_a": 122, "min_hand_b": 98, "fg_radius": 90, "tick_inset_inner": 15, "tick_inset_outer": 6, "minor_tick_inset": 7, "time_font_size": 66, "info_font_size": 36, "other_text_font_size": 24, "Line45yOffset": 2, "Line3yOffset": 6, "hourhandwidth": 9, "BTxOffset": 51, "QTxOffset": 116, "BTQTRectWidth": 30, "BTIconYOffset": -73, "QTIconYOffset": -73, "UVDayValueRect": [86, 111, 25, 25], "uv_arc_bounds": [80, 112, 37, 37], "uv_arc_bounds_max": [78, 110, 41, 41], "uv_arc_bounds_now": [75, 107, 47, 47], "uv_icon": [76, 145, 45, 20], "RainDayValueRect": [151, 123, 25, 25], "Rain1hValueRect": [151, 110, 25, 25], "Rain_arc_bounds": [145, 112, 37, 37], "Rain_arc_bounds_max": [143, 110, 41, 41], "Rain_arc_bounds_now": [140, 107, 47, 47], "Rain_icon": [141, 145, 45, 20]},
        round: {"xOffset": 4, "yOffset": 3, "yOffsetBattery": 9, "yOffsetDate": 1, "yOffsetPercent": 10, "second_hand_a": 3, "second_hand_b": 28, "hour_hand_a": 72, "min_hand_a": 85, "min_hand_b": 69, "fg_radius": 62, "tick_inset_inner": 10, "tick_inset_outer": 3, "minor_tick_inset": 4, "time_font_size": 46, "info_font_size": 24, "other_text_font_size": 16, "Line45yOffset": 0, "Line3yOffset": 4, "hourhandwidth": 7, "BTxOffset": 34, "QTxOffset": 81, "BTQTRectWidth": 30, "BTIconYOffset": -48, "QTIconYOffset": -48, "UVDayValueRect": [57, 78, 20, 14], "uv_arc_bounds": [55, 79, 24, 24], "uv_arc_bounds_max": [53, 77, 28, 28], "uv_arc_bounds_now": [50, 74, 34, 34], "uv_icon": [64, 97, 45, 20], "RainDayValueRect": [105, 81, 20, 14], "Rain_arc_bounds": [102, 79, 24, 24], "Rain_arc_bounds_max": [100, 77, 28, 28], "Rain_arc_bounds_now": [97, 74, 34, 34], "Rain_icon": [69, 74, 45, 20]},
        rect: {"xOffset": 4, "yOffset": 2, "yOffsetBattery": 8, "yOffsetDate": 1, "yOffsetPercent": 9, "second_hand_a": 0, "second_hand_b": 6, "hour_hand_a": 16, "min_hand_a": 4, "min_hand_b": 18, "fg_radius": 54, "tick_inset_outer": -4, "time_font_size": 39, "info_font_size": 20, "other_text_font_size": 14, "Line45yOffset": 1, "Line3yOffset": 5, "corner_radius_majortickrect": 15, "corner_radius_minortickrect": 21, "majortickrect_w": 62, "majortickrect_h": 72, "minortickrect_w": 66, "minortickrect_h": 76, "corner_radius_foreground": 12, "foregroundrect_x": 26, "foregroundrect_y": 26, "foregroundrect_w": 92, "foregroundrect_h": 116, "corner_radius_secondshand": 18, "hourhandwidth": 7, "hour_hand_a_round": 8, "min_hand_a_round": 2, "min_hand_b_round": 12, "second_hand_a_round": 0, "second_hand_b_round": 20, "tick_inset_inner_round": 14, "tick_inset_outer_round": 2, "minor_tick_inset_round": 11, "BTxOffset": 23, "QTxOffset": 73, "BTQTRectWidth": 30, "BTIconYOffset": -43, "QTIconYOffset": -43, "UVDayValueRect": [38, 74, 20, 14], "uv_arc_bounds": [37, 75, 24, 24], "uv_arc_bounds_max": [35, 73, 28, 28], "uv_arc_bounds_now": [32, 70, 34, 34], "uv_icon": [47, 89, 45, 20], "RainDayValueRect": [87, 77, 20, 14], "Rain_arc_bounds": [84, 75, 24, 24], "Rain_arc_bounds_max": [82, 73, 28, 28], "Rain_arc_bounds_now": [79, 70, 34, 34], "Rain_icon": [51, 71, 45, 20]}
    };

    // ---- Colours ----
    // Sunlight-corrected palette (developer.rebble.io): raw hex -> how it looks on the watch
    var SUNLIGHT_CORRECTED = {
        "000000": "000000", "000055": "001E41", "0000AA": "004387", "0000FF": "0068CA", "005500": "2B4A2C",
        "005555": "27514F", "0055AA": "16638D", "0055FF": "007DCE", "00AA00": "5E9860", "00AA55": "5C9B72",
        "00AAAA": "57A5A2", "00AAFF": "4CB4DB", "00FF00": "8EE391", "00FF55": "8EE69E", "00FFAA": "8AEBC0",
        "00FFFF": "84F5F1", "550000": "4A161B", "550055": "482748", "5500AA": "40488A", "5500FF": "2F6BCC",
        "555500": "564E36", "555555": "545454", "5555AA": "4F6790", "5555FF": "4180D0", "55AA00": "759A64",
        "55AA55": "759D76", "55AAAA": "71A6A4", "55AAFF": "69B5DD", "55FF00": "9EE594", "55FF55": "9DE7A0",
        "55FFAA": "9BECC2", "55FFFF": "95F6F2", "AA0000": "99353F", "AA0055": "983E5A", "AA00AA": "955694",
        "AA00FF": "8F74D2", "AA5500": "9D5B4D", "AA5555": "9D6064", "AA55AA": "9A7099", "AA55FF": "9587D5",
        "AAAA00": "AFA072", "AAAA55": "AEA382", "AAAAAA": "ABABAB", "AAAAFF": "A7BAE2", "AAFF00": "C9E89D",
        "AAFF55": "C9EAA7", "AAFFAA": "C7F0C8", "AAFFFF": "C3F9F7", "FF0000": "E35462", "FF0055": "E25874",
        "FF00AA": "E16AA3", "FF00FF": "DE83DC", "FF5500": "E66E6B", "FF5555": "E6727C", "FF55AA": "E37FA7",
        "FF55FF": "E194DF", "FFAA00": "F1AA86", "FFAA55": "F1AD93", "FFAAAA": "EFB5B8", "FFAAFF": "ECC3EB",
        "FFFF00": "FFEEAB", "FFFF55": "FFF1B5", "FFFFAA": "FFF6D3", "FFFFFF": "FFFFFF"
    };
    var applySunlightCorrection = function(hex) {
        if (!hex) return hex;
        var corrected = SUNLIGHT_CORRECTED[String(hex).replace('#', '').toUpperCase()];
        return corrected ? ('#' + corrected) : hex;
    };

    // Preset themes from prv_inbox_received_handler() in HybridToo.c.
    // shadow = shadow colour with Shadow on (otherwise the background is used).
    var PREVIEW_THEMES = [
        // 0 White
        { bg: "#FFFFFF", shadow: "#AAAAAA", text: "#FFFFFF", major: "#000000", minor: "#555555", hours: "#00AA55", hoursBorder: "#00AA55", mins: "#FF0000", minsBorder: "#FF0000", seconds: "#00AA55", line: "#555555", fg: "#000000", uvArc: "#AAAAAA", uvMax: "#FFFFFF", uvNow: "#FF0000" },
        // 1 Black
        { bg: "#000000", shadow: "#555555", text: "#FFFFFF", major: "#FFFFFF", minor: "#AAAAAA", hours: "#FF0000", hoursBorder: "#FF0000", mins: "#00FF00", minsBorder: "#00FF00", seconds: "#FF0000", line: "#555555", fg: "#000000", uvArc: "#AAAAAA", uvMax: "#FFFFFF", uvNow: "#FF0000" },
        // 2 Blue
        { bg: "#0000AA", shadow: "#000055", text: "#FFFFFF", major: "#FFFF55", minor: "#FFFF55", hours: "#FFAA00", hoursBorder: "#FFAA00", mins: "#FFFFFF", minsBorder: "#FFFFFF", seconds: "#FFAA00", line: "#FFFF55", fg: "#0000AA", uvArc: "#AAAAAA", uvMax: "#FFFFFF", uvNow: "#FF0000" },
        // 3 Purple
        { bg: "#AA00AA", shadow: "#550055", text: "#FFFFFF", major: "#000000", minor: "#000000", hours: "#000000", hoursBorder: "#000000", mins: "#000000", minsBorder: "#000000", seconds: "#000000", line: "#FFFFFF", fg: "#000000", uvArc: "#AAAAAA", uvMax: "#FFFFFF", uvNow: "#FF0000" },
        // 4 Black & Green
        { bg: "#000000", shadow: "#005500", text: "#000000", major: "#55FF00", minor: "#55FF00", hours: "#FFFFAA", hoursBorder: "#FFFFAA", mins: "#55FF00", minsBorder: "#55FF00", seconds: "#FFFFAA", line: "#000000", fg: "#55FF00", uvArc: "#555555", uvMax: "#000000", uvNow: "#FFFFFF" }
    ];
    var PREVIEW_BW_THEMES = [
        // 0 White
        { bg: "#FFFFFF", text: "#FFFFFF", major: "#000000", minor: "#000000", hours: "#FFFFFF", hoursBorder: "#000000", mins: "#FFFFFF", minsBorder: "#000000", seconds: "#000000", line: "#AAAAAA", fg: "#000000", uvArc: "#AAAAAA", uvMax: "#FFFFFF", uvNow: "#FFFFFF" },
        // 1 Black
        { bg: "#000000", text: "#000000", major: "#FFFFFF", minor: "#FFFFFF", hours: "#000000", hoursBorder: "#FFFFFF", mins: "#000000", minsBorder: "#FFFFFF", seconds: "#FFFFFF", line: "#555555", fg: "#FFFFFF", uvArc: "#555555", uvMax: "#000000", uvNow: "#000000" },
        // 2 Grey
        { bg: "#AAAAAA", text: "#000000", major: "#FFFFFF", minor: "#FFFFFF", hours: "#FFFFFF", hoursBorder: "#000000", mins: "#FFFFFF", minsBorder: "#000000", seconds: "#000000", line: "#000000", fg: "#FFFFFF", uvArc: "#555555", uvMax: "#000000", uvNow: "#000000" }
    ];

    var parseClayColor = function(value, fallback) {
        if (value === undefined || value === null || value === '') return fallback;
        var hex = (typeof value === 'number') ? value.toString(16) : String(value).replace(/^#|^0x/i, '');
        while (hex.length < 6) hex = '0' + hex;
        if (hex.length > 6) hex = hex.slice(-6);
        if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;
        return '#' + hex.toUpperCase();
    };

    var getVal = function(key, fallback) {
        var item = config.getItemByMessageKey(key);
        if (!item) return fallback;
        var v = item.get();
        return (v === undefined || v === null || v === '') ? fallback : v;
    };
    var getIntVal = function(key, fallback) {
        var v = parseInt(getVal(key, fallback), 10);
        return isNaN(v) ? fallback : v;
    };
    var getBoolVal = function(key, fallback) {
        var item = config.getItemByMessageKey(key);
        if (!item) return fallback;
        return !!item.get();
    };
    var getColourVal = function(key, fallback) {
        return parseClayColor(getVal(key), fallback);
    };

    // The colours the watch would use for the current settings
    var resolvePreviewColours = function(bw) {
        var c, theme;
        if (bw) {
            var bwTheme = getIntVal("BWThemeSelect", 0);
            theme = PREVIEW_BW_THEMES[bwTheme];
            if (theme) {
                c = JSON.parse(JSON.stringify(theme));
            } else {
                var ticks = getColourVal("TickColor", "#000000");
                c = {
                    bg: getColourVal("BackgroundColor1", "#FFFFFF"),
                    text: getColourVal("TextColor1", "#FFFFFF"),
                    major: ticks, minor: ticks,
                    hours: getColourVal("HoursHandColor", "#FFFFFF"),
                    hoursBorder: getColourVal("HoursHandBorderColor", "#000000"),
                    mins: getColourVal("MinutesHandColor", "#FFFFFF"),
                    minsBorder: getColourVal("MinutesHandBorderColor", "#000000"),
                    seconds: getColourVal("SecondsHandColor", "#000000"),
                    line: getColourVal("LineColor", "#555555"),
                    fg: getColourVal("FGColor", "#000000"),
                    uvArc: getColourVal("UVArcColor", "#AAAAAA"),
                    uvMax: getColourVal("UVMaxColor", "#FFFFFF"),
                    uvNow: getColourVal("UVNowColor", "#555555")
                };
            }
            c.shadow = null;     // no shadows on B&W watches
            c.btqt = c.text;     // B&W: icons follow the text colour
            return c;
        }

        var shadowOn = getBoolVal("ShadowOn", true);
        theme = PREVIEW_THEMES[getIntVal("ThemeSelect", 0)];
        if (theme) {
            c = JSON.parse(JSON.stringify(theme));
            c.shadow = shadowOn ? theme.shadow : theme.bg;
            c.btqt = c.text;     // preset themes: icons follow the text colour
        } else {
            c = {
                bg: getColourVal("BackgroundColor1", "#000000"),
                text: getColourVal("TextColor1", "#000000"),
                major: getColourVal("MajorTickColor", "#FFFFFF"),
                minor: getColourVal("MinorTickColor", "#FFFFFF"),
                hours: getColourVal("HoursHandColor", "#00AA55"),
                hoursBorder: getColourVal("HoursHandBorderColor", "#00AA55"),
                mins: getColourVal("MinutesHandColor", "#FF0000"),
                minsBorder: getColourVal("MinutesHandBorderColor", "#FF0000"),
                seconds: getColourVal("SecondsHandColor", "#00AA55"),
                line: getColourVal("LineColor", "#555555"),
                fg: getColourVal("FGColor", "#FFFFFF"),
                uvArc: getColourVal("UVArcColor", "#AAAAAA"),
                uvMax: getColourVal("UVMaxColor", "#FFFFFF"),
                uvNow: getColourVal("UVNowColor", "#555555")
            };
            c.shadow = shadowOn ? getColourVal("ShadowColor", "#AAAAAA") : c.bg;
            c.btqt = getColourVal("BTQTColor", "#000000");
        }
        for (var key in c) {
            if (c.hasOwnProperty(key)) c[key] = applySunlightCorrection(c[key]);
        }
        return c;
    };

    // Clay puts the connected watch on config.meta.activeWatchInfo; "Preview watch model"
    // overrides it when that's missing or wrong.
    var getPreviewScreen = function() {
        var overrideVal = getVal("PreviewPlatformOverride", "auto");
        if (overrideVal !== "auto" && PREVIEW_SCREENS[overrideVal]) return PREVIEW_SCREENS[overrideVal];
        var info = config.meta && config.meta.activeWatchInfo;
        var platform = info && info.platform;
        return PREVIEW_SCREENS[platform] || PREVIEW_SCREENS.basalt;
    };

    // ---- Sample values ----
    var PREVIEW_WEEKDAYS = {
        "es_ES": ["DOM", "LUN", "MAR", "MI\u00c9", "JUE", "VIE", "S\u00c1B"],
        en: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"],
        "de_DE": ["SON", "MON", "DIE", "MIT", "DON", "FRE", "SAM"],
        "fr_FR": ["DIM", "LUN", "MAR", "MER", "JEU", "VEN", "SAM"],
        "pt_PT": ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "S\u00c1B"],
        "it_IT": ["DOM", "LUN", "MAR", "MER", "GIO", "VEN", "SAB"],
        "sv_SE": ["S\u00d6N", "M\u00c5N", "TIS", "ONS", "TOR", "FRE", "L\u00d6R"],
        "nl_NL": ["ZO.", "MA.", "DI.", "WO.", "DO.", "VR.", "ZA."],
        "da_DK": ["S\u00d8N.", "MAN.", "TIR.", "ONS.", "TOR.", "FRE.", "L\u00d8R."],
        "no_NO": ["S\u00d8N.", "MAN.", "TIR.", "ONS.", "TOR.", "FRE.", "L\u00d8R."],
        "fi_FI": ["SU", "MA", "TI", "KE", "TO", "PE", "LA"]
    };
    var PREVIEW_MONTHS = {
        "es_ES": ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"],
        en: ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"],
        "de_DE": ["JAN", "FEB", "M\u00c4R", "APR", "MAI", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEZ"],
        "fr_FR": ["JAN", "F\u00c9V", "MAR", "AVR", "MAI", "JUN", "JUL", "AO\u00db", "SEP", "OCT", "NOV", "D\u00c9C"],
        "pt_PT": ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"],
        "it_IT": ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"],
        "sv_SE": ["JAN", "FEB", "MAR", "APR", "MAJ", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEC"],
        "nl_NL": ["JAN.", "FEB.", "MRT.", "APR.", "MEI", "JUN.", "JUL.", "AUG.", "SEP.", "OKT.", "NOV.", "DEC."],
        "da_DK": ["JAN.", "FEB.", "MAR.", "APR.", "MAJ", "JUN.", "JUL.", "AUG.", "SEP.", "OKT.", "NOV.", "DEC."],
        "no_NO": ["JAN.", "FEB.", "MAR.", "APR.", "MAI", "JUN.", "JUL.", "AUG.", "SEP.", "OKT.", "NOV.", "DES."],
        "fi_FI": ["TAMMI.", "HELMI.", "MAALIS.", "HUHTI.", "TOUKO.", "KES\u00c4.", "HEIN\u00c4.", "ELO.", "SYYS.", "LOKA.", "MARRAS.", "JOULU."]
    };
    var PREVIEW_SAMPLE = { hour: 9, minute: 34, second: 7, weekday: 3, month: 8, day: 30,
                           battery: 80, tempC: 21, steps: "8,532" };

    // 12h/24h for the preview: the "12h/24h Time Preview" setting, or for "auto" (or no
    // choice yet) the phone's own time format - watches normally follow the phone.
    var previewUses24h = function() {
        var choice = getVal("PreviewTimeFormatOverride", "auto");
        if (choice === "24h") return true;
        if (choice === "12h") return false;
        try {
            var opts = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
            if (typeof opts.hour12 === 'boolean') return !opts.hour12;
            if (opts.hourCycle) return opts.hourCycle === 'h23' || opts.hourCycle === 'h24';
        } catch (e) { /* older WebViews */ }
        return true;
    };

    // Like fetchwday()/fetchmonth(): exact locale match, otherwise English.
    // "Automatic" on the watch is its system language; here the phone's language stands in.
    var previewDateParts = function(languageSetting) {
        var lang = languageSetting;
        if (!lang || lang === "auto") {
            lang = ((typeof navigator !== 'undefined' && navigator.language) || "en_US").replace("-", "_");
        }
        var weekdays = PREVIEW_WEEKDAYS[lang] || PREVIEW_WEEKDAYS.en;
        var months = PREVIEW_MONTHS[lang] || PREVIEW_MONTHS.en;
        return { weekday: weekdays[PREVIEW_SAMPLE.weekday], month: months[PREVIEW_SAMPLE.month],
                 day: (PREVIEW_SAMPLE.day < 10 ? "0" : "") + PREVIEW_SAMPLE.day };
    };

    // ---- Maths: ports of the integer routines in MathUtils.c ----
    var TRIG_MAX_ANGLE = 0x10000;
    var TRIG_MAX_RATIO = 0xffff;
    var itrunc = function(v) { return v < 0 ? Math.ceil(v) : Math.floor(v); };
    var idiv = function(a, b) { return itrunc(a / b); };
    var degToTrig = function(deg) { return itrunc(deg * TRIG_MAX_ANGLE / 360); };
    var sinLookup = function(trig) { return Math.round(Math.sin(2 * Math.PI * trig / TRIG_MAX_ANGLE) * TRIG_MAX_RATIO); };
    var cosLookup = function(trig) { return Math.round(Math.cos(2 * Math.PI * trig / TRIG_MAX_ANGLE) * TRIG_MAX_RATIO); };

    var isqrt = function(n) {
        n = n >>> 0;
        if (n === 0) return 0;
        var root = 0, bit = 1 << 30;
        while (bit > n) bit >>>= 2;
        while (bit !== 0) {
            if (n >= root + bit) { n -= root + bit; root += 2 * bit; }
            root >>>= 1;
            bit >>>= 2;
        }
        return root >>> 0;
    };

    // polar_to_point_offset(): degrees, 0 = 3 o'clock, clockwise
    var polarPoint = function(o, deg, distance) {
        var trig = degToTrig(deg);
        return { x: o.x + itrunc(distance * cosLookup(trig) / TRIG_MAX_ANGLE),
                 y: o.y + itrunc(distance * sinLookup(trig) / TRIG_MAX_ANGLE) };
    };

    // angle_to_rect_edge() on the full screen
    var rayRectEdge = function(o, deg, w, h) {
        var trig = degToTrig(deg);
        var dx = cosLookup(trig), dy = sinLookup(trig);
        var t = 2147483647, v;
        if (dx > 0) { v = itrunc(((w - 1 - o.x) * TRIG_MAX_RATIO) / dx); if (v < t) t = v; }
        else if (dx < 0) { v = itrunc(((0 - o.x) * TRIG_MAX_RATIO) / dx); if (v < t) t = v; }
        if (dy > 0) { v = itrunc(((h - 1 - o.y) * TRIG_MAX_RATIO) / dy); if (v < t) t = v; }
        else if (dy < 0) { v = itrunc(((0 - o.y) * TRIG_MAX_RATIO) / dy); if (v < t) t = v; }
        return { x: o.x + itrunc(dx * t / TRIG_MAX_RATIO), y: o.y + itrunc(dy * t / TRIG_MAX_RATIO) };
    };

    // point_from_edge(): `inset` px in from the screen edge along the ray
    var pointFromEdge = function(o, deg, w, h, inset) {
        var e = rayRectEdge(o, deg, w, h);
        var trig = degToTrig(deg);
        return { x: e.x - itrunc(cosLookup(trig) * inset / TRIG_MAX_RATIO),
                 y: e.y - itrunc(sinLookup(trig) * inset / TRIG_MAX_RATIO) };
    };

    // angle_to_rounded_rect_edge()
    var rayRoundedRect = function(o, deg, halfW, halfH, r) {
        var trig = degToTrig(deg);
        var dx16 = (cosLookup(trig) + 32) >> 6;
        var dy16 = (sinLookup(trig) + 32) >> 6;
        var ratio = TRIG_MAX_RATIO >> 6;
        var t = 2147483647, v;
        if (dx16 > 0) { v = itrunc((halfW - 1) * ratio / dx16); if (v < t) t = v; }
        else if (dx16 < 0) { v = itrunc((-halfW) * ratio / dx16); if (v < t) t = v; }
        if (dy16 > 0) { v = itrunc((halfH - 1) * ratio / dy16); if (v < t) t = v; }
        else if (dy16 < 0) { v = itrunc((-halfH) * ratio / dy16); if (v < t) t = v; }
        var px = itrunc((dx16 * t + idiv(ratio, 2)) / ratio);
        var py = itrunc((dy16 * t + idiv(ratio, 2)) / ratio);
        var innerW = halfW - r, innerH = halfH - r;
        if ((px > innerW || px < -innerW) && (py > innerH || py < -innerH)) {
            var ccx = px > 0 ? innerW : -innerW;
            var ccy = py > 0 ? innerH : -innerH;
            var ex = px - ccx, ey = py - ccy;
            var len16 = isqrt((ex << 4) * (ex << 4) + (ey << 4) * (ey << 4));
            if (len16 > 0) {
                px = ccx + itrunc((ex * r * 16 + idiv(len16, 2)) / len16);
                py = ccy + itrunc((ey * r * 16 + idiv(len16, 2)) / len16);
            }
        }
        return { x: o.x + px, y: o.y + py };
    };

    // ---- Everything the preview needs, read from the settings on the page ----
    var getPreviewModel = function() {
        var screen = getPreviewScreen();
        return {
            screen: screen,
            g: PREVIEW_GEOMETRY[screen.geom],
            w: screen.w,
            h: screen.h,
            bw: screen.bw,
            round: screen.round,
            fctx: screen.fctx,
            aplite: !!screen.aplite,
            // ForegroundShape only exists on rectangular watches: on = round, off = rectangular
            roundFg: screen.round || getBoolVal("ForegroundShape", false),
            showTime: getBoolVal("ShowTime", true),
            showAmPm: getBoolVal("showlocalAMPM", true),
            addZero12h: getBoolVal("AddZero12h", false),
            removeZero24h: getBoolVal("RemoveZero24h", false),
            is24h: previewUses24h(),
            topRow: getIntVal("TopRow", 0),
            dateLanguage: getVal("DateLanguage", "auto"),
            left: getIntVal("BottomLeft", SLOT_TEXT),
            right: getIntVal("BottomRight", SLOT_BATT_VALUE),
            leftText: getVal("LogoText", "HYBRID"),
            rightText: getVal("LogoTextRight", "HYBRID"),
            fahrenheit: getBoolVal("WeatherUnit", false),
            lines: getBoolVal("EnableLines", true),
            majorTicks: getBoolVal("EnableMajorTick", true),
            minorTicks: getBoolVal("EnableMinorTick", true),
            seconds: getBoolVal("EnableSecondsHand", true),
            c: resolvePreviewColours(screen.bw)
        };
    };

    // -----------------------------------------------------------------
    // Painting: mirrors bg_update_proc, hour_min_hands_canvas_update_proc,
    // layer_update_proc_seconds_hand and fg_update_proc in HybridToo.c
    // -----------------------------------------------------------------
    var paintPreview = function(ctx, m) {
        var w = m.w, h = m.h, g = m.g, c = m.c;
        var o = { x: idiv(w, 2), y: idiv(h, 2) };
        var cx = o.x, cy = o.y;                       //cx is centre x, cy is centre y on the screen
        var circular = m.round || m.roundFg;          // hands/ticks follow a circle
        var shadowsOn = !m.bw && circular;            // the watch only draws shadows in that case

        // ---- primitives ----
        // Pebble draws wide lines with round ends; 1px lines sit on pixel centres
        var line = function(a, b, width, colour) {
            var off = width === 1 ? 0.5 : 0;
            ctx.beginPath();
            ctx.moveTo(a.x + off, a.y + off);
            ctx.lineTo(b.x + off, b.y + off);
            ctx.lineWidth = width;
            ctx.lineCap = width > 1 ? 'round' : 'butt';
            ctx.strokeStyle = colour;
            ctx.stroke();
        };
        var disc = function(p, radius, colour) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius + 0.5, 0, Math.PI * 2);
            ctx.fillStyle = colour;
            ctx.fill();
        };
        var roundRectPath = function(x, y, rw, rh, r) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + rw - r, y);
            ctx.arcTo(x + rw, y, x + rw, y + r, r);
            ctx.lineTo(x + rw, y + rh - r);
            ctx.arcTo(x + rw, y + rh, x + rw - r, y + rh, r);
            ctx.lineTo(x + r, y + rh);
            ctx.arcTo(x, y + rh, x, y + rh - r, r);
            ctx.lineTo(x, y + r);
            ctx.arcTo(x, y, x + r, y, r);
            ctx.closePath();
        };
        var shift2 = function(p) { return { x: p.x + 2, y: p.y + 2 }; };

        // fctx-style DIN text: em height in px, anchored "top" / "middle" / "bottom"
        var dinFont = function(em) { return em + "px " + DIN_FAMILY; };
        var dinWidth = function(text, em) { ctx.font = dinFont(em); return ctx.measureText(text).width; };
        var dinText = function(text, x, y, em, colour, align, anchor) {
            ctx.font = dinFont(em);
            ctx.fillStyle = colour;
            ctx.textAlign = align;
            ctx.textBaseline = 'alphabetic';
            var dy = 0;
            if (anchor === "top") dy = (1 - DIN_DESCENT) * em;
            else if (anchor === "middle") dy = (DIN_ASCENT - DIN_DESCENT) / 2 * em;
            else if (anchor === "bottom") dy = -DIN_DESCENT * em;
            ctx.fillText(text, x, y + dy);
        };
        // graphics_draw_text-style text with a stand-in for Gothic: `top` is the text box's top
        var gothicFont = function(size) { return Math.round(size * GOTHIC_SCALE) + "px " + GOTHIC_FAMILY; };
        var gothicWidth = function(text, size) { ctx.font = gothicFont(size); return ctx.measureText(text).width; };
        var gothicHeight = function(size) { return Math.round(size * 1.1); };
        var gothicText = function(text, x, top, size, colour, align) {
            ctx.font = gothicFont(size);
            ctx.fillStyle = colour;
            ctx.textAlign = align;
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(text, x, top + size * 0.8);
        };
        var batteryIcon = function(x, top, align) {
            var size = m.screen.icon;
            var glyph = PREVIEW_SAMPLE.battery <= 10 ? "t" : PREVIEW_SAMPLE.battery < 50 ? "v" :
                        PREVIEW_SAMPLE.battery < 90 ? "w" : "u";
            ctx.font = size + "px '" + PREVIEW_FONT_ICONS + "', sans-serif";
            ctx.fillStyle = c.text;
            ctx.textAlign = align;
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(glyph, x, top + DRIP_ASCENT * size);
        };

        // Width available to bottom-slot text (fg_half_width_at / slot_available_width)
        var fgHalfWidthAt = function(dy) {
            if (dy < 0) dy = -dy;
            if (!circular) {
                var halfW = idiv(g.foregroundrect_w, 2), halfH = idiv(g.foregroundrect_h, 2);
                var cr = g.corner_radius_foreground;
                if (dy >= halfH) return 0;
                var straight = halfH - cr;
                if (dy <= straight) return halfW;
                var ey = dy - straight;
                return halfW - cr + isqrt(cr * cr - ey * ey);
            }
            if (dy >= g.fg_radius) return 0;
            return isqrt(g.fg_radius * g.fg_radius - dy * dy);
        };
        var availableWidth = function(topY, bottomY, innerX) {
            var dy = Math.max(Math.abs(topY - cy), Math.abs(bottomY - cy));
            return Math.max(0, fgHalfWidthAt(dy) - innerX - 1 /* SLOT_TEXT_MARGIN */);
        };
        // Drop characters off the end until measure(text) fits (utf8_drop_last)
        var clipToWidth = function(text, avail, measure) {
            var chars = Array.from ? Array.from(text) : text.split('');
            while (chars.length && measure(chars.join('')) > avail) {
                chars.pop();
                while (chars.length && chars[chars.length - 1] === ' ') chars.pop();
            }
            return chars.join('');
        };

        var slotText = function(slot, right) {
            if (slot === SLOT_STEPS) return m.aplite && !m.fctx ? null : PREVIEW_SAMPLE.steps;
            if (slot === SLOT_TEXT) return (right ? m.rightText : m.leftText) || "HYBRID";
            if (slot === SLOT_TEMP) {
                var t = m.fahrenheit ? Math.round(PREVIEW_SAMPLE.tempC * 9 / 5 + 32) : PREVIEW_SAMPLE.tempC;
                return t + "\u00B0";
            }
            return null;
        };

        ctx.save();
        if (m.round) {
            ctx.beginPath();
            ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
            ctx.clip();
        }

        // ---- 1. Background and ticks (bg_update_proc) ----
        ctx.fillStyle = c.bg;
        ctx.fillRect(0, 0, w, h);

        var trigDir = function(deg) { var t = degToTrig(deg); return { dx: cosLookup(t), dy: sinLookup(t) }; };
        var rectTickOuter = function(deg) {
            var e = rayRectEdge(o, deg, w, h), d = trigDir(deg);
            return { x: e.x - itrunc(d.dx * g.tick_inset_outer / TRIG_MAX_ANGLE),
                     y: e.y - itrunc(d.dy * g.tick_inset_outer / TRIG_MAX_ANGLE) };
        };

        if (m.minorTicks) {
            for (var i = 0; i < 60; i++) {
                if (i % 5 === 0) continue;
                var a = i * 6;
                if (m.round) {
                    disc(polarPoint(o, a, idiv(h, 2) - g.minor_tick_inset), 1, c.minor);
                } else if (m.roundFg) {
                    disc(polarPoint(o, a, idiv(h, 2) - g.minor_tick_inset_round), 1, c.minor);
                } else {
                    line(rayRoundedRect(o, a, g.minortickrect_w, g.minortickrect_h, g.corner_radius_minortickrect),
                         rectTickOuter(a), 1, c.minor);
                }
            }
        }
        if (m.majorTicks) {
            for (var j = 0; j < 12; j++) {
                var b = j * 30 - 90;
                var p1, p2;
                if (m.round) {
                    p1 = polarPoint(o, b, idiv(h, 2) - g.tick_inset_inner);
                    p2 = polarPoint(o, b, idiv(h, 2) - g.tick_inset_outer);
                } else if (m.roundFg) {
                    p1 = polarPoint(o, b, idiv(h, 2) - g.tick_inset_inner_round);
                    p2 = polarPoint(o, b, idiv(h, 2) - g.tick_inset_outer_round);
                } else {
                    p2 = rectTickOuter(b);
                    p1 = rayRoundedRect(o, b, g.majortickrect_w, g.majortickrect_h, g.corner_radius_majortickrect);
                }
                line(p1, p2, 3, c.major);
            }
        }

        // ---- 2. Centre shadow, hour and minute hands ----
        if (shadowsOn) disc(shift2(o), g.fg_radius, c.shadow);

        var S = PREVIEW_SAMPLE;
        var hourAngle = itrunc(S.hour / 12 * 360 + S.minute / 60 * 360 / 12 - 90);
        var minuteAngle = itrunc(S.minute / 60 * 360 - 90);
        var halfW = idiv(w, 2), halfH = idiv(h, 2);

        (function() {   // hour hand
            var len = m.round ? g.hour_hand_a : (m.roundFg ? halfW - g.hour_hand_a_round : g.hour_hand_a);
            var tip = circular ? polarPoint(o, hourAngle, len) : pointFromEdge(o, hourAngle, w, h, len);
            if (shadowsOn) line(shift2(o), shift2(tip), 9, c.shadow);
            line(o, tip, g.hourhandwidth, c.hoursBorder);
            line(o, tip, g.hourhandwidth - 6, c.hours);
        })();

        (function() {   // minute hand
            var p1, p2;
            if (m.round) {
                p1 = polarPoint(o, minuteAngle, g.min_hand_b);
                p2 = polarPoint(o, minuteAngle, g.min_hand_a);
            } else if (m.roundFg) {
                p1 = polarPoint(o, minuteAngle, halfW - g.min_hand_b_round);
                p2 = polarPoint(o, minuteAngle, halfW - g.min_hand_a_round);
            } else {
                p1 = rayRoundedRect(o, minuteAngle, halfW - g.min_hand_b, halfH - g.min_hand_b, g.corner_radius_foreground);
                p2 = pointFromEdge(o, minuteAngle, w, h, g.min_hand_a);
            }
            if (shadowsOn) line(shift2(p1), shift2(p2), g.hourhandwidth - 2, c.shadow);
            line(p1, p2, g.hourhandwidth - 2, c.minsBorder);
            line(p1, p2, g.hourhandwidth - 6, c.mins);
        })();

        // ---- 3. Seconds hand ----
        if (m.seconds) {
            var secAngle = itrunc(S.second / 60 * 360 - 90);
            var s1, s2;
            if (circular) {
                var aRound = m.round ? g.second_hand_a : g.second_hand_a_round;
                var bRound = m.round ? g.second_hand_b : g.second_hand_b_round;
                s1 = polarPoint(o, secAngle, halfW - bRound);
                s2 = polarPoint(o, secAngle, halfW - aRound);
            } else {
                s1 = rayRoundedRect(o, secAngle, halfW - g.second_hand_b, halfH - g.second_hand_b, g.corner_radius_secondshand);
                s2 = pointFromEdge(o, secAngle, w, h, halfW - g.second_hand_b);
            }
            if (shadowsOn) line(shift2(s1), shift2(s2), 2, c.shadow);
            line(s1, s2, 2, c.seconds);
        }

        // ---- 4. Foreground (fg_update_proc) ----
        if (circular) {
            disc(o, g.fg_radius, c.fg);
            ctx.beginPath();
            ctx.arc(o.x, o.y, g.fg_radius, 0, Math.PI * 2);
            ctx.lineWidth = 2;
            ctx.strokeStyle = c.seconds;
            ctx.stroke();
        } else {
            roundRectPath(g.foregroundrect_x, g.foregroundrect_y, g.foregroundrect_w, g.foregroundrect_h, g.corner_radius_foreground);
            ctx.fillStyle = c.fg;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = c.seconds;
            ctx.stroke();
        }

        // Time text (sample 09:34)
        var hourdraw = m.is24h ? S.hour : (S.hour % 12 || 12);
        var hourStr = m.is24h ? (m.removeZero24h ? String(hourdraw) : ("0" + hourdraw).slice(-2))
                              : (m.addZero12h ? ("0" + hourdraw).slice(-2) : String(hourdraw));
        var timeStr = hourStr + ":" + ("0" + S.minute).slice(-2);
        var ampmStr = S.hour < 12 ? "AM" : "PM";
        var drawAmPm = m.showAmPm && !m.is24h;
        var ampmAffectsCentre = drawAmPm && (hourdraw > 9 || m.addZero12h);

        // Date row (sample Wed 30 Sep)
        var parts = previewDateParts(m.dateLanguage);
        var leftWord = m.topRow === 1 ? parts.month : parts.weekday;
        var rightWord = m.topRow === 1 ? parts.weekday : parts.month;
        var showDate = m.topRow !== 2;

        if (m.fctx) {
            // ---- Emery / Gabbro: fctx with DIN ----
            if (m.showTime) {
                var timeW = dinWidth(timeStr, g.time_font_size);
                var ampmW = ampmAffectsCentre ? dinWidth(ampmStr, g.other_text_font_size) + 2 : 0;
                var leftEdge = w / 2 - (timeW + ampmW) / 2;
                // The watch's fctx DIN font has its ':' moved up to sit centred on the digits.
                // In the stock DIN the colon's dots centre at 0.2125 em and the digits at 0.356 em,
                // so the colon is drawn separately, raised by the difference.
                var COLON_RAISE_EM = 0.356 - 0.2125;
                var colonAt = timeStr.indexOf(':');
                var timeY = (h / 2) - 2;
                if (colonAt === -1) {
                    dinText(timeStr, leftEdge, timeY, g.time_font_size, c.text, 'left', 'middle');
                } else {
                    var hoursPart = timeStr.slice(0, colonAt);
                    var minutesPart = timeStr.slice(colonAt + 1);
                    var hoursW = dinWidth(hoursPart, g.time_font_size);
                    var colonW = dinWidth(":", g.time_font_size);
                    dinText(hoursPart, leftEdge, timeY, g.time_font_size, c.text, 'left', 'middle');
                    dinText(":", leftEdge + hoursW, timeY - COLON_RAISE_EM * g.time_font_size,
                            g.time_font_size, c.text, 'left', 'middle');
                    dinText(minutesPart, leftEdge + hoursW + colonW, timeY, g.time_font_size, c.text, 'left', 'middle');
                }
                if (drawAmPm) dinText(ampmStr, leftEdge + timeW + 2, h / 2 + 1, g.other_text_font_size, c.text, 'left', 'middle');
            }
            if (showDate) {
                var rowY = h / 2 - g.other_text_font_size - g.yOffset;
                dinText(leftWord, w * 0.42 - g.xOffset, rowY, g.other_text_font_size, c.text, 'right', 'bottom');
                dinText(rightWord, w * 0.58 + g.xOffset, rowY, g.other_text_font_size, c.text, 'left', 'bottom');
                dinText(parts.day, w / 2, h / 2 - g.other_text_font_size - g.yOffsetDate, g.info_font_size, c.text, 'center', 'bottom');
            }

            var fctxSlot = function(slot, right) {
                var anchorX = right ? cx + g.xOffset : cx - g.xOffset;
                var textY = h / 2 + g.other_text_font_size + g.yOffsetPercent;
                if (slot === SLOT_BATT_VALUE) {
                    var num = String(PREVIEW_SAMPLE.battery);
                    var numW = dinWidth(num, g.info_font_size);
                    var pctW = dinWidth("%", g.other_text_font_size);
                    var startX = right ? anchorX : anchorX - numW - pctW;
                    dinText(num, startX, h / 2 + g.other_text_font_size + g.yOffsetBattery, g.info_font_size, c.text, 'left', 'top');
                    dinText("%", startX + numW, textY, g.other_text_font_size, c.text, 'left', 'top');
                    return;
                }
                if (slot === SLOT_BATT_ICON) {
                    var iconY = h / 2 + g.other_text_font_size + g.yOffsetPercent - 3;
                    batteryIcon(right ? cx + g.xOffset : cx - g.xOffset, iconY, right ? 'left' : 'right');
                    return;
                }
                var text = slotText(slot, right);
                if (!text) return;
                var em = slot === SLOT_TEMP ? g.info_font_size : g.other_text_font_size;
                var top = idiv(h, 2) + g.other_text_font_size + g.yOffsetPercent;
                var avail = availableWidth(top, top + idiv(em * 3, 4), g.xOffset);
                text = clipToWidth(text, avail, function(t) { return dinWidth(t, em); });
                dinText(text, anchorX, textY, em, c.text, right ? 'left' : 'right', 'top');
            };
            fctxSlot(m.left, false);
            fctxSlot(m.right, true);
        } else {
            // ---- Other watches: DIN for the time, Gothic for the rest ----
            var small = m.screen.gothicSmall, medium = m.screen.gothicMedium;
            if (m.showTime) {
                var nugdetimey = 2;
                var px = m.screen.dinTime;
                var tW = dinWidth(timeStr, px);
                var tH = Math.round((DIN_ASCENT + DIN_DESCENT) * px);
                var aW = drawAmPm ? gothicWidth(ampmStr, small) + 2 : 0;
                var total = tW + (ampmAffectsCentre ? aW : 0);
                var left = cx - total / 2;
                var timeY = cy + nugdetimey - idiv(tH, 2);
                var timeTop = timeY - (m.round ? 4 : 3);
                ctx.font = dinFont(px);
                ctx.fillStyle = c.text;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(timeStr, left, timeTop + DIN_ASCENT * px);
                if (drawAmPm) gothicText(ampmStr, left + tW + 2, timeY - (nugdetimey*3) + tH - (m.round ? 31 : 17), small, c.text, 'left');
            }
            if (showDate) {
                var nugdedatey = 2;
                var dateY = cy  - g.other_text_font_size - g.yOffset - 14 - 3 + nugdedatey;
                var xo = m.round ? g.xOffset + 3 : g.xOffset;
                gothicText(leftWord, -11 + cx - xo, dateY, small, c.text, 'right');
                gothicText(rightWord, cx + xo + 11, dateY, small, c.text, 'left');
                gothicText(parts.day, w / 2, dateY - 10 + nugdedatey, medium, c.text, 'center');
            }

            var systemSlot = function(slot, right) {
                if (slot === SLOT_BATT_ICON) {
                    //var nugdeicony = 2;
                    var iconY = cy  + g.other_text_font_size + g.yOffsetPercent - 3;
                    batteryIcon(right ? cx + g.xOffset - 1 : cx - g.xOffset + 1, iconY, right ? 'left' : 'right');
                    return;
                }
                if (slot === SLOT_BATT_VALUE) {
                    var nugdebatteryvaluey = 8;
                    var num = String(PREVIEW_SAMPLE.battery);
                    var numW = gothicWidth(num, medium), pctW = gothicWidth("%", small);
                    var totalW = numW + 2 + pctW;
                    var shift = m.round ? 22 : 19;
                    var battLeft = right ? cx - totalW / 2 + shift : cx - totalW / 2 - shift;
                    var battY = cy  + g.other_text_font_size + g.yOffsetBattery - 8 ;
                    gothicText(num, battLeft, battY + nugdebatteryvaluey, medium, c.text, 'left');
                    gothicText("%", battLeft + numW + 2, battY + gothicHeight(medium) - gothicHeight(small) - 5 + nugdebatteryvaluey/2, small, c.text, 'left');
                    return;
                }
                var text = slotText(slot, right);
                if (!text) return;
                var isTemp = slot === SLOT_TEMP;
                var nugdetexty = 8;
                var size = isTemp ? medium : small;
                // rowY is where the watch puts this text (draw_slot_system). The width check uses
                // that row, as the watch does; the nudge only moves the preview's drawing to line
                // up with the stand-in font, so it mustn't shrink the space (which clipped the °).
                var rowY = isTemp ? cy  + g.other_text_font_size + g.yOffsetBattery - 8
                                  : cy  + g.other_text_font_size + g.yOffsetPercent - 4;
                var textY = rowY + (isTemp ? nugdetexty : nugdetexty / 2);
                var avail = availableWidth(rowY, rowY + gothicHeight(size), g.xOffset - 1);
                text = clipToWidth(text, avail, function(t) { return gothicWidth(t, size); });
                gothicText(text, right ? cx + g.xOffset - 1 : cx - g.xOffset + 1, textY , size, c.text, right ? 'left' : 'right');
            };
            systemSlot(m.left, false);
            systemSlot(m.right, true);
        }

        // Foreground lines
        if (m.lines) {
            var halfTime = idiv(g.time_font_size, 2);
            line({ x: idiv(w, 4), y: cy + halfTime }, { x: idiv(w, 4) * 3, y: cy + halfTime }, 1, c.line);
            line({ x: idiv(w, 4), y: cy - halfTime + 4 }, { x: idiv(w, 4) * 3, y: cy - halfTime + 4 }, 1, c.line);
            line({ x: cx, y: cy + halfTime + g.Line3yOffset }, { x: cx, y: cy + (g.fg_radius - 6) }, 1, c.line);
            var x42 = itrunc(w * 0.42), x58 = itrunc(w * 0.58);
            line({ x: x42, y: cy - halfTime - g.Line45yOffset }, { x: x42, y: cy - (g.fg_radius - 10) }, 1, c.line);
            line({ x: x58, y: cy - halfTime - g.Line45yOffset }, { x: x58, y: cy - (g.fg_radius - 10) }, 1, c.line);
        }

        // Bluetooth-disconnected and Quiet Time icons (draw_btqt_icons). On the watch they
        // only appear when disconnected / in Quiet Time; the preview always shows both.
        (function() {
            var px = m.screen.btqtPx;
            ctx.font = px + "px '" + PREVIEW_FONT_ICONS + "', sans-serif";
            ctx.fillStyle = c.btqt;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            var baseX = idiv(w, 2) - g.fg_radius;
            ctx.fillText("z", baseX + g.BTxOffset, idiv(h, 2) + g.BTIconYOffset + DRIP_ASCENT * px);
            ctx.fillText("\uE061", baseX + g.QTxOffset, idiv(h, 2) + g.QTIconYOffset + DRIP_ASCENT * px);
        })();

        ctx.restore();
    };

    // -----------------------------------------------------------------
    // Canvas placement: each WATCH_PREVIEW text item in config.json is replaced
    // by a canvas (several, because position:sticky doesn't work in the
    // Pebble config WebView).
    // -----------------------------------------------------------------
    var previewInstances = [];

    var ensurePreviewCanvases = function() {
        getPreviewAnchorIds().forEach(function(id) {
            for (var j = 0; j < previewInstances.length; j++) {
                if (previewInstances[j].id === id) return;
            }
            // A text item's id isn't an HTML id: go through its $manipulatorTarget
            var anchor = config.getItemById(id);
            var container = anchor && anchor.$manipulatorTarget &&
                            (anchor.$manipulatorTarget[0] || anchor.$manipulatorTarget);
            if (!container || !container.parentNode) return;   // not on this page

            var wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.justifyContent = 'center';
            wrapper.style.padding = '12px 0';
            var canvas = document.createElement('canvas');
            canvas.style.height = 'auto';
            canvas.style.maxWidth = '100%';
            canvas.style.border = '1px solid #888';
            wrapper.appendChild(canvas);
            container.parentNode.replaceChild(wrapper, container);
            previewInstances.push({ id: id, canvas: canvas, ctx: canvas.getContext('2d') });
        });
        return previewInstances.length > 0;
    };

    var drawPreview = function() {
        // The preview is a nicety: if it goes wrong, log it and keep the page working
        try {
            if (!ensurePreviewCanvases()) return;
            var model = getPreviewModel();
            var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 2;
            var scale = Math.max(2, Math.min(3, Math.ceil(dpr)));
            previewInstances.forEach(function(inst) {
                inst.canvas.width = model.w * scale;
                inst.canvas.height = model.h * scale;
                inst.canvas.style.width = model.w + 'px';     // shown at the watch's own pixel size
                inst.canvas.style.borderRadius = model.round ? '50%' : '4px';
                inst.ctx.save();
                inst.ctx.scale(scale, scale);
                paintPreview(inst.ctx, model);
                inst.ctx.restore();
            });
        } catch (err) {
            console.error("Preview failed to draw:", err);
        }
    };

    // -----------------------------------------------------------------
    // Mini-preview: the UV and rain gauges from the third (shake) screen,
    // drawn like weather2_update_proc in HybridToo.c, cropped to just that
    // area. Sample: UV max 6 (now 4), 0-70% chance of rain (40% next hour),
    // 3.4 mm today, 0.4 mm next hour (Emery/Gabbro only). Not on aplite, which has no third screen.
    // -----------------------------------------------------------------
    var UV_RAIN_ANCHOR_IDS = ["UV_RAIN_PREVIEW", "BW_UV_RAIN_PREVIEW"];
    var UV_RAIN_SAMPLE = { uvMax: 6, uvNow: 4, uvDay: 6, popMin: 0, popMax: 70, popNow: 40, rainDay: 34, rain1h: 4 };
    var UV_RAIN_SCALE = 2;   // shown at twice the watch's pixel size, as it's small

    // graphics_fill_radial(): ring `inset` px thick inside `rect`, between two Pebble
    // angles (degrees, 0 = 12 o'clock, clockwise)
    var fillRadial = function(ctx, rect, inset, startDeg, endDeg, colour) {
        if (endDeg <= startDeg) return;
        var cxr = rect[0] + rect[2] / 2, cyr = rect[1] + rect[3] / 2;
        var r = Math.min(rect[2], rect[3]) / 2;
        var a0 = (startDeg - 90) * Math.PI / 180, a1 = (endDeg - 90) * Math.PI / 180;
        ctx.beginPath();
        ctx.arc(cxr, cyr, r, a0, a1, false);
        ctx.arc(cxr, cyr, Math.max(0, r - inset), a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = colour;
        ctx.fill();
    };

    var paintUvRain = function(ctx, m) {
        var g = m.g, c = m.c, sc = m.screen, S = UV_RAIN_SAMPLE;
        var START = 180 + 30, SWEEP = 360 - 60;

        // Gothic stand-in (as in the main preview) centred in a text box
        // nudgeY: extra px down (watch pixels) for a value that needs it
        var boxText = function(text, rect, size, nudgeY) {
            ctx.font = Math.round(size * GOTHIC_SCALE) + "px " + GOTHIC_FAMILY;
            ctx.fillStyle = c.text;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            // Baseline 0.8 em below the box top, plus half the digit height, to line the
            // numbers up with the gauges as on the watch
            var digitHeight = size * GOTHIC_SCALE * GOTHIC_CAP_HEIGHT;
            ctx.fillText(text, rect[0] + rect[2] / 2, rect[1] + size * 0.8 + digitHeight / 3 + (nudgeY || 0));
        };
        var iconText = function(glyph, rect) {
            var px = sc.wxIconPx;
            ctx.font = px + "px '" + PREVIEW_FONT_WEATHER + "', sans-serif";
            ctx.fillStyle = c.text;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(glyph, rect[0] + rect[2] / 2, rect[1] + WEATHER_ASCENT * px);
        };
        var rainText = function(tenths) {
            return tenths < 10 ? (idiv(tenths, 10) + "." + (tenths % 10)) : String(idiv(tenths + 5, 10));
        };

        // UV gauge
        fillRadial(ctx, g.uv_arc_bounds, 2, START, 360 + 180 - 30, c.uvArc);
        fillRadial(ctx, g.uv_arc_bounds_max, 4, START, START + idiv(SWEEP * S.uvMax, 10), c.uvMax);
        var uvNowDeg = START + idiv(SWEEP * S.uvNow, 10);
        fillRadial(ctx, g.uv_arc_bounds_now, 8, uvNowDeg - 3, uvNowDeg + 3, c.uvNow);
        boxText(String(S.uvDay), g.UVDayValueRect, sc.wxSmallMedium);

        // Rain gauge
        fillRadial(ctx, g.Rain_arc_bounds, 2, START, 360 + 180 - 30, c.uvArc);
        fillRadial(ctx, g.Rain_arc_bounds_max, 4, START + idiv(SWEEP * S.popMin, 100), START + idiv(SWEEP * S.popMax, 100), c.uvMax);
        var rainNowDeg = START + idiv(SWEEP * S.popNow, 100);
        fillRadial(ctx, g.Rain_arc_bounds_now, 8, rainNowDeg - 3, rainNowDeg + 3, c.uvNow);
        boxText(rainText(S.rainDay), g.RainDayValueRect, sc.wxSmall, sc.fctx ? 2 : 0);   // 2px lower on Emery / Gabbro only
        if (sc.fctx) boxText(rainText(S.rain1h), g.Rain1hValueRect, sc.wxSmall);   // Emery / Gabbro only (SHOW_RAIN_1H)

        // Sun and umbrella icons
        iconText("\uF00D", g.uv_icon);
        iconText("\uF084", g.Rain_icon);
    };

    // The area to show: both gauges and their icons, plus a margin
    var uvRainCrop = function(m) {
        var g = m.g;
        var rects = [g.uv_arc_bounds_now, g.Rain_arc_bounds_now, g.uv_icon, g.Rain_icon];
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        rects.forEach(function(r) {
            x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]);
            x1 = Math.max(x1, r[0] + r[2]); y1 = Math.max(y1, r[1] + r[3]);
        });
        var pad = 6;
        x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
        x1 = Math.min(m.w, x1 + pad); y1 = Math.min(m.h, y1 + pad);
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    };

    var uvRainInstances = [];

    var ensureUvRainCanvases = function() {
        UV_RAIN_ANCHOR_IDS.forEach(function(id) {
            for (var j = 0; j < uvRainInstances.length; j++) {
                if (uvRainInstances[j].id === id) return;
            }
            var anchor = config.getItemById(id);
            var container = anchor && anchor.$manipulatorTarget &&
                            (anchor.$manipulatorTarget[0] || anchor.$manipulatorTarget);
            if (!container || !container.parentNode) return;
            var wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.justifyContent = 'center';
            wrapper.style.padding = '8px 0';
            var canvas = document.createElement('canvas');
            canvas.style.height = 'auto';
            canvas.style.maxWidth = '100%';
            canvas.style.border = '1px solid #888';
            canvas.style.borderRadius = '6px';
            wrapper.appendChild(canvas);
            container.parentNode.replaceChild(wrapper, container);
            uvRainInstances.push({ id: id, wrapper: wrapper, canvas: canvas, ctx: canvas.getContext('2d') });
        });
        return uvRainInstances.length > 0;
    };

    var drawUvRainPreview = function() {
        try {
            if (!ensureUvRainCanvases()) return;
            var model = getPreviewModel();
            var crop = uvRainCrop(model);
            var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 2;
            var scale = Math.max(2, Math.min(3, Math.ceil(dpr))) * UV_RAIN_SCALE;
            uvRainInstances.forEach(function(inst) {
                // aplite has no third screen
                inst.wrapper.style.display = model.aplite ? 'none' : 'flex';
                if (model.aplite) return;
                inst.canvas.width = crop.w * scale;
                inst.canvas.height = crop.h * scale;
                inst.canvas.style.width = (crop.w * UV_RAIN_SCALE) + 'px';
                var ctx = inst.ctx;
                ctx.save();
                ctx.scale(scale, scale);
                ctx.translate(-crop.x, -crop.y);
                ctx.fillStyle = model.c.fg;            // the gauges sit on the foreground
                ctx.fillRect(crop.x, crop.y, crop.w, crop.h);
                paintUvRain(ctx, model);
                ctx.restore();
            });
        } catch (err) {
            console.error("UV/rain preview failed to draw:", err);
        }
    };

    // Every setting that visibly affects the front screen
    var PREVIEW_WATCHED_KEYS = [
        "PreviewPlatformOverride", "PreviewTimeFormatOverride", "ForegroundShape", "ShowTime", "showlocalAMPM", "AddZero12h",
        "RemoveZero24h", "TopRow", "DateLanguage", "BottomLeft", "BottomRight",
        "LogoText", "LogoTextRight", "WeatherUnit", "EnableLines", "EnableMajorTick",
        "EnableMinorTick", "EnableSecondsHand", "ShadowOn", "ThemeSelect", "BWThemeSelect",
        "BackgroundColor1", "FGColor", "LineColor", "TextColor1", "ShadowColor", "MajorTickColor",
        "MinorTickColor", "TickColor", "HoursHandBorderColor", "HoursHandColor",
        "MinutesHandBorderColor", "MinutesHandColor", "SecondsHandColor", "BTQTColor",
        "UVArcColor", "UVMaxColor", "UVNowColor"
    ];

    var drawAllPreviews = function() {
        drawPreview();
        drawUvRainPreview();
    };

    var initPreview = function() {
        PREVIEW_WATCHED_KEYS.forEach(function(key) {
            itemsForKey(key).forEach(function(item) {
                item.on('change', drawAllPreviews);
            });
        });
        // Custom text: redraw on every keystroke, not just when the box loses focus
        ["LogoText", "LogoTextRight"].forEach(function(key) {
            itemsForKey(key).forEach(function(item) {
                var el = item.$manipulatorTarget && (item.$manipulatorTarget[0] || item.$manipulatorTarget);
                if (el && el.addEventListener) el.addEventListener('input', drawPreview);
            });
        });
        // Draw straight away with stand-in fonts, then again once the embedded fonts load
        drawAllPreviews();
        loadPreviewFonts().then(drawAllPreviews);
    };

    config.on(config.EVENTS.AFTER_BUILD, function() {
        initLocationSearch();

        VISIBILITY_RULES.forEach(function(rule) {
            // Only one of the colour / B&W sections is built for a given watch, and both
            // share keys like BackgroundColor1 - so a rule whose main control (the first
            // one listed, e.g. its theme dropdown) isn't on this page must not touch anything.
            if (!config.getItemByMessageKey(rule.controls[0])) return;

            rule.controls.forEach(function(key) {
                var control = config.getItemByMessageKey(key);
                if (control) {
                    control.on('change', function() { applyRule(rule); });
                }
            });
            applyRule(rule); // set the initial state from the saved settings
        });

        initPreview();
    });
};