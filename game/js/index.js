/*
 * EmpireX Slots — slot-machine game.
 * Originally derived from a CodePen pen by Dario Corsi (AXyxpp, MIT
 * license — see ../license.txt). Heavily modified for EmpireX:
 *   - Two symbol sets switchable via tabs ("Fun" / "More Fun")
 *   - EmpireX prize messages
 *   - Save-as-PNG export on win (uses html2canvas)
 */

var _createClass = function () {function defineProperties(target, props) {for (var i = 0; i < props.length; i++) {var descriptor = props[i];descriptor.enumerable = descriptor.enumerable || false;descriptor.configurable = true;if ("value" in descriptor) descriptor.writable = true;Object.defineProperty(target, descriptor.key, descriptor);}}return function (Constructor, protoProps, staticProps) {if (protoProps) defineProperties(Constructor.prototype, protoProps);if (staticProps) defineProperties(Constructor, staticProps);return Constructor;};}();
function _classCallCheck(instance, Constructor) {if (!(instance instanceof Constructor)) {throw new TypeError("Cannot call a class as a function");}}
function _possibleConstructorReturn(self, call) {if (!self) {throw new ReferenceError("this hasn't been initialised - super() hasn't been called");}return call && (typeof call === "object" || typeof call === "function") ? call : self;}
function _inherits(subClass, superClass) {if (typeof superClass !== "function" && superClass !== null) {throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);}subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } });if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass;}

// Index 0 / 1 / 2 = winning prize messages (tap landed on the same value
// across all 3 rows). Index 3 = "no match" message.
var PRIZE_MESSAGES = ['Cx', '400', 'Nick White wins', 'LOSER'];
var NO_PRIZE_INDEX = 3;

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

    // 'click' fires for both desktop mouse and mobile tap. iOS Safari
    // additionally needs body to have cursor:pointer for click to fire
    // on non-button elements (handled in style.css).
    document.body.addEventListener('click', _this.handleClick);
    // 'keydown' instead of deprecated 'keypress' (which doesn't fire for
    // some keys in modern browsers).
    window.addEventListener('keydown', _this.handleClick);
    return _this;
  }

  _createClass(App, [
    { key: 'handleClick', value: function handleClick(e) {
      // For pointer events, ignore presses on tabs / bookhockeys link /
      // save button so they can do their own thing without also spinning.
      // Key events always spin regardless of which element has focus.
      var isKey = e && (e.type === 'keydown' || e.type === 'keypress');
      if (e && !isKey && e.target && e.target.closest) {
        if (e.target.closest('.tabs') || e.target.closest('.game-bookhockeys') || e.target.closest('.save-btn')) {
          return;
        }
      }
      var index = this.state.activeRowIndex;
      if (index < this.state.rows.length) {
        this.cancelInterval(index);
        this.setEndValue(index, this.state.rows[index].value);
        this.determinePrize();
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
        // end of the cycle that was running when the row stopped. This
        // makes the visible cell deterministic (no mid-animation snapshot
        // captured by html2canvas during Save-as-PNG, which was the bug
        // where the saved image didn't show the win lined up).
        var endV = this.props.data.rows[this.props.index].endValue;
        var pos = this.props.direction === 'ltr'
          ? ((endV + 1) * 33.3333) + 'vw'
          : (-(endV + 2) * 33.3333) + 'vw';
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
    { key: 'handleSave', value: function handleSave(e) {
      if (e) { e.stopPropagation(); }
      if (typeof html2canvas !== 'function') {
        console.warn('html2canvas not loaded');
        return;
      }
      // Capture body so the URL caption + version line at the bottom are included.
      html2canvas(document.body, {
        backgroundColor: '#000000',
        useCORS: true,
        logging: false
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


// Render the app
ReactDOM.render(
  React.createElement(App, null),
  document.querySelector('.app')
);
