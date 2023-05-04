function renderHello() {
  const template = document.getElementById('template').innerHTML;
  const rendered = Mustache.render(template, { name: 'CHENJI' });
  document.getElementById('target').innerHTML = rendered;
}
