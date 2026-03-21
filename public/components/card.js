```javascript
const Card = {
  stat(config) {
    const { label = '', value = '—', type = null, suffix = '' } = config;
    const valueClass = type ? `stat-value ${type}` : 'stat-value';
    return `
      <div class="stat-card">
        <div class="stat-label">${Utils.escaparHTML(label)}</div>
        <div class="${valueClass}">${Utils.escaparHTML(String(value))}${suffix ? `<span class="text-sm text-secondary"> ${suffix}</span>` : ''}</div>
      </div>
    `;
  },
  
  statsGrid(stats) {
    return `<div class="stats-grid">${stats.map(s => this.stat(s)).join('')}</div>`;
  }
};

window.Card = Card;
```
