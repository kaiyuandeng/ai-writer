export class FocusMode {
  private active = false;
  private indicator: HTMLElement;

  constructor() {
    // Create focus indicator dot
    this.indicator = document.createElement('div');
    this.indicator.className = 'focus-indicator';
    document.body.appendChild(this.indicator);

    // Keyboard shortcut: Cmd+Shift+F to toggle, Escape to exit
    document.addEventListener('keydown', (e) => {
      if (e.metaKey && e.shiftKey && e.key === 'f') {
        e.preventDefault();
        this.toggle();
      }
      if (e.key === 'Escape' && this.active) {
        e.preventDefault();
        this.exit();
      }
    });
  }

  toggle() {
    if (this.active) {
      this.exit();
    } else {
      this.enter();
    }
  }

  enter() {
    this.active = true;
    document.body.classList.add('focus-mode');
    window.dispatchEvent(new CustomEvent('focus:change', { detail: { active: true } }));
  }

  exit() {
    this.active = false;
    document.body.classList.remove('focus-mode');
    window.dispatchEvent(new CustomEvent('focus:change', { detail: { active: false } }));
  }

  isActive(): boolean {
    return this.active;
  }
}
