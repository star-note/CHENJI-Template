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

// 过滤所有 HTML 标签，主要用于生成纯文本的文章简介
function filterHtml(html) {
  return html.replace(/<[^<>]+>/g, '');
}
// 匹配出 html 中所有的图片 src
function getImgSrc(html) {
  const imgReg = /<img.*?(?:>|\/>)/gi; //匹配图片中的img标签
  const srcReg = /src=[\'\"]?([^\'\"]*)[\'\"]?/i; // 匹配图片中的src
  const arr = html.match(imgReg); //筛选出所有的img
  // 存放所有图片的src
  const srcArr = [];
  if (arr && arr.length > 0) {
    for (let i = 0; i < arr.length; i++) {
      const src = arr[i].match(srcReg);
      // 获取图片地址
      srcArr.push(src[1]);
    }
  }

  return srcArr === [] ? null : srcArr;
}