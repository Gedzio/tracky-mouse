// Posture Monitor module for TrackyMouse.
// Self-contained: manages its own UI (HTML + event handlers), state, detection algorithm,
// and settings serialization. Exposed as `window.PostureMonitor`.
//
// API:
//   PostureMonitor.getHTML()                           → string  (injected into controls panel)
//   PostureMonitor.init({ container, setOptions })     → void    (call after HTML is in DOM)
//   PostureMonitor.update(facemeshPrediction, paused)  → void    (call every frame)
//   PostureMonitor.loadSettings(globalSettings)        → void    (forward from deserializeSettings)
//   PostureMonitor.getSettings()                       → object  (postureMonitor block for serializeSettings)
//
// Settings schema (owned by this module):
//   globalSettings.postureMonitor = {
//     enabled: boolean,
//     threshold: number (0..100 slider),
//     manualBaselineV3: { pitch, forward, faceWidth, eyesY } | null,
//     thresholdsV5:     { pitch:{low,high}, forward:{...}, faceSize:{...}, eyesY:{...} },
//     userDefaultsV5:   { thresholds, globalMultiplier } | null,
//   }

(function () {
	"use strict";

	// -------------------------------------------------------------------------
	// Configuration — defaults and fixed algorithm constants
	// -------------------------------------------------------------------------
	var POSTURE_BUILTIN_DEFAULTS = {
		thresholds: {
			pitch:    { low: -3,     high: 3     }, // degrees (scale-invariant)
			forward:  { low: -0.052, high: 0.052 }, // z-ratio / faceWidth
			faceSize: { low: -0.20,  high: 0.20  }, // fraction of baseline faceWidth
			eyesY:    { low: -0.35,  high: 0.35  }, // Δ eyesY / current faceWidth
		},
		globalMultiplier: 50,
	};
	var POSTURE_HOLD_MS = 1000;            // bad must persist this long before alarm fires
	var POSTURE_BEEP_INTERVAL_MS = 500;    // repeat beep every N ms while bad
	var POSTURE_DEBUG_WINDOW_MS = 60000;   // debug buffer rolling window

	// -------------------------------------------------------------------------
	// State (module-level closure — a single monitor instance per page)
	// -------------------------------------------------------------------------
	var container = null;
	var setOptionsFn = function () { };

	var postureEnabled = true;
	var postureThreshold = 50; // 0..100 slider; 50 = 1.0× multiplier for all thresholds
	var postureEMA = { pitch: null, forward: null, faceWidth: null, eyesY: null };
	var postureThresholds = cloneThresholds(POSTURE_BUILTIN_DEFAULTS.thresholds);
	var postureUserDefaults = null;
	var postureBaseline = null;
	var postureManualBaseline = null;
	var postureLastAlertAt = 0;
	var postureAboveSince = 0;
	var postureAudioCtx = null;
	var postureDebugBuffer = [];
	var postureLatestSnapshot = null;
	var postureLabeledSamples = [];
	var postureSnoozeMinutes = 3;     // persisted default
	var postureSnoozeUntil = 0;       // ephemeral: performance.now() timestamp when snooze ends

	// DOM refs, filled by init()
	var els = {
		checkbox: null,
		slider: null,
		light: null,
		statusText: null,
		baselineValue: null,
		calibrateBtn: null,
		resetBtn: null,
		debugBtn: null,
		markGoodBtn: null,
		markBadBtn: null,
		markCount: null,
		saveDefaultsBtn: null,
		restoreDefaultsBtn: null,
		snoozeInput: null,
		snoozeBtn: null,
		metrics: {}, // keyed by "pitch" | "forward" | "facesize" | "headpos" | "shoulder"
	};

	// -------------------------------------------------------------------------
	// Helpers
	// -------------------------------------------------------------------------
	function cloneThresholds(t) {
		return {
			pitch:    { low: t.pitch.low,    high: t.pitch.high    },
			forward:  { low: t.forward.low,  high: t.forward.high  },
			faceSize: { low: t.faceSize.low, high: t.faceSize.high },
			eyesY:    { low: t.eyesY.low,    high: t.eyesY.high    },
		};
	}
	function avgPoints(points) {
		var x = 0, y = 0, z = 0, n = points.length;
		for (var i = 0; i < n; i++) {
			x += points[i][0];
			y += points[i][1];
			z += points[i][2];
		}
		return [x / n, y / n, z / n];
	}
	function fmtDelta(v, digits, unit) {
		unit = unit || "";
		return (v >= 0 ? "+" : "") + v.toFixed(digits) + unit;
	}
	function scheduleBeep(ctx) {
		var t0 = ctx.currentTime;
		var osc = ctx.createOscillator();
		var gain = ctx.createGain();
		osc.type = "sine";
		osc.frequency.setValueAtTime(660, t0);
		osc.frequency.setValueAtTime(440, t0 + 0.12);
		gain.gain.setValueAtTime(0.0001, t0);
		gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
		osc.connect(gain).connect(ctx.destination);
		osc.start(t0);
		osc.stop(t0 + 0.3);
	}
	function postureBeep() {
		try {
			if (!postureAudioCtx) {
				postureAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
			}
			// Chromium may suspend the AudioContext when the window is minimized/backgrounded.
			// resume() is asynchronous — if we schedule immediately, osc.start(currentTime) can
			// land "in the past" (since currentTime was frozen during suspend) and the beep is
			// dropped. Wait for resume to complete before scheduling.
			if (postureAudioCtx.state !== "running" && typeof postureAudioCtx.resume === "function") {
				postureAudioCtx.resume().then(function () {
					scheduleBeep(postureAudioCtx);
				}).catch(function () { /* ignore */ });
			} else {
				scheduleBeep(postureAudioCtx);
			}
		} catch (e) { /* ignore */ }
	}

	// -------------------------------------------------------------------------
	// UI helpers
	// -------------------------------------------------------------------------
	function buildMetricEl(metric) {
		var root = container.querySelector('.tracky-mouse-posture-metric[data-metric="' + metric + '"]');
		if (!root) return { root: null };
		return {
			root:      root,
			mark:      root.querySelector('.tracky-mouse-posture-metric-mark'),
			value:     root.querySelector('.tracky-mouse-posture-metric-value'),
			bar:       root.querySelector('.tracky-mouse-posture-bar'),
			zoneLow:   root.querySelector('.tracky-mouse-posture-bar-low'),
			zoneOk:    root.querySelector('.tracky-mouse-posture-bar-ok'),
			zoneHigh:  root.querySelector('.tracky-mouse-posture-bar-high'),
			marker:    root.querySelector('.tracky-mouse-posture-bar-marker'),
			inputLow:  root.querySelector('.tracky-mouse-posture-thr-low'),
			inputHigh: root.querySelector('.tracky-mouse-posture-thr-high'),
		};
	}

	function setMetric(metric, ok, displayValue, delta, thr) {
		var el = els.metrics[metric];
		if (!el || !el.root) return;
		el.mark.textContent = ok === null ? "–" : (ok ? "V" : "X");
		el.root.dataset.state = ok === null ? "idle" : (ok ? "ok" : "bad");
		el.value.textContent = displayValue != null ? displayValue : "–";
		if (el.bar && thr) {
			var range = Number(el.root.dataset.range);
			var clampedDelta = Math.max(-range, Math.min(range, delta || 0));
			var markerPct = ((clampedDelta + range) / (2 * range)) * 100;
			el.marker.style.left = markerPct + "%";
			el.marker.dataset.state = ok === false ? "bad" : "ok";
			var lowPct  = Math.max(0, Math.min(100, ((Math.max(-range, thr.low)  + range) / (2 * range)) * 100));
			var highPct = Math.max(0, Math.min(100, ((Math.min( range, thr.high) + range) / (2 * range)) * 100));
			el.zoneLow.style.left = "0%";
			el.zoneLow.style.width = lowPct + "%";
			el.zoneOk.style.left = lowPct + "%";
			el.zoneOk.style.width = (highPct - lowPct) + "%";
			el.zoneHigh.style.left = highPct + "%";
			el.zoneHigh.style.width = (100 - highPct) + "%";
		}
	}

	function setLight(state, text) {
		els.light.dataset.state = state;
		els.statusText.textContent = text;
	}

	// Threshold input <-> stored value (facesize & headpos are in % for UI, fraction in storage)
	function thrInputToValue(metric, inputVal) {
		return (metric === "facesize" || metric === "headpos") ? (inputVal / 100) : inputVal;
	}
	function thrValueToInput(metric, val) {
		return (metric === "facesize" || metric === "headpos") ? (val * 100) : val;
	}
	var METRIC_TO_STORAGE = { pitch: "pitch", forward: "forward", facesize: "faceSize", headpos: "eyesY" };

	function populateThrInputs() {
		Object.keys(METRIC_TO_STORAGE).forEach(function (m) {
			var el = els.metrics[m];
			if (!el || !el.inputLow) return;
			var storeKey = METRIC_TO_STORAGE[m];
			el.inputLow.value  = thrValueToInput(m, postureThresholds[storeKey].low);
			el.inputHigh.value = thrValueToInput(m, postureThresholds[storeKey].high);
		});
	}
	function wireThrInputs() {
		Object.keys(METRIC_TO_STORAGE).forEach(function (m) {
			var el = els.metrics[m];
			if (!el || !el.inputLow) return;
			var storeKey = METRIC_TO_STORAGE[m];
			var onChange = function () {
				var lo = parseFloat(el.inputLow.value);
				var hi = parseFloat(el.inputHigh.value);
				if (isNaN(lo) || isNaN(hi)) return;
				if (lo > hi) { var t = lo; lo = hi; hi = t; }
				postureThresholds[storeKey].low  = thrInputToValue(m, lo);
				postureThresholds[storeKey].high = thrInputToValue(m, hi);
				saveSettings();
			};
			el.inputLow.onchange = onChange;
			el.inputHigh.onchange = onChange;
		});
	}

	function isSnoozed() {
		return postureSnoozeUntil > 0 && performance.now() < postureSnoozeUntil;
	}
	function formatMmSs(ms) {
		var s = Math.max(0, Math.ceil(ms / 1000));
		var m = Math.floor(s / 60);
		var r = s % 60;
		return m + ":" + (r < 10 ? "0" + r : r);
	}
	function updateSnoozeButton() {
		if (!els.snoozeBtn) return;
		if (isSnoozed()) {
			var remaining = postureSnoozeUntil - performance.now();
			els.snoozeBtn.textContent = "Cancel (" + formatMmSs(remaining) + ")";
			els.snoozeBtn.dataset.active = "true";
		} else {
			els.snoozeBtn.textContent = "Snooze";
			delete els.snoozeBtn.dataset.active;
			// Auto-clear expired snooze to avoid stale state
			if (postureSnoozeUntil > 0 && performance.now() >= postureSnoozeUntil) {
				postureSnoozeUntil = 0;
			}
		}
	}
	function updateMarkCount() {
		var good = postureLabeledSamples.filter(function (s) { return s.label === "good"; }).length;
		var bad  = postureLabeledSamples.filter(function (s) { return s.label === "bad";  }).length;
		els.markCount.textContent = "good: " + good + " / bad: " + bad;
	}
	function captureLabeled(label, btn, originalText) {
		if (!postureLatestSnapshot) {
			btn.textContent = "No face yet";
			setTimeout(function () { btn.textContent = originalText; }, 1500);
			return;
		}
		postureLabeledSamples.push(Object.assign({ label: label }, postureLatestSnapshot));
		updateMarkCount();
		btn.textContent = "Captured!";
		setTimeout(function () { btn.textContent = originalText; }, 600);
	}

	// -------------------------------------------------------------------------
	// Settings IO
	// -------------------------------------------------------------------------
	function saveSettings() {
		setOptionsFn({ globalSettings: { postureMonitor: getSettingsPayload() } });
	}
	function getSettingsPayload() {
		return {
			enabled: postureEnabled,
			threshold: postureThreshold,
			manualBaselineV3: postureManualBaseline,
			thresholdsV5: postureThresholds,
			userDefaultsV5: postureUserDefaults,
			snoozeMinutes: postureSnoozeMinutes,
		};
	}

	// -------------------------------------------------------------------------
	// Detection algorithm — per-frame update
	// -------------------------------------------------------------------------
	function detect(prediction /* isPaused arg kept for call-site compat but ignored: posture is independent from mouse tracking */) {
		if (!prediction || !prediction.annotations) {
			postureEMA.pitch = null;
			postureEMA.forward = null;
			postureEMA.faceWidth = null;
			postureEMA.eyesY = null;
			postureAboveSince = 0;
			setMetric("pitch",    null, "–", 0, postureThresholds.pitch);
			setMetric("forward",  null, "–", 0, postureThresholds.forward);
			setMetric("facesize", null, "–", 0, postureThresholds.faceSize);
			setMetric("headpos",  null, "–", 0, postureThresholds.eyesY);
			setMetric("shoulder", null, "Not yet available");
			setLight("idle", "Waiting for face...");
			if (els.baselineValue && !postureManualBaseline) {
				els.baselineValue.textContent = "not set — click \"Use current as neutral\"";
			}
			return;
		}
		if ((prediction.faceInViewConfidence || 0) < 0.85) {
			return; // low confidence – freeze UI
		}
		var ann = prediction.annotations;
		var eyes = ann.midwayBetweenEyes && ann.midwayBetweenEyes[0];
		var nose = ann.noseTip && ann.noseTip[0];
		var lips = ann.lipsLowerOuter && ann.lipsLowerOuter.length ? avgPoints(ann.lipsLowerOuter) : null;
		var lCheek = ann.leftCheek && ann.leftCheek[0];
		var rCheek = ann.rightCheek && ann.rightCheek[0];
		if (!eyes || !nose || !lips || !lCheek || !rCheek) return;

		var dy = lips[1] - eyes[1];
		var dz = lips[2] - eyes[2];
		var pitchDeg = Math.atan2(dz, dy) * 180 / Math.PI;
		var faceWidth = Math.hypot(lCheek[0] - rCheek[0], lCheek[1] - rCheek[1]) || 1;
		var forward = (eyes[2] - nose[2]) / faceWidth;
		var eyesY = eyes[1];

		var a = 0.18;
		function ema(prev, cur) { return prev == null ? cur : (prev * (1 - a) + cur * a); }
		postureEMA.pitch     = ema(postureEMA.pitch, pitchDeg);
		postureEMA.forward   = ema(postureEMA.forward, forward);
		postureEMA.faceWidth = ema(postureEMA.faceWidth, faceWidth);
		postureEMA.eyesY     = ema(postureEMA.eyesY, eyesY);

		var now = performance.now();

		postureLatestSnapshot = {
			t: Math.round(now),
			pitchRaw: pitchDeg, forwardRaw: forward,
			pitchEMA: postureEMA.pitch, forwardEMA: postureEMA.forward,
			dy: dy, dz: dz, faceWidth: faceWidth,
			faceInViewConfidence: prediction.faceInViewConfidence,
			eyes:    { x: eyes[0],   y: eyes[1],   z: eyes[2]   },
			nose:    { x: nose[0],   y: nose[1],   z: nose[2]   },
			lips:    { x: lips[0],   y: lips[1],   z: lips[2]   },
			lCheek:  { x: lCheek[0], y: lCheek[1], z: lCheek[2] },
			rCheek:  { x: rCheek[0], y: rCheek[1], z: rCheek[2] },
		};

		postureDebugBuffer.push({
			t: Math.round(now),
			pitchRaw: pitchDeg, forwardRaw: forward,
			pitchEMA: postureEMA.pitch, forwardEMA: postureEMA.forward,
			faceWidth: faceWidth, eyesY: eyesY,
			dy: dy, dz: dz
		});
		var debugCutoff = now - POSTURE_DEBUG_WINDOW_MS;
		while (postureDebugBuffer.length && postureDebugBuffer[0].t < debugCutoff) postureDebugBuffer.shift();

		var haveBaseline = !!postureManualBaseline;
		if (haveBaseline) postureBaseline = postureManualBaseline;

		var sPitch    = haveBaseline ? (postureEMA.pitch     - postureBaseline.pitch)     : 0;
		var sForward  = haveBaseline ? (postureEMA.forward   - postureBaseline.forward)   : 0;
		var sFaceSize = haveBaseline ? (postureEMA.faceWidth - postureBaseline.faceWidth) / postureBaseline.faceWidth : 0;
		var sHeadPos  = haveBaseline ? (postureEMA.eyesY     - postureBaseline.eyesY) / (postureEMA.faceWidth || 1) : 0;

		var gm = Math.pow(2, (postureThreshold - 50) / 50);
		function scaledThr(m) {
			return { low: postureThresholds[m].low * gm, high: postureThresholds[m].high * gm };
		}
		var thrPitch    = scaledThr("pitch");
		var thrForward  = scaledThr("forward");
		var thrFaceSize = scaledThr("faceSize");
		var thrHeadPos  = scaledThr("eyesY");

		function outsideRange(v, t) { return v < t.low || v > t.high; }
		function relaxThr(t, mul)   { return { low: t.low * mul, high: t.high * mul }; }

		var state = els.light.dataset.state;
		var useRelax = (state === "bad" || state === "warn");
		var r = useRelax ? 1.5 : 1.0;

		var pitchBad    = outsideRange(sPitch,    relaxThr(thrPitch,    r));
		var forwardBad  = outsideRange(sForward,  relaxThr(thrForward,  r));
		var facesizeBad = outsideRange(sFaceSize, relaxThr(thrFaceSize, r));
		var headposBad  = outsideRange(sHeadPos,  relaxThr(thrHeadPos,  r));

		setMetric("pitch",    !pitchBad,
			haveBaseline ? postureEMA.pitch.toFixed(1)  + "° (Δ" + fmtDelta(sPitch,  1, "°") + ")" : postureEMA.pitch.toFixed(1) + "° (no baseline)",
			sPitch, thrPitch);
		setMetric("forward",  !forwardBad,
			haveBaseline ? postureEMA.forward.toFixed(3) + " (Δ" + fmtDelta(sForward, 3, "")  + ")" : postureEMA.forward.toFixed(3) + " (no baseline)",
			sForward, thrForward);
		setMetric("facesize", !facesizeBad,
			haveBaseline ? postureEMA.faceWidth.toFixed(0) + "px (Δ" + fmtDelta(sFaceSize * 100, 1, "%") + ")" : postureEMA.faceWidth.toFixed(0) + "px (no baseline)",
			sFaceSize, thrFaceSize);
		setMetric("headpos",  !headposBad,
			haveBaseline ? "Δ" + fmtDelta(sHeadPos * 100, 1, "%") + " of face width" : "(no baseline)",
			sHeadPos, thrHeadPos);
		setMetric("shoulder", null, "Not yet available");

		if (els.baselineValue) {
			if (haveBaseline) {
				els.baselineValue.textContent =
					"pitch " + postureBaseline.pitch.toFixed(1) + "°, " +
					"forward " + postureBaseline.forward.toFixed(3) + ", " +
					"faceW " + postureBaseline.faceWidth.toFixed(0) + "px, " +
					"eyesY " + postureBaseline.eyesY.toFixed(0) + "px (manual)";
			} else {
				els.baselineValue.textContent = "not set — sit straight and click \"Use current as neutral\"";
			}
		}

		if (!haveBaseline) {
			setLight("idle", "Waiting for calibration — click \"Use current as neutral\"");
			postureAboveSince = 0;
			return;
		}

		var snoozed = isSnoozed();
		if (snoozed) updateSnoozeButton(); // refresh countdown in button text

		var slouching = pitchBad || forwardBad || facesizeBad || headposBad;
		if (slouching) {
			if (!postureAboveSince) postureAboveSince = now;
			var held = now - postureAboveSince;
			var reasons = [];
			if (pitchBad)    reasons.push("tilt " + fmtDelta(postureEMA.pitch - postureBaseline.pitch, 1, "°"));
			if (forwardBad)  reasons.push("forward " + fmtDelta(postureEMA.forward - postureBaseline.forward, 3, ""));
			if (facesizeBad) reasons.push("size " + fmtDelta((postureEMA.faceWidth - postureBaseline.faceWidth) / postureBaseline.faceWidth * 100, 1, "%"));
			if (headposBad)  reasons.push("pos " + fmtDelta(postureEMA.eyesY - postureBaseline.eyesY, 0, "px"));
			var reason = reasons.join(", ");
			if (held >= POSTURE_HOLD_MS) {
				if (snoozed) {
					setLight("idle", "Snoozed — would alarm (" + reason + ")");
				} else {
					setLight("bad", "Slouching (" + reason + ")");
					if (postureEnabled && now - postureLastAlertAt >= POSTURE_BEEP_INTERVAL_MS) {
						postureLastAlertAt = now;
						postureBeep();
					}
				}
			} else {
				setLight("warn", "Borderline (" + reason + ")");
			}
		} else {
			postureAboveSince = 0;
			postureLastAlertAt = 0;
			setLight("ok", snoozed ? "Good posture (snoozed)" : "Good posture");
		}
	}

	// -------------------------------------------------------------------------
	// Public API
	// -------------------------------------------------------------------------
	function getHTML() {
		return ''
+ '<div class="tracky-mouse-posture-section">'
+ '	<div class="tracky-mouse-posture-heading-row">'
+ '		<div class="tracky-mouse-posture-heading">Posture Monitor</div>'
+ '		<div class="tracky-mouse-posture-enable-row">'
+ '			<input type="checkbox" id="tracky-mouse-posture-enabled" checked/>'
+ '			<label for="tracky-mouse-posture-enabled">Enable alert</label>'
+ '		</div>'
+ '	</div>'
+ ''
+ '	<div class="tracky-mouse-posture-group">'
+ '		<div class="tracky-mouse-posture-indicator" aria-live="polite">'
+ '			<div class="tracky-mouse-posture-light" data-state="idle"></div>'
+ '			<div class="tracky-mouse-posture-status-text">Waiting for face...</div>'
+ '		</div>'
+ '		<div class="tracky-mouse-posture-snooze-row">'
+ '			<label class="tracky-mouse-posture-snooze-label">'
+ '				Snooze for <input type="number" min="1" max="120" step="1" class="tracky-mouse-posture-snooze-input" title="Minutes to silence the alerts"> min'
+ '			</label>'
+ '			<button type="button" class="tracky-mouse-posture-snooze-btn" title="Silence alerts for the configured number of minutes. Click again to cancel.">Snooze</button>'
+ '		</div>'
+ '	</div>'
+ ''
+ '	<div class="tracky-mouse-posture-group">'
+ '		<h4 class="tracky-mouse-posture-group-title">Baseline (neutral pose)</h4>'
+ '		<div class="tracky-mouse-posture-baseline-row">'
+ '			<span class="tracky-mouse-posture-baseline-value">not set</span>'
+ '		</div>'
+ '		<div class="tracky-mouse-posture-buttons">'
+ '			<button type="button" class="tracky-mouse-posture-calibrate-button" title="Snapshot current pose as your neutral reference">Use current as neutral</button>'
+ '			<button type="button" class="tracky-mouse-posture-reset-button" title="Clear baseline and re-learn">Reset baseline</button>'
+ '		</div>'
+ '	</div>'
+ ''
+ '	<div class="tracky-mouse-posture-group">'
+ '		<h4 class="tracky-mouse-posture-group-title">Live metrics</h4>'
+ '		<div class="tracky-mouse-posture-metrics">'
+ metricWidgetHTML("pitch",    "Head tilt (pitch)",                      "30",   "°", "1", "0.5",   "Low Δ: ",  "High Δ: ")
+ metricWidgetHTML("forward",  "Head forward/back",                      "0.30", "",  "3", "0.005", "Low Δ: ",  "High Δ: ")
+ metricWidgetHTML("facesize", "Distance to camera",                     "0.30", "%", "1", "1",     "Low Δ%: ", "High Δ%: ")
+ metricWidgetHTML("headpos",  "Head vertical drop (% of face width)",   "1.0",  "%", "1", "5",     "Low Δ%: ", "High Δ%: ")
+ '			<div class="tracky-mouse-posture-metric tracky-mouse-posture-metric-simple" data-metric="shoulder">'
+ '				<div class="tracky-mouse-posture-metric-header">'
+ '					<span class="tracky-mouse-posture-metric-mark">–</span>'
+ '					<span class="tracky-mouse-posture-metric-name">Shoulder tilt</span>'
+ '					<span class="tracky-mouse-posture-metric-value">Not yet available</span>'
+ '				</div>'
+ '			</div>'
+ '		</div>'
+ '	</div>'
+ ''
+ '	<div class="tracky-mouse-posture-group">'
+ '		<h4 class="tracky-mouse-posture-group-title">Sensitivity</h4>'
+ '		<label class="tracky-mouse-control-row tracky-mouse-posture-global-row">'
+ '			<span>Global multiplier</span>'
+ '			<span class="tracky-mouse-labeled-slider">'
+ '				<input type="range" min="0" max="100" value="50" class="tracky-mouse-posture-threshold">'
+ '				<span class="tracky-mouse-min-label">Strict (×0.5)</span>'
+ '				<span class="tracky-mouse-max-label">Lenient (×2)</span>'
+ '			</span>'
+ '		</label>'
+ '		<div class="tracky-mouse-posture-buttons">'
+ '			<button type="button" class="tracky-mouse-posture-save-defaults-button" title="Save current thresholds (Low/High + global multiplier) as your personal defaults. Restore button uses these.">Save current as my defaults</button>'
+ '			<button type="button" class="tracky-mouse-posture-restore-defaults-button" title="Restore thresholds to your saved defaults (or built-in defaults if you haven\'t saved any)">Restore defaults</button>'
+ '		</div>'
+ '	</div>'
+ ''
+ '	<details class="tracky-mouse-posture-debug-section">'
+ '		<summary>Debug tools</summary>'
+ '		<div class="tracky-mouse-posture-buttons">'
+ '			<button type="button" class="tracky-mouse-posture-debug-button" title="Save labeled samples + last 60s of metrics to posture-debug-log.json in the project folder">Save debug log</button>'
+ '		</div>'
+ '		<div class="tracky-mouse-posture-buttons">'
+ '			<button type="button" class="tracky-mouse-posture-mark-good-button" title="Click while sitting in a GOOD posture to capture a labeled sample">Mark: good posture</button>'
+ '			<button type="button" class="tracky-mouse-posture-mark-bad-button" title="Click while SLOUCHING to capture a labeled sample">Mark: bad posture</button>'
+ '			<span class="tracky-mouse-posture-mark-count">good: 0 / bad: 0</span>'
+ '		</div>'
+ '	</details>'
+ '</div>';
	}

	function metricWidgetHTML(metric, label, range, unit, digits, step, lowLabel, highLabel) {
		return ''
+ '			<div class="tracky-mouse-posture-metric" data-metric="' + metric + '" data-range="' + range + '" data-unit="' + unit + '" data-digits="' + digits + '">'
+ '				<div class="tracky-mouse-posture-metric-header">'
+ '					<span class="tracky-mouse-posture-metric-mark">–</span>'
+ '					<span class="tracky-mouse-posture-metric-name">' + label + '</span>'
+ '					<span class="tracky-mouse-posture-metric-value">–</span>'
+ '				</div>'
+ '				<div class="tracky-mouse-posture-bar">'
+ '					<div class="tracky-mouse-posture-bar-zone tracky-mouse-posture-bar-low"></div>'
+ '					<div class="tracky-mouse-posture-bar-zone tracky-mouse-posture-bar-ok"></div>'
+ '					<div class="tracky-mouse-posture-bar-zone tracky-mouse-posture-bar-high"></div>'
+ '					<div class="tracky-mouse-posture-bar-marker"></div>'
+ '				</div>'
+ '				<div class="tracky-mouse-posture-thr-row">'
+ '					<label>' + lowLabel  + '<input type="number" step="' + step + '" class="tracky-mouse-posture-thr-low" data-metric="' + metric + '"></label>'
+ '					<label>' + highLabel + '<input type="number" step="' + step + '" class="tracky-mouse-posture-thr-high" data-metric="' + metric + '"></label>'
+ '				</div>'
+ '			</div>';
	}

	function init(opts) {
		container    = opts.container;
		setOptionsFn = opts.setOptions || function () { };

		els.checkbox       = container.querySelector("#tracky-mouse-posture-enabled");
		els.slider         = container.querySelector(".tracky-mouse-posture-threshold");
		els.light          = container.querySelector(".tracky-mouse-posture-light");
		els.statusText     = container.querySelector(".tracky-mouse-posture-status-text");
		els.baselineValue  = container.querySelector(".tracky-mouse-posture-baseline-value");
		els.calibrateBtn   = container.querySelector(".tracky-mouse-posture-calibrate-button");
		els.resetBtn       = container.querySelector(".tracky-mouse-posture-reset-button");
		els.debugBtn       = container.querySelector(".tracky-mouse-posture-debug-button");
		els.markGoodBtn    = container.querySelector(".tracky-mouse-posture-mark-good-button");
		els.markBadBtn     = container.querySelector(".tracky-mouse-posture-mark-bad-button");
		els.markCount      = container.querySelector(".tracky-mouse-posture-mark-count");
		els.saveDefaultsBtn    = container.querySelector(".tracky-mouse-posture-save-defaults-button");
		els.restoreDefaultsBtn = container.querySelector(".tracky-mouse-posture-restore-defaults-button");
		els.snoozeInput = container.querySelector(".tracky-mouse-posture-snooze-input");
		els.snoozeBtn   = container.querySelector(".tracky-mouse-posture-snooze-btn");
		els.snoozeInput.value = postureSnoozeMinutes;
		els.metrics = {
			pitch:    buildMetricEl("pitch"),
			forward:  buildMetricEl("forward"),
			facesize: buildMetricEl("facesize"),
			headpos:  buildMetricEl("headpos"),
			shoulder: buildMetricEl("shoulder"),
		};

		populateThrInputs();
		wireThrInputs();

		els.checkbox.onchange = function (event) {
			postureEnabled = els.checkbox.checked;
			if (event) saveSettings();
		};
		els.slider.onchange = function (event) {
			postureThreshold = Number(els.slider.value);
			if (event) saveSettings();
		};
		els.calibrateBtn.onclick = function () {
			if (postureEMA.pitch == null || postureEMA.forward == null || postureEMA.faceWidth == null || postureEMA.eyesY == null) {
				els.statusText.textContent = "No face detected yet — cannot calibrate.";
				return;
			}
			postureManualBaseline = {
				pitch:     postureEMA.pitch,
				forward:   postureEMA.forward,
				faceWidth: postureEMA.faceWidth,
				eyesY:     postureEMA.eyesY,
			};
			postureAboveSince = 0;
			postureLastAlertAt = 0;
			saveSettings();
			els.calibrateBtn.textContent = "Saved!";
			setTimeout(function () { els.calibrateBtn.textContent = "Use current as neutral"; }, 2000);
		};
		els.resetBtn.onclick = function () {
			postureManualBaseline = null;
			postureBaseline = null;
			postureAboveSince = 0;
			postureLastAlertAt = 0;
			postureLabeledSamples = [];
			updateMarkCount();
			saveSettings();
		};
		els.saveDefaultsBtn.onclick = function () {
			postureUserDefaults = {
				thresholds: cloneThresholds(postureThresholds),
				globalMultiplier: postureThreshold,
			};
			saveSettings();
			els.saveDefaultsBtn.textContent = "Saved!";
			setTimeout(function () { els.saveDefaultsBtn.textContent = "Save current as my defaults"; }, 1500);
		};
		els.restoreDefaultsBtn.onclick = function () {
			var src = postureUserDefaults || POSTURE_BUILTIN_DEFAULTS;
			postureThresholds = cloneThresholds(src.thresholds);
			postureThreshold = src.globalMultiplier;
			els.slider.value = postureThreshold;
			populateThrInputs();
			saveSettings();
			els.restoreDefaultsBtn.textContent = postureUserDefaults ? "Restored your defaults" : "Restored built-in defaults";
			setTimeout(function () { els.restoreDefaultsBtn.textContent = "Restore defaults"; }, 2000);
		};
		els.snoozeInput.onchange = function () {
			var v = parseInt(els.snoozeInput.value, 10);
			if (isNaN(v) || v < 1) v = 1;
			if (v > 120) v = 120;
			els.snoozeInput.value = v;
			postureSnoozeMinutes = v;
			saveSettings();
		};
		els.snoozeBtn.onclick = function () {
			if (isSnoozed()) {
				postureSnoozeUntil = 0; // cancel
			} else {
				var mins = parseInt(els.snoozeInput.value, 10);
				if (isNaN(mins) || mins < 1) mins = postureSnoozeMinutes;
				postureSnoozeUntil = performance.now() + mins * 60000;
			}
			updateSnoozeButton();
		};
		els.markGoodBtn.onclick = function () {
			captureLabeled("good", els.markGoodBtn, "Mark: good posture");
		};
		els.markBadBtn.onclick = function () {
			captureLabeled("bad", els.markBadBtn, "Mark: bad posture");
		};
		els.debugBtn.onclick = async function () {
			var payload = {
				now: new Date().toISOString(),
				baseline: postureBaseline,
				manualBaseline: postureManualBaseline,
				thresholdSlider: postureThreshold,
				labeledSamples: postureLabeledSamples,
				continuousSamples: postureDebugBuffer,
			};
			var text = JSON.stringify(payload, null, 2);
			var reset = function () {
				setTimeout(function () { els.debugBtn.textContent = "Save debug log"; }, 3000);
			};
			if (window.electronAPI && typeof window.electronAPI.savePostureDebugLog === "function") {
				try {
					var result = await window.electronAPI.savePostureDebugLog(text);
					if (result && result.success) {
						els.debugBtn.textContent = "Saved: " + result.path;
					} else {
						els.debugBtn.textContent = "Save failed: " + (result && result.error);
					}
				} catch (e) {
					els.debugBtn.textContent = "Save error: " + e.message;
				}
				reset();
				return;
			}
			try {
				await navigator.clipboard.writeText(text);
				els.debugBtn.textContent = "Copied to clipboard";
			} catch (e) {
				console.log("TrackyMouse posture debug log:\n" + text);
				els.debugBtn.textContent = "See DevTools console";
			}
			reset();
		};
	}

	function loadSettings(globalSettings) {
		if (!globalSettings || globalSettings.postureMonitor === undefined) return;
		var pm = globalSettings.postureMonitor || {};
		if (pm.enabled !== undefined) {
			postureEnabled = !!pm.enabled;
			if (els.checkbox) els.checkbox.checked = postureEnabled;
		}
		if (pm.threshold !== undefined) {
			postureThreshold = pm.threshold;
			if (els.slider) els.slider.value = postureThreshold;
		}
		var b = pm.manualBaselineV3;
		if (b && typeof b.pitch === "number" && typeof b.forward === "number" && typeof b.faceWidth === "number" && typeof b.eyesY === "number") {
			postureManualBaseline = { pitch: b.pitch, forward: b.forward, faceWidth: b.faceWidth, eyesY: b.eyesY };
		} else {
			postureManualBaseline = null;
		}
		if (pm.thresholdsV5 && typeof pm.thresholdsV5 === "object") {
			["pitch", "forward", "faceSize", "eyesY"].forEach(function (k) {
				var t = pm.thresholdsV5[k];
				if (t && typeof t.low === "number" && typeof t.high === "number") {
					postureThresholds[k] = { low: t.low, high: t.high };
				}
			});
			if (container) populateThrInputs();
		}
		if (pm.userDefaultsV5 && typeof pm.userDefaultsV5 === "object" && pm.userDefaultsV5.thresholds) {
			postureUserDefaults = {
				thresholds: cloneThresholds(pm.userDefaultsV5.thresholds),
				globalMultiplier: typeof pm.userDefaultsV5.globalMultiplier === "number" ? pm.userDefaultsV5.globalMultiplier : 50,
			};
		} else {
			postureUserDefaults = null;
		}
		if (typeof pm.snoozeMinutes === "number" && pm.snoozeMinutes > 0) {
			postureSnoozeMinutes = Math.min(120, Math.round(pm.snoozeMinutes));
			if (els.snoozeInput) els.snoozeInput.value = postureSnoozeMinutes;
		}
	}

	window.PostureMonitor = {
		getHTML: getHTML,
		init: init,
		update: detect,
		loadSettings: loadSettings,
		getSettings: getSettingsPayload,
	};
})();
