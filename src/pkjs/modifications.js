/////// Modifies the behaviour of the Clay settings page for Hybrid Weather.
//
// Clay serialises this whole function into the config page, so it must be
// self-contained: no require(), and nothing from outside this function.

module.exports = function(minified) {
    var config = this;

    // Bottom slot dropdown values (must match config.json and SlotOption in HybridToo.h)
    var SLOT_TEXT = 1;
    var SLOT_TEMP = 2;

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
        return getInt("HealthLogoWeather") === SLOT_TEMP ||
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
            controls: ["HealthLogoWeather"],
            visible: function() { return getInt("HealthLogoWeather") === SLOT_TEXT; },
            keys: ["LogoText"]
        },
        {
            controls: ["BottomRight"],
            visible: function() { return getInt("BottomRight") === SLOT_TEXT; },
            keys: ["LogoTextRight"]
        },
        {
            controls: ["HealthLogoWeather", "BottomRight", "ShakeWeather"],
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
            ids: ["CUSTOM_COLOURS_HEADING"],
            keys: ["BackgroundColor1", "FGColor", "LineColor", "TextColor1", "BTQTColor",
                   "ShadowColor", "MajorTickColor", "MinorTickColor",
                   "HoursHandBorderColor", "HoursHandColor",
                   "MinutesHandBorderColor", "MinutesHandColor", "SecondsHandColor",
                   "UVArcColor", "UVMaxColor", "UVNowColor"]
        },
        {
            // B&W watches: same, for the B&W theme list
            controls: ["BWThemeSelect"],
            visible: function() { return getInt("BWThemeSelect") === BW_THEME_CUSTOM; },
            ids: ["BW_CUSTOM_COLOURS_HEADING"],
            keys: ["BackgroundColor1", "FGColor", "LineColor", "TextColor1", "TickColor",
                   "HoursHandBorderColor", "HoursHandColor",
                   "MinutesHandBorderColor", "MinutesHandColor", "SecondsHandColor",
                   "UVArcColor", "UVMaxColor", "UVNowColor"]
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
    var LOCATION_DEBOUNCE_MS = 200;
    var LOCATION_TIMEOUT_MS = 8000;
    var LOCATION_MAX_SUGGESTIONS = 8;

    var locationSuggestionBox = null;
    var locationDebounceTimer = null;
    var locationRequestSeq = 0;        // stops an older, slower request overwriting a newer one
    var locationCache = {};            // query (lower case) -> matches, so retyping is instant
    var lastLocationMatches = [];      // what the list is showing now
    var selectedLocationDisplay = "";  // text of the last suggestion picked (or restored from a save)
    var locationEventsWired = false;

    var getInputElement = function(item) {
        return item.$manipulatorTarget[0] || item.$manipulatorTarget;
    };

    var SUGGESTION_BOX_CSS = 'position:absolute;top:100%;left:0;right:0;z-index:1000;list-style:none;' +
        'margin:0;padding:0;background:#fff;color:#222;border:1px solid #ccc;' +
        'max-height:200px;overflow-y:auto;display:none';
    var SUGGESTION_ROW_CSS = 'padding:6px 8px;cursor:pointer;color:#222;background:#fff';

    // A hidden suggestion list positioned directly under the input
    var createSuggestionBox = function(inputElement) {
        var parent = inputElement.parentNode;
        parent.style.position = 'relative';
        var box = document.createElement('ul');
        box.className = 'location-suggestions';
        box.style.cssText = SUGGESTION_BOX_CSS;
        parent.insertBefore(box, inputElement.nextSibling);
        return box;
    };

    var hideLocationSuggestions = function() {
        if (locationSuggestionBox) locationSuggestionBox.style.display = 'none';
    };

    // matches: array of { display, lat, lon }
    var showLocationSuggestions = function(matches, inputElement, item, latItem, longItem) {
        if (!locationSuggestionBox) locationSuggestionBox = createSuggestionBox(inputElement);
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
            // mousedown (not click) fires before the input's blur handler,
            // so the choice is stored before the blur-time check runs
            li.addEventListener('mousedown', function(e) {
                e.preventDefault();
                inputElement.value = match.display;
                item.set(match.display);
                latItem.set(String(match.lat));
                longItem.set(String(match.lon));
                selectedLocationDisplay = match.display;
                hideLocationSuggestions();
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

    // ---- Two place-search services, asked in parallel ----
    // Photon (OpenStreetMap data) is thorough but its free public server is
    // sometimes slow to answer. Open-Meteo's geocoder (GeoNames data) is
    // usually much quicker. Both are asked at once and whichever answers
    // first with results fills the list.

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
        var url = 'https://photon.komoot.io/api/' +
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
                var name = props.name || props.city || props.street || 'Unknown';
                var region = props.state || '';
                var country = props.country || '';
                matches.push({
                    display: buildLocationDisplay(name, region, country),
                    name: name, region: region, country: country,
                    county: props.county || props.district || '',
                    lat: lat, lon: lon
                });
            }
            return matches;
        });
    };

    var searchOpenMeteo = function(query) {
        var url = 'https://geocoding-api.open-meteo.com/v1/search' +
            '?name=' + encodeURIComponent(query) +
            '&count=' + LOCATION_MAX_SUGGESTIONS +
            '&language=en&format=json';
        return requestMatches(url, function(json) {
            var results = json.results || [];
            var matches = [];
            for (var i = 0; i < results.length; i++) {
                var r = results[i];
                var lat = parseFloat(r.latitude);
                var lon = parseFloat(r.longitude);
                if (isNaN(lat) || isNaN(lon)) continue;
                var name = r.name || 'Unknown';
                var region = r.admin1 || '';
                var country = r.country || '';
                matches.push({
                    display: buildLocationDisplay(name, region, country),
                    name: name, region: region, country: country,
                    county: r.admin2 || '',
                    lat: lat, lon: lon
                });
            }
            return matches;
        });
    };

    // Resolves with an array of matches, or null if this search was superseded
    // or both services failed - in which case the list on screen is left as it is.
    var geocodeLocation = function(query) {
        var thisRequestSeq = ++locationRequestSeq;
        var cacheKey = query.toLowerCase();

        if (locationCache[cacheKey]) {
            return Promise.resolve(locationCache[cacheKey]);
        }

        // Only the newest search matters: drop anything still in flight
        abortLocationRequests();

        return new Promise(function(resolve) {
            var pending = 2;
            var settled = false;
            var anyAnswer = false;   // at least one service replied (even with no matches)

            var settle = function(result) {
                if (settled) return;
                settled = true;
                abortLocationRequests();   // the slower service's answer is no longer needed
                if (thisRequestSeq !== locationRequestSeq) { resolve(null); return; } // stale
                if (result) {
                    result = disambiguateLocationMatches(result);
                    locationCache[cacheKey] = result;
                    hideLocationDebug();
                }
                resolve(result);
            };

            var onAnswer = function(matches) {
                pending--;
                if (matches) anyAnswer = true;
                if (matches && matches.length) {
                    settle(matches);                 // first service with results wins
                } else if (pending === 0) {
                    if (!anyAnswer && thisRequestSeq === locationRequestSeq) {
                        updateLocationDebug("Location search isn't responding - check your connection and try again.");
                    }
                    settle(anyAnswer ? [] : null);   // both empty -> "no matches"; both failed -> leave list
                }
            };

            searchOpenMeteo(query).then(onAnswer);
            searchPhoton(query).then(onAnswer);
        });
    };

    // Open connections to both services the first time the box is focused, so
    // the first real search doesn't also pay for DNS and TLS setup.
    var locationWarmedUp = false;
    var warmUpLocationSearch = function() {
        if (locationWarmedUp) return;
        locationWarmedUp = true;
        try {
            var a = new XMLHttpRequest();
            a.open('GET', 'https://geocoding-api.open-meteo.com/v1/search?name=lo&count=1');
            a.send();
            var b = new XMLHttpRequest();
            b.open('GET', 'https://photon.komoot.io/api/?q=lo&limit=1');
            b.send();
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

        inputElement.addEventListener('blur', function() {
            // Delay so a suggestion's mousedown handler runs first
            setTimeout(function() {
                validateLocation(inputElement, item, latItem, longItem);
                hideLocationSuggestions();
            }, 150);
        });
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
    };

    config.on(config.EVENTS.AFTER_BUILD, function() {
        initLocationSearch();

        VISIBILITY_RULES.forEach(function(rule) {
            // Only one of the colour / B&W sections is built for a given watch, and both
            // share keys like BackgroundColor1 - so a rule whose dropdown isn't on this
            // page must not touch anything.
            var present = rule.controls.some(function(key) {
                return !!config.getItemByMessageKey(key);
            });
            if (!present) return;

            rule.controls.forEach(function(key) {
                var control = config.getItemByMessageKey(key);
                if (control) {
                    control.on('change', function() { applyRule(rule); });
                }
            });
            applyRule(rule); // set the initial state from the saved settings
        });
    });
};