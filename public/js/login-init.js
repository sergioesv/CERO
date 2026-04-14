// Redirección si ya hay sesión activa
if (sessionStorage.getItem('cero_token')) {
  window.location.replace('/panel');
}
