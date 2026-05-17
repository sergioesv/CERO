const Table = {
  render(config) {
    const { columns = [], data = [], emptyMessage = 'No hay datos', rowClass = null, sticky = false } = config;
    const lastIdx = columns.length - 1;

    if (data.length === 0) {
      return `
        <div class="table-container">
          <table class="table">
            <thead><tr>${columns.map((c, i) => `<th${sticky && i === lastIdx ? ' class="th-sticky"' : ''}>${c.label}</th>`).join('')}</tr></thead>
            <tbody><tr><td colspan="${columns.length}" style="text-align:center;padding:32px;"><span class="text-secondary">${emptyMessage}</span></td></tr></tbody>
          </table>
        </div>
      `;
    }

    const rows = data.map(row => {
      const cls = rowClass ? rowClass(row) : '';
      const cells = columns.map((col, i) => {
        let val = row[col.key];
        if (col.render) val = col.render(val, row);
        else val = Utils.escaparHTML(String(val ?? '—'));
        return `<td${sticky && i === lastIdx ? ' class="td-sticky"' : ''}>${val}</td>`;
      }).join('');
      return `<tr class="${cls}">${cells}</tr>`;
    }).join('');

    return `
      <div class="table-container">
        <table class="table">
          <thead><tr>${columns.map((c, i) => `<th${sticky && i === lastIdx ? ' class="th-sticky"' : ''} style="${c.width ? 'width:' + c.width : ''}">${c.label}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }
};

window.Table = Table;
