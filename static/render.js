// 渲染主函数
function render(data) {
  const rendered = Mustache.render(window.template, data);
  document.getElementById('target').innerHTML = rendered;
}

// 加载静态资源公共函数
function loadScript(path) {
  return new Promise(function (res) {
    const script = document.createElement('script');
    script.src = path;
    document.body.append(script);
    script.onload = function () {
      res();
    };
  });
}
function loadCss(path) {
  const css = document.createElement('link');
  css.href = path;
  css.rel = 'stylesheet';
  document.head.append(css);
}

// 逻辑主入口，每一个模板需要实现 loadData 的主入口
function onLoad() {
  const templatePath = 'static/templates/' + window.TEMPTYPE + '/index.js';
  loadScript(templatePath).then(function () {
    loadData().then(function (data) {
      console.log('dataSource: ', data);
      render(data);
    }); // 加载所有数据后渲染
  }); // 加载模板
}
