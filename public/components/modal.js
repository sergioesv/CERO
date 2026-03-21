const Modal = {
  current: null,
  
  open(config) {
    const { title = '', content = '', footer = null, size = 'md' } = config;
    const container = document.getElementById('modal-container');
    if (!container) return;
    
    const sizes = { sm: '360px', md: '500px', lg: '700px' };
    
    container.innerHTML = `
      <div class="modal-backdrop" onclick="Modal.handleBackdropClick(event)">
        <div class="modal" style="max-width:${sizes[size]}">
          <div class="modal-header">
            <h2 class="modal-title">${Utils.escaparHTML(title)}</h2>
            <button class="modal-close" onclick="Modal.close()">&times;</button>
          </div>
          <div class="modal-body">${content}</div>
          ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
        </div>
      </div>
    `;
    
    requestAnimationFrame(() => container.querySelector('.modal-backdrop').classList.add('active'));
    document.addEventListener('keydown', this.handleEscape);
  },
  
  close() {
    const container = document.getElementById('modal-container');
    const backdrop = container?.querySelector('.modal-backdrop');
    if (backdrop) {
      backdrop.classList.remove('active');
      setTimeout(() => container.innerHTML = '', 200);
    }
    document.removeEventListener('keydown', this.handleEscape);
  },
  
  handleBackdropClick(e) { if (e.target.classList.contains('modal-backdrop')) Modal.close(); },
  handleEscape(e) { if (e.key === 'Escape') Modal.close(); },
  
  confirm(config) {
    const { title = '¿Confirmar?', message = '', confirmText = 'Confirmar', cancelText = 'Cancelar', type = 'primary' } = config;
    return new Promise(resolve => {
      this.open({
        title,
        content: `<p>${Utils.escaparHTML(message)}</p>`,
        size: 'sm',
        footer: `
          <button class="btn btn-secondary" onclick="Modal.close(); Modal._resolve(false);">${cancelText}</button>
          <button class="btn btn-${type}" onclick="Modal.close(); Modal._resolve(true);">${confirmText}</button>
        `
      });
      this._resolve = resolve;
    });
  }
};

window.Modal = Modal;
