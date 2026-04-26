/*
 * EmpireX Slots — slot-machine game.
 * Originally derived from a CodePen pen by Dario Corsi (AXyxpp, MIT
 * license — see ../license.txt). Heavily modified for EmpireX:
 *   - Two symbol sets switchable via tabs ("Fun" / "More Fun")
 *   - EmpireX prize messages
 *   - Save-as-PNG export on win (uses html2canvas) with branded top bar
 *   - Audio (background music + per-prize sound effects)
 *   - Dev mode (?dev=1) for testing each prize outcome without spinning
 */

var _createClass = function () {function defineProperties(target, props) {for (var i = 0; i < props.length; i++) {var descriptor = props[i];descriptor.enumerable = descriptor.enumerable || false;descriptor.configurable = true;if ("value" in descriptor) descriptor.writable = true;Object.defineProperty(target, descriptor.key, descriptor);}}return function (Constructor, protoProps, staticProps) {if (protoProps) defineProperties(Constructor.prototype, protoProps);if (staticProps) defineProperties(Constructor, staticProps);return Constructor;};}();
function _classCallCheck(instance, Constructor) {if (!(instance instanceof Constructor)) {throw new TypeError("Cannot call a class as a function");}}
function _possibleConstructorReturn(self, call) {if (!self) {throw new ReferenceError("this hasn't been initialised - super() hasn't been called");}return call && (typeof call === "object" || typeof call === "function") ? call : self;}
function _inherits(subClass, superClass) {if (typeof superClass !== "function" && superClass !== null) {throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);}subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } });if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass;}

// Index = `endValue` recorded when all 3 rows match. Index 3 = no match.
//
// Note on ordering: the visible cell at the center of the viewport when
// the reels stop is NOT the same as the row's `value`. Because of the
// keyframe background-position offsets:
//   value 0 ends with cell 0 (symbol A) centered
//   value 1 ends with cell 2 (symbol C) centered
//   value 2 ends with cell 1 (symbol B) centered
// Prize messages are arranged so the message shown matches the SYMBOL
// the user sees: symbol A = top, symbol B = mid, symbol C = low.
var PRIZE_MESSAGES = [
  'Cx',                // value 0 -> shows symbol A (top prize)
  'Nick White wins',   // value 1 -> shows symbol C (low prize)
  '400',               // value 2 -> shows symbol B (mid prize)
  'LOSER'              // index 3 -> no match
];
var NO_PRIZE_INDEX = 3;
// Audio element id per prize index. window.playSound() looks these up.
var SOUND_IDS = ['sound-cx', 'sound-nickwhite', 'sound-400', 'sound-loser'];

var App = function (_React$Component) {_inherits(App, _React$Component);
  function App() {_classCallCheck(this, App);var _this = _possibleConstructorReturn(this, (App.__proto__ || Object.getPrototypeOf(App)).call(this));

    _this.state = {
      rows: [
        { name: 'top',    index: 0, value: 0, endValue: 0, speed: 200, isRunning: true, key: Math.random(), direction: 'ltr' },
        { name: 'center', index: 1, value: 0, endValue: 0, speed: 200, isRunning: true, key: Math.random(), direction: 'rtl' },
        { name: 'bottom', index: 2, value: 0, endValue: 0, speed: 200, isRunning: true, key: Math.random(), direction: 'ltr' } ],
      prize: NO_PRIZE_INDEX,
      activeRowIndex: 0 };

    _this.handleClick = _this.handleClick.bind(_this);
    _this.updateActiveRow = _this.updateActiveRow.bind(_this);
    _this.setEndValue = _this.setEndValue.bind(_this);
    _this.setRotatingValue = _this.setRotatingValue.bind(_this);
    _this.cancelInterval = _this.cancelInterval.bind(_this);
    _this.resetGame = _this.resetGame.bind(_this);
    _this.determinePrize = _this.determinePrize.bind(_this);

    document.body.addEventListener('click', _this.handleClick);
    window.addEventListener('keydown', _this.handleClick);

    // Expose the App instance so the dev panel can force prize states
    // without going through a real spin.
    window.__app = _this;
    return _this;
  }

  _createClass(App, [
    { key: 'handleClick', value: function handleClick(e) {
      // For pointer events, ignore presses on tabs / bookhockeys link /
      // mute / save / dev so they can do their own thing without also
      // spinning. Key events always spin regardless of which element
      // has focus.
      var isKey = e && (e.type === 'keydown' || e.type === 'keypress');
      if (e && !isKey && e.target && e.target.closest) {
        if (e.target.closest('.tabs') || e.target.closest('.game-bookhockeys') ||
            e.target.closest('.save-btn') || e.target.closest('.audio-controls') ||
            e.target.closest('.dev-panel')) {
          return;
        }
      }
      var index = this.state.activeRowIndex;
      if (index < this.state.rows.length) {
        this.cancelInterval(index);
        this.setEndValue(index, this.state.rows[index].value);
        this.determinePrize();
        // Play woosh on each reel-stop tap.
        if (typeof window.playWoosh === 'function') window.playWoosh();
      }
      this.updateActiveRow();
    }},
    { key: 'updateActiveRow', value: function updateActiveRow() {
      if (this.state.activeRowIndex < this.state.rows.length) {
        this.setState({ activeRowIndex: this.state.activeRowIndex + 1 });
      } else {
        this.resetGame();
      }
    }},
    { key: 'determinePrize', value: function determinePrize() {
      var endValues = this.state.rows.map(function (row) { return row.endValue; });
      var prize = endValues[0];
      endValues.forEach(function (v) { if (v !== endValues[0]) { prize = NO_PRIZE_INDEX; } });
      this.setState({ prize: prize });
    }},
    { key: 'resetGame', value: function resetGame() {
      var rows = this.state.rows.map(function (row) {
        row.key = Math.random();
        row.isRunning = true;
        return row;
      });
      this.setState({ rows: rows, activeRowIndex: 0, prize: NO_PRIZE_INDEX });
    }},
    { key: 'setRotatingValue', value: function setRotatingValue(index, value) {
      var rows = this.state.rows;
      rows[index].value = value;
      this.setState({ rows: rows });
    }},
    { key: 'setEndValue', value: function setEndValue(index, value) {
      var rows = this.state.rows;
      rows[index].endValue = value;
      this.setState({ rows: rows });
    }},
    { key: 'cancelInterval', value: function cancelInterval(index) {
      var rows = this.state.rows;
      rows[index].isRunning = false;
      this.setState({ rows: rows });
    }},
    { key: 'render', value: function render() {
      var rows = this.state.rows.map(function (row) {
        return React.createElement(Row, {
          name: row.name,
          index: row.index,
          data: this.state,
          setEndValue: this.setEndValue,
          setRotatingValue: this.setRotatingValue,
          isRunning: row.isRunning,
          speed: row.speed,
          key: row.key,
          direction: row.direction
        });
      }, this);

      return React.createElement('div', { ref: 'game' },
        React.createElement('div', { className: 'viewport' },
          React.createElement('div', { className: 'game' },
            React.createElement('div', { className: 'rows' }, rows)),
          React.createElement(Results, {
            shown: this.state.activeRowIndex === 3,
            prize: this.state.prize
          })));
    }}
  ]);
  return App;
}(React.Component);


var Row = function (_React$Component2) {_inherits(Row, _React$Component2);
  function Row() {_classCallCheck(this, Row);var _this2 = _possibleConstructorReturn(this, (Row.__proto__ || Object.getPrototypeOf(Row)).call(this));
    _this2.state = { value: 0 };
    _this2.counterIntervalFunction = _this2.counterIntervalFunction.bind(_this2);
    _this2.clearCounterInterval = _this2.clearCounterInterval.bind(_this2);
    return _this2;
  }
  _createClass(Row, [
    { key: 'componentWillMount', value: function componentWillMount() {
      var interval = setInterval(this.counterIntervalFunction, this.props.speed);
      this.setState({ interval: interval });
    }},
    { key: 'counterIntervalFunction', value: function counterIntervalFunction() {
      if (this.props.isRunning && this.props.direction === 'ltr') {
        var v = this.state.value < 2 ? this.state.value + 1 : 0;
        this.setState({ value: v });
        this.props.setRotatingValue(this.props.index, this.state.value);
      } else if (this.props.isRunning && this.props.direction === 'rtl') {
        var v2 = this.state.value > 0 ? this.state.value - 1 : 2;
        this.setState({ value: v2 });
        this.props.setRotatingValue(this.props.index, this.state.value);
      } else {
        this.clearCounterInterval();
      }
    }},
    { key: 'clearCounterInterval', value: function clearCounterInterval() {
      clearInterval(this.state.interval);
    }},
    { key: 'render', value: function render() {
      var activeClass = this.props.index === this.props.data.activeRowIndex ? 'active' : '';
      var columnsClassList = 'columns columns-' + this.props.name;
      var style;
      if (this.props.isRunning) {
        // Spinning — let the keyframe animation drive background-position.
        var animation = this.props.direction + '-transition-' + this.state.value;
        style = { animationName: animation, animationDuration: this.props.speed + 'ms' };
      } else {
        // Stopped — kill the animation and pin background-position to the
        // end of the cycle that was running when the row stopped. Makes
        // the visible cell deterministic (avoids html2canvas mid-animation
        // capture) and matches the recorded endValue (so visual matches
        // line up with prize logic).
        // End-of-cycle positions per direction (from the keyframes):
        //   ltr-V end: (V + 1) * 33.3333 vw       [33.3, 66.6, 100]
        //   rtl-V end: -2 * (V + 1) * 33.3333 vw  [-66.6, -133.3, -200]
        var endV = this.props.data.rows[this.props.index].endValue;
        var pos = this.props.direction === 'ltr'
          ? ((endV + 1) * 33.3333) + 'vw'
          : (-2 * (endV + 1) * 33.3333) + 'vw';
        style = { animationName: 'none', backgroundPosition: pos };
      }

      return React.createElement('div', { className: 'row ' + activeClass },
        React.createElement('div', { className: columnsClassList, style: style },
          React.createElement('div', { className: 'column' }),
          React.createElement('div', { className: 'column' }),
          React.createElement('div', { className: 'column' })));
    }}
  ]);
  return Row;
}(React.Component);


var Results = function (_React$Component3) {_inherits(Results, _React$Component3);
  function Results() {_classCallCheck(this, Results);var _this3 = _possibleConstructorReturn(this, (Results.__proto__ || Object.getPrototypeOf(Results)).call(this));
    _this3.handleSave = _this3.handleSave.bind(_this3);
    return _this3;
  }
  _createClass(Results, [
    { key: 'componentDidUpdate', value: function componentDidUpdate(prevProps) {
      // Play sound effect once when the result panel transitions in.
      if (this.props.shown && !prevProps.shown && typeof window.playSound === 'function') {
        window.playSound(this.props.prize);
      }
    }},
    { key: 'handleSave', value: function handleSave(e) {
      if (e) { e.stopPropagation(); }
      if (typeof html2canvas !== 'function') {
        console.warn('html2canvas not loaded');
        return;
      }
      // Capture the body but inject a branded top bar + hide the chrome
      // (tabs, mute toggle, dev panel, helper, save button) only inside
      // the cloned document — original page is untouched.
      html2canvas(document.body, {
        backgroundColor: '#000000',
        useCORS: true,
        logging: false,
        onclone: function (clonedDoc) {
          // Add a branded purple top bar with the URL.
          var bar = clonedDoc.createElement('div');
          bar.style.cssText = [
            'position:fixed', 'top:0', 'left:0', 'right:0',
            'height:60px',
            'background:#8E5CCB',
            'display:flex', 'align-items:center', 'justify-content:center',
            'color:#fff',
            "font-family:'VT323',monospace",
            'font-size:1.8rem',
            'letter-spacing:0.2em',
            'z-index:1000',
            'box-shadow:0 2px 8px rgba(0,0,0,0.4)'
          ].join(';');
          bar.textContent = 'OUREMPIREX.COM/GAME';
          clonedDoc.body.insertBefore(bar, clonedDoc.body.firstChild);

          // Hide bits that don't belong in a screenshot
          ['.tabs', '.audio-controls', '.dev-panel', '.helper', '.save-btn',
           '.game-url', '.game-version'].forEach(function (sel) {
            var el = clonedDoc.querySelector(sel);
            if (el) el.style.display = 'none';
          });
        }
      }).then(function (canvas) {
        var link = document.createElement('a');
        var ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        link.download = 'empirex-slots-' + ts + '.png';
        link.href = canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    }},
    { key: 'render', value: function render() {
      var shown = this.props.shown ? 'shown' : '';
      var prize = this.props.prize;
      var isLoser = prize === NO_PRIZE_INDEX;
      var classList = 'results ' + shown + (isLoser ? ' lost' : '');

      var children = [
        React.createElement('div', { key: 'msg' }, PRIZE_MESSAGES[prize])
      ];
      if (this.props.shown && !isLoser) {
        children.push(
          React.createElement('button', {
            key: 'save',
            className: 'save-btn',
            type: 'button',
            onClick: this.handleSave
          }, 'Save as PNG')
        );
      }

      return React.createElement('div', { className: classList }, children);
    }}
  ]);
  return Results;
}(React.Component);


// ---- Tab switcher (vanilla JS, sits outside React) ----
(function () {
  var tabs = document.querySelectorAll('.tabs .tab');
  if (!tabs.length) return;
  Array.prototype.forEach.call(tabs, function (tab) {
    tab.addEventListener('click', function (e) {
      e.stopPropagation();
      var setName = tab.getAttribute('data-set');
      document.body.classList.remove('set-fun', 'set-more-fun');
      document.body.classList.add('set-' + setName);
      Array.prototype.forEach.call(tabs, function (t) { t.classList.remove('is-active'); });
      tab.classList.add('is-active');
    });
  });
})();


// ---- Audio: volume slider + mute toggle + per-event playback ----
// Drop your own audio files into game/audio/ to enable sound. If a file
// is missing, the audio element silently does nothing — game still works.
(function () {
  var muted = localStorage.getItem('empirex-slots-muted') !== '0'; // muted by default
  var savedVol = parseFloat(localStorage.getItem('empirex-slots-bg-volume'));
  var bgVolume = isNaN(savedVol) ? 0.5 : Math.max(0, Math.min(1, savedVol));

  var btn = document.getElementById('mute-toggle');
  var slider = document.getElementById('bg-volume');
  var bgMusic = document.getElementById('bg-music');

  function applyMute() {
    if (btn) btn.classList.toggle('is-muted', muted);
    var els = document.querySelectorAll('audio');
    Array.prototype.forEach.call(els, function (a) { a.muted = muted; });
  }

  function applyBgVolume() {
    if (bgMusic) bgMusic.volume = bgVolume;
    if (slider) slider.value = Math.round(bgVolume * 100);
  }

  applyMute();
  applyBgVolume();

  // Browsers block autoplay until first user interaction. Try to start
  // bg-music on first click/keydown.
  function startMusic() {
    document.removeEventListener('click', startMusic);
    document.removeEventListener('keydown', startMusic);
    if (bgMusic && !muted) {
      bgMusic.play().catch(function () {});
    }
  }
  document.addEventListener('click', startMusic);
  document.addEventListener('keydown', startMusic);

  if (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      muted = !muted;
      localStorage.setItem('empirex-slots-muted', muted ? '1' : '0');
      applyMute();
      if (!muted && bgMusic) bgMusic.play().catch(function () {});
    });
  }

  if (slider) {
    slider.addEventListener('input', function (e) {
      e.stopPropagation();
      bgVolume = parseFloat(slider.value) / 100;
      localStorage.setItem('empirex-slots-bg-volume', String(bgVolume));
      applyBgVolume();
      // Adjusting the slider while muted -> auto-unmute (familiar UX).
      if (muted && bgVolume > 0) {
        muted = false;
        localStorage.setItem('empirex-slots-muted', '0');
        applyMute();
        if (bgMusic) bgMusic.play().catch(function () {});
      }
    });
  }

  // Called from <Results> when the result panel transitions in.
  window.playSound = function (prize) {
    if (muted) return;
    var id = SOUND_IDS[prize];
    if (!id) return;
    var sound = document.getElementById(id);
    if (sound) {
      try { sound.currentTime = 0; } catch (_) {}
      sound.play().catch(function () {});
    }
  };

  // Called from App.handleClick on each reel-stop tap.
  window.playWoosh = function () {
    if (muted) return;
    var sound = document.getElementById('sound-woosh');
    if (sound) {
      try { sound.currentTime = 0; } catch (_) {}
      sound.play().catch(function () {});
    }
  };
})();


// ---- Dev mode (?dev=1 in URL) ----
// Buttons to force each prize outcome without spinning. Useful for
// testing the win sounds, the PNG export, and the LOSER copy.
(function () {
  var params = new URLSearchParams(window.location.search);
  if (params.get('dev') !== '1') return;

  var panel = document.getElementById('dev-panel');
  if (!panel) return;
  panel.removeAttribute('hidden');

  panel.addEventListener('click', function (e) {
    e.stopPropagation();
    var btn = e.target.closest && e.target.closest('button[data-prize]');
    if (!btn) return;
    var prize = btn.getAttribute('data-prize');
    if (!window.__app) return;

    if (prize === 'reset') {
      window.__app.resetGame();
      return;
    }

    var rows = window.__app.state.rows;
    if (prize === 'loser') {
      // Mismatched values guarantee no-match.
      rows[0].endValue = 0;
      rows[1].endValue = 1;
      rows[2].endValue = 2;
    } else {
      var v = parseInt(prize, 10);
      rows[0].endValue = v;
      rows[1].endValue = v;
      rows[2].endValue = v;
    }
    rows.forEach(function (r) { r.isRunning = false; });

    var prizeIdx = (prize === 'loser') ? NO_PRIZE_INDEX : parseInt(prize, 10);
    window.__app.setState({
      rows: rows,
      activeRowIndex: 3,
      prize: prizeIdx
    });
  });
})();


// Render the app
ReactDOM.render(
  React.createElement(App, null),
  document.querySelector('.app')
);
