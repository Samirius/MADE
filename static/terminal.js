// Ace Terminal — minimal PTY-like terminal in the browser
// Communicates with server via WebSocket for command execution

class AceTerminal {
  constructor(container, opts = {}) {
    this.container = container;
    this.history = [];
    this.historyIdx = -1;
    this.onCommand = opts.onCommand || (() => {});
    this.cwd = opts.cwd || '~';
    this.prompt = opts.prompt || `$ ${this.cwd} `;
    this.lines = [];

    this.el = document.createElement('div');
    this.el.className = 'ace-term';
    this.el.innerHTML = `
      <div class="term-bar">
        <span class="term-title">Terminal</span>
        <div class="term-controls">
          <button onclick="this.closest('.ace-term').querySelector('.term-body').innerHTML='';this.closest('.ace-term').querySelector('.term-input').focus()">Clear</button>
        </div>
      </div>
      <div class="term-body"></div>
      <div class="term-input-row">
        <span class="term-prompt">$</span>
        <input class="term-input" type="text" spellcheck="false" autocomplete="off" autofocus>
      </div>
    `;
    container.appendChild(this.el);

    this.body = this.el.querySelector('.term-body');
    this.input = this.el.querySelector('.term-input');

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const cmd = this.input.value;
        this.history.push(cmd);
        this.historyIdx = this.history.length;
        this.addLine(`${this.prompt}${cmd}`, 'term-cmd');
        this.input.value = '';
        this.onCommand(cmd);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.historyIdx > 0) { this.historyIdx--; this.input.value = this.history[this.historyIdx]; }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.historyIdx < this.history.length - 1) { this.historyIdx++; this.input.value = this.history[this.historyIdx]; }
        else { this.historyIdx = this.history.length; this.input.value = ''; }
      }
    });
  }

  addLine(text, cls = '') {
    const line = document.createElement('div');
    line.className = `term-line ${cls}`;
    line.textContent = text;
    this.body.appendChild(line);
    this.body.scrollTop = this.body.scrollHeight;
  }

  addOutput(text) {
    const lines = text.split('\n');
    lines.forEach(l => this.addLine(l, 'term-out'));
  }

  addError(text) {
    const lines = text.split('\n');
    lines.forEach(l => this.addLine(l, 'term-err'));
  }

  focus() { this.input.focus(); }
}
