const Drawer = {
  _getContainer() {
    let container = document.getElementById('global-drawer-container');
    if (!container) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="global-drawer-container">
          <div class="drawer-backdrop" id="global-drawer-backdrop" onclick="Drawer.close()"></div>
          <div class="drawer" id="global-drawer-panel">
            <div class="drawer-header">
              <h3 class="drawer-title" id="global-drawer-title"></h3>
              <button class="modal-close" onclick="Drawer.close()">&times;</button>
            </div>
            <div class="drawer-body" id="global-drawer-content" style="padding:0;"></div>
          </div>
        </div>
      `);
      container = document.getElementById('global-drawer-container');
    }
    return container;
  },

  open({ title = 'Detalle', content = '', width = '780px' }) {
    this._getContainer();
    const titleEl = document.getElementById('global-drawer-title');
    const contentEl = document.getElementById('global-drawer-content');
    const panel = document.getElementById('global-drawer-panel');
    const backdrop = document.getElementById('global-drawer-backdrop');

    titleEl.textContent = title;
    contentEl.innerHTML = content;
    panel.style.width = `min(${width}, 95vw)`;

    requestAnimationFrame(() => {
      backdrop.classList.add('active');
      panel.classList.add('active');
      panel.classList.add('open');
    });

    // Remover listener previo si existiera para evitar duplicados
    document.removeEventListener('keydown', this.handleEscape);
    document.addEventListener('keydown', this.handleEscape);
  },

  setLoading(title = 'Cargando...') {
    this.open({
      title: title,
      content: '<div style="padding:40px;text-align:center;"><span class="text-secondary">Cargando detalle...</span></div>'
    });
  },

  close() {
    const backdrop = document.getElementById('global-drawer-backdrop');
    const panel = document.getElementById('global-drawer-panel');
    if (backdrop) backdrop.classList.remove('active');
    if (panel) {
      panel.classList.remove('active');
      panel.classList.remove('open');
    }
    document.removeEventListener('keydown', this.handleEscape);
  },

  handleEscape(e) {
    if (e.key === 'Escape') Drawer.close();
  }
};

window.Drawer = Drawer;
