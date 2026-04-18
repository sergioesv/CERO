const Filters = {
  render({ containerId, onFilterChange, defaultState = 'todos', states = [], dateValues = {}, searchPlaceholder = 'Placa...' }) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let statesHtml = '';
    if (states.length > 0) {
      statesHtml = '<div class="flex gap-sm">';
      states.forEach(state => {
        const isSelected = state.value === defaultState;
        const btnClass = isSelected ? (state.colorClass || 'btn-primary') : 'btn-secondary';
        statesHtml += `<button class="btn btn-sm ${btnClass}" data-testid="filtro-estado-${state.value}" onclick="Filters._handleStateChange('${containerId}', '${state.value}', this)">${Utils.escaparHTML(state.label)}</button>`;
      });
      statesHtml += '</div>';
    }

    const html = `
      <div class="filters-row">
        <div class="flex gap-sm items-center">
          <label class="text-xs text-secondary">Desde</label>
          <input type="date" class="input input-sm" id="${containerId}-desde" data-testid="filtro-desde" value="${dateValues.desde || ''}" style="width:140px;">
          <label class="text-xs text-secondary">Hasta</label>
          <input type="date" class="input input-sm" id="${containerId}-hasta" data-testid="filtro-hasta" value="${dateValues.hasta || ''}" style="width:140px;">
        </div>
        <div class="search-box" style="min-width:130px;max-width:160px;">
          <input type="text" class="input input-sm" placeholder="${Utils.escaparHTML(searchPlaceholder)}" data-testid="filtro-busqueda" id="${containerId}-busqueda" value="${Utils.escaparHTML(dateValues.busqueda || '')}" style="text-transform:uppercase;">
        </div>
        ${statesHtml}
      </div>
    `;

    container.innerHTML = html;
    this._instances = this._instances || {};
    this._instances[containerId] = { onFilterChange, states };

    document.getElementById(`${containerId}-desde`).addEventListener('change', (e) => {
      onFilterChange('desde', e.target.value);
    });
    
    document.getElementById(`${containerId}-hasta`).addEventListener('change', (e) => {
      onFilterChange('hasta', e.target.value);
    });

    document.getElementById(`${containerId}-busqueda`).addEventListener('input', Utils.debounce((e) => {
      onFilterChange('busqueda', e.target.value.toUpperCase());
    }, 400));
  },

  _handleStateChange(containerId, value, btnElement) {
    const instance = this._instances[containerId];
    if (!instance) return;

    const buttons = btnElement.parentElement.querySelectorAll('button');
    buttons.forEach(btn => btn.className = 'btn btn-sm btn-secondary');
    
    const stateConfig = instance.states.find(s => s.value === value);
    if (stateConfig) {
      btnElement.className = `btn btn-sm ${stateConfig.colorClass || 'btn-primary'}`;
    }

    instance.onFilterChange('estado', value);
  }
};

window.Filters = Filters;
