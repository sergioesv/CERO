// Toggle mostrar/ocultar contraseña
var toggleBtn = document.getElementById('toggle-pass');
var passInput = document.getElementById('password');
var iconHide = document.getElementById('icon-hide');
var iconShow = document.getElementById('icon-show');

toggleBtn.addEventListener('click', function () {
  var visible = passInput.type === 'text';
  passInput.type = visible ? 'password' : 'text';
  iconHide.style.display = visible ? '' : 'none';
  iconShow.style.display = visible ? 'none' : '';
  toggleBtn.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
});

// Login
var form = document.getElementById('form-login');
var btn = document.getElementById('btn-submit');
var errorMsg = document.getElementById('error-msg');

form.addEventListener('submit', async function (e) {
  e.preventDefault();
  errorMsg.classList.remove('visible');
  btn.disabled = true;
  btn.textContent = 'Ingresando…';

  var email = document.getElementById('email').value.trim();
  var password = document.getElementById('password').value;

  try {
    var res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    });
    var data = await res.json();

    if (res.ok && data.token) {
      sessionStorage.setItem('cero_token', data.token);
      // Transición animada hacia el panel
      CeroTransitions.ir('/panel#dashboard');
    } else {
      errorMsg.classList.add('visible');
      btn.disabled = false;
      btn.textContent = 'Iniciar sesión';
    }
  } catch (err) {
    errorMsg.classList.add('visible');
    btn.disabled = false;
    btn.textContent = 'Iniciar sesión';
  }
});
