```javascript
const Toast = {
  show(message, duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'toast-out 200ms ease forwards';
      setTimeout(() => toast.remove(), 200);
    }, duration);
  },
  
  success(message) { this.show('✓ ' + message); },
  error(message) { this.show('✗ ' + message); }
};

window.Toast = Toast;
```
